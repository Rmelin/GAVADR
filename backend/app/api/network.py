from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from pyproj import Transformer
from shapely import wkt
from shapely.geometry import mapping
from shapely.ops import transform
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, require_roles
from app.models import Address, AuditLog, ClosureArea, ClosureAreaAddress, ClosureScenario, ClosureScenarioArea, ClosureScenarioValve, Inquiry, MapCorrection, Pipe, User, Valve

router = APIRouter(tags=["map data"])
to_wgs84 = Transformer.from_crs(25832, 4326, always_xy=True).transform
MapEditor = Annotated[User, Depends(require_roles("admin", "map_manager"))]


class ClosureScenarioResponse(BaseModel):
    id: UUID
    name: str
    area_ids: list[UUID]
    valve_ids: list[UUID]
    updated_at: datetime


class ClosureScenarioWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    area_ids: list[UUID] = Field(min_length=1, max_length=50)
    valve_ids: list[UUID] = Field(min_length=1, max_length=50)
    expected_updated_at: datetime | None = None


class ClosureAreaRelations(BaseModel):
    closure_area_id: UUID
    valve_ids: list[UUID]
    scenarios: list[ClosureScenarioResponse]
    address_ids: list[UUID]
    candidate_address_ids: list[UUID]


class ClosureAreaRelationsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    address_ids: list[UUID]


class NetworkSummary(BaseModel):
    active_addresses: int
    valves: int
    active_pipes: int
    active_closure_areas: int


def _geometry(wkt_value: str):
    return transform(to_wgs84, wkt.loads(wkt_value))


def _feature(entity, properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": str(entity.id),
        "geometry": mapping(_geometry(entity.geometry)),
        "properties": {"id": str(entity.id), **properties},
    }


def _collection(features: list[dict[str, Any]]) -> dict[str, Any]:
    return {"type": "FeatureCollection", "features": features}


def _common(entity) -> dict[str, Any]:
    return {
        "created_at": entity.created_at,
        "updated_at": entity.updated_at,
        "updated_by": str(entity.updated_by) if entity.updated_by else None,
    }


def _scenario_response(scenario: ClosureScenario) -> ClosureScenarioResponse:
    return ClosureScenarioResponse(
        id=scenario.id,
        name=scenario.name,
        area_ids=sorted((link.closure_area_id for link in scenario.area_links if link.deleted_at is None), key=str),
        valve_ids=sorted((link.valve_id for link in scenario.valve_links if link.deleted_at is None), key=str),
        updated_at=scenario.updated_at,
    )


@router.get("/network-summary", response_model=NetworkSummary)
async def network_summary(db: DbSession, user: CurrentUser) -> NetworkSummary:
    async def count(model, *conditions) -> int:
        return int(await db.scalar(select(func.count(model.id)).where(*conditions)) or 0)

    return NetworkSummary(
        active_addresses=await count(Address, Address.deleted_at.is_(None), Address.active.is_(True)),
        valves=await count(Valve, Valve.deleted_at.is_(None)),
        active_pipes=await count(Pipe, Pipe.deleted_at.is_(None), Pipe.active.is_(True)),
        active_closure_areas=await count(ClosureArea, ClosureArea.deleted_at.is_(None), ClosureArea.active.is_(True)),
    )


@router.get("/addresses")
async def addresses(db: DbSession, user: CurrentUser) -> dict[str, Any]:
    rows = (await db.scalars(
        select(Address).where(Address.deleted_at.is_(None)).order_by(Address.street_name, Address.house_number)
    )).all()
    return _collection(
        [
            _feature(
                row,
                {
                    "external_address_id": row.external_address_id,
                    "street_name": row.street_name,
                    "house_number": row.house_number,
                    "postal_code": row.postal_code,
                    "city": row.city,
                    "active": row.active,
                    "notes": row.notes,
                    **_common(row),
                },
            )
            for row in rows
        ]
    )


@router.get("/valves")
async def valves(db: DbSession, user: CurrentUser) -> dict[str, Any]:
    rows = (await db.scalars(select(Valve).where(Valve.deleted_at.is_(None)).order_by(Valve.code))).all()
    return _collection(
        [
            _feature(
                row,
                {
                    "code": row.code,
                    "valve_type": row.valve_type,
                    "network_level": row.network_level,
                    "normal_position": row.normal_position,
                    "current_position": row.current_position,
                    "status": row.status,
                    "last_operated_at": row.last_operated_at,
                    "last_inspected_at": row.last_inspected_at,
                    "accessibility": row.accessibility,
                    "source": row.source,
                    "quality": row.quality,
                    "notes": row.notes,
                    **_common(row),
                },
            )
            for row in rows
        ]
    )


@router.get("/pipes")
async def pipes(db: DbSession, user: CurrentUser) -> dict[str, Any]:
    rows = (await db.scalars(select(Pipe).where(Pipe.deleted_at.is_(None)).order_by(Pipe.code))).all()
    return _collection(
        [
            _feature(
                row,
                {
                    "code": row.code,
                    "pipe_type": row.pipe_type,
                    "material": row.material,
                    "diameter_mm": row.diameter_mm,
                    "installation_year": row.installation_year,
                    "status": row.status,
                    "active": row.active,
                    "condition": row.condition,
                    "risk_probability": row.risk_probability,
                    "risk_consequence": row.risk_consequence,
                    "source": row.source,
                    "quality": row.quality,
                    "notes": row.notes,
                    **_common(row),
                },
            )
            for row in rows
        ]
    )


@router.get("/closure-areas")
async def closure_areas(db: DbSession, user: CurrentUser) -> dict[str, Any]:
    rows = (await db.scalars(
        select(ClosureArea).options(
            selectinload(ClosureArea.scenario_links).selectinload(ClosureScenarioArea.scenario).selectinload(ClosureScenario.area_links),
            selectinload(ClosureArea.scenario_links).selectinload(ClosureScenarioArea.scenario).selectinload(ClosureScenario.valve_links),
        ).where(ClosureArea.deleted_at.is_(None)).order_by(ClosureArea.name)
    )).unique().all()
    return _collection(
        [
            _feature(
                row,
                {
                    "name": row.name,
                    "description": row.description,
                    "confidence": row.confidence,
                    "active": row.active,
                    "valve_ids": sorted({
                        str(valve_link.valve_id)
                        for area_link in row.scenario_links if area_link.deleted_at is None
                        for scenario in [area_link.scenario] if scenario.deleted_at is None and scenario.active
                        for valve_link in scenario.valve_links if valve_link.deleted_at is None
                    }),
                    "closure_scenarios": [
                        _scenario_response(area_link.scenario).model_dump(mode="json")
                        for area_link in sorted(row.scenario_links, key=lambda item: (item.scenario.created_at, item.scenario.name))
                        if area_link.deleted_at is None and area_link.scenario.deleted_at is None and area_link.scenario.active
                    ],
                    "address_ids": [str(link.address_id) for link in row.address_links if link.deleted_at is None],
                    **_common(row),
                },
            )
            for row in rows
        ]
    )


async def _area_or_404(db: DbSession, area_id: UUID) -> ClosureArea:
    area = await db.scalar(select(ClosureArea).where(ClosureArea.id == area_id, ClosureArea.deleted_at.is_(None)))
    if area is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Closure area not found")
    return area


async def _area_relations(db: DbSession, area: ClosureArea) -> ClosureAreaRelations:
    scenarios = (await db.scalars(select(ClosureScenario).options(
        selectinload(ClosureScenario.area_links), selectinload(ClosureScenario.valve_links)
    ).join(ClosureScenarioArea).where(
        ClosureScenarioArea.closure_area_id == area.id,
        ClosureScenarioArea.deleted_at.is_(None),
        ClosureScenario.deleted_at.is_(None),
        ClosureScenario.active.is_(True),
    ).order_by(ClosureScenario.created_at, ClosureScenario.name))).unique().all()
    address_links = (await db.scalars(select(ClosureAreaAddress).where(
        ClosureAreaAddress.closure_area_id == area.id, ClosureAreaAddress.deleted_at.is_(None)
    ))).all()
    scenario_rows = [_scenario_response(scenario) for scenario in scenarios]
    valve_ids = sorted({valve_id for scenario in scenario_rows for valve_id in scenario.valve_ids}, key=str)
    address_ids = sorted(
        (link.address_id for link in address_links), key=str
    )
    addresses = (await db.scalars(select(Address).where(
        Address.deleted_at.is_(None), Address.active.is_(True)
    ))).all()
    polygon = wkt.loads(area.geometry)
    candidates = sorted(
        (address.id for address in addresses if polygon.covers(wkt.loads(address.geometry))), key=str
    )
    return ClosureAreaRelations(
        closure_area_id=area.id,
        valve_ids=valve_ids,
        scenarios=scenario_rows,
        address_ids=address_ids,
        candidate_address_ids=candidates,
    )


@router.get("/closure-areas/{area_id}/relations", response_model=ClosureAreaRelations)
async def get_closure_area_relations(
    area_id: UUID, db: DbSession, user: MapEditor
) -> ClosureAreaRelations:
    return await _area_relations(db, await _area_or_404(db, area_id))


@router.put("/closure-areas/{area_id}/relations", response_model=ClosureAreaRelations)
async def update_closure_area_relations(
    area_id: UUID,
    payload: ClosureAreaRelationsUpdate,
    request: Request,
    db: DbSession,
    user: MapEditor,
) -> ClosureAreaRelations:
    area = await _area_or_404(db, area_id)
    desired_addresses = set(payload.address_ids)
    addresses = (await db.scalars(select(Address).where(
        Address.id.in_(desired_addresses), Address.deleted_at.is_(None), Address.active.is_(True)
    ))).all() if desired_addresses else []
    if len(addresses) != len(desired_addresses):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "One or more addresses are unavailable")

    address_links = (await db.scalars(select(ClosureAreaAddress).where(
        ClosureAreaAddress.closure_area_id == area.id
    ))).all()
    old_addresses = sorted(str(link.address_id) for link in address_links if link.deleted_at is None)
    now = datetime.now(timezone.utc)

    address_by_id = {link.address_id: link for link in address_links}
    for address_id in desired_addresses:
        link = address_by_id.get(address_id)
        if link:
            link.deleted_at = None
            link.updated_by = user.id
        else:
            db.add(ClosureAreaAddress(closure_area_id=area.id, address_id=address_id, updated_by=user.id))
    for link in address_links:
        if link.address_id not in desired_addresses and link.deleted_at is None:
            link.deleted_at = now
            link.updated_by = user.id

    db.add(AuditLog(
        actor_user_id=user.id,
        action="closure_area.relations_update",
        object_type="closure_area",
        object_id=area.id,
        old_data={"address_ids": old_addresses},
        new_data={"address_ids": sorted(map(str, desired_addresses))},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return await _area_relations(db, await _area_or_404(db, area.id))


async def _scenario_or_404(db: DbSession, scenario_id: UUID) -> ClosureScenario:
    scenario = await db.scalar(select(ClosureScenario).options(
        selectinload(ClosureScenario.area_links), selectinload(ClosureScenario.valve_links)
    ).where(ClosureScenario.id == scenario_id, ClosureScenario.deleted_at.is_(None)))
    if scenario is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Closure scenario not found")
    return scenario


async def _validate_scenario_write(db: DbSession, payload: ClosureScenarioWrite) -> tuple[set[UUID], set[UUID]]:
    area_ids, valve_ids = set(payload.area_ids), set(payload.valve_ids)
    if len(area_ids) != len(payload.area_ids) or len(valve_ids) != len(payload.valve_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Areas and valves must be unique within a scenario")
    areas = (await db.scalars(select(ClosureArea).where(
        ClosureArea.id.in_(area_ids), ClosureArea.deleted_at.is_(None)
    ))).all()
    valves = (await db.scalars(select(Valve).where(
        Valve.id.in_(valve_ids), Valve.deleted_at.is_(None)
    ))).all()
    if len(areas) != len(area_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "One or more closure areas are unavailable")
    if len(valves) != len(valve_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "One or more valves are unavailable")
    return area_ids, valve_ids


def _sync_scenario_links(scenario: ClosureScenario, area_ids: set[UUID], valve_ids: set[UUID], user_id: UUID, now: datetime) -> None:
    areas_by_id = {link.closure_area_id: link for link in scenario.area_links}
    for area_id in area_ids:
        link = areas_by_id.get(area_id)
        if link:
            link.deleted_at = None
            link.updated_by = user_id
        else:
            scenario.area_links.append(ClosureScenarioArea(closure_area_id=area_id, updated_by=user_id))
    for link in scenario.area_links:
        if link.closure_area_id not in area_ids and link.deleted_at is None:
            link.deleted_at = now
            link.updated_by = user_id
    valves_by_id = {link.valve_id: link for link in scenario.valve_links}
    for valve_id in valve_ids:
        link = valves_by_id.get(valve_id)
        if link:
            link.deleted_at = None
            link.updated_by = user_id
        else:
            scenario.valve_links.append(ClosureScenarioValve(valve_id=valve_id, updated_by=user_id))
    for link in scenario.valve_links:
        if link.valve_id not in valve_ids and link.deleted_at is None:
            link.deleted_at = now
            link.updated_by = user_id


@router.get("/closure-scenarios", response_model=list[ClosureScenarioResponse])
async def list_closure_scenarios(
    db: DbSession, user: MapEditor, closure_area_id: UUID | None = None
) -> list[ClosureScenarioResponse]:
    query = select(ClosureScenario).options(
        selectinload(ClosureScenario.area_links), selectinload(ClosureScenario.valve_links)
    ).where(ClosureScenario.deleted_at.is_(None), ClosureScenario.active.is_(True))
    if closure_area_id:
        query = query.join(ClosureScenarioArea).where(
            ClosureScenarioArea.closure_area_id == closure_area_id,
            ClosureScenarioArea.deleted_at.is_(None),
        )
    rows = (await db.scalars(query.order_by(ClosureScenario.name, ClosureScenario.created_at))).unique().all()
    return [_scenario_response(row) for row in rows]


@router.get("/closure-scenarios/{scenario_id}", response_model=ClosureScenarioResponse)
async def get_closure_scenario(scenario_id: UUID, db: DbSession, user: MapEditor) -> ClosureScenarioResponse:
    return _scenario_response(await _scenario_or_404(db, scenario_id))


@router.post("/closure-scenarios", response_model=ClosureScenarioResponse, status_code=status.HTTP_201_CREATED)
async def create_closure_scenario(
    payload: ClosureScenarioWrite, request: Request, db: DbSession, user: MapEditor
) -> ClosureScenarioResponse:
    area_ids, valve_ids = await _validate_scenario_write(db, payload)
    now = datetime.now(timezone.utc)
    scenario = ClosureScenario(name=payload.name.strip(), updated_by=user.id, area_links=[], valve_links=[])
    db.add(scenario)
    await db.flush()
    _sync_scenario_links(scenario, area_ids, valve_ids, user.id, now)
    db.add(AuditLog(
        actor_user_id=user.id, action="closure_scenario.create", object_type="closure_scenario",
        object_id=scenario.id, new_data={"name": scenario.name, "area_ids": sorted(map(str, area_ids)), "valve_ids": sorted(map(str, valve_ids))},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return _scenario_response(await _scenario_or_404(db, scenario.id))


@router.put("/closure-scenarios/{scenario_id}", response_model=ClosureScenarioResponse)
async def update_closure_scenario(
    scenario_id: UUID, payload: ClosureScenarioWrite, request: Request, db: DbSession, user: MapEditor
) -> ClosureScenarioResponse:
    scenario = await _scenario_or_404(db, scenario_id)
    if payload.expected_updated_at and payload.expected_updated_at != scenario.updated_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "Closure scenario was changed by another user")
    area_ids, valve_ids = await _validate_scenario_write(db, payload)
    old = _scenario_response(scenario).model_dump(mode="json")
    now = datetime.now(timezone.utc)
    scenario.name = payload.name.strip()
    scenario.updated_by = user.id
    scenario.updated_at = now
    _sync_scenario_links(scenario, area_ids, valve_ids, user.id, now)
    db.add(AuditLog(
        actor_user_id=user.id, action="closure_scenario.update", object_type="closure_scenario",
        object_id=scenario.id, old_data=old,
        new_data={"name": scenario.name, "area_ids": sorted(map(str, area_ids)), "valve_ids": sorted(map(str, valve_ids))},
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    return _scenario_response(await _scenario_or_404(db, scenario.id))


@router.delete("/closure-scenarios/{scenario_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_closure_scenario(
    scenario_id: UUID, request: Request, db: DbSession, user: MapEditor
) -> None:
    scenario = await _scenario_or_404(db, scenario_id)
    old = _scenario_response(scenario).model_dump(mode="json")
    scenario.deleted_at = datetime.now(timezone.utc)
    scenario.updated_by = user.id
    db.add(AuditLog(
        actor_user_id=user.id, action="closure_scenario.delete", object_type="closure_scenario",
        object_id=scenario.id, old_data=old,
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()


@router.get("/map/search")
async def map_search(
    db: DbSession,
    user: CurrentUser,
    q: str = Query(min_length=1, max_length=100),
) -> list[dict[str, Any]]:
    term = f"%{q.strip()}%"
    if not q.strip():
        return []

    address_rows = (await db.scalars(
        select(Address).where(
            Address.deleted_at.is_(None),
            Address.active.is_(True),
            or_(
                Address.street_name.ilike(term),
                Address.house_number.ilike(term),
                Address.city.ilike(term),
                Address.postal_code.ilike(term),
                Address.external_address_id.ilike(term),
            ),
        ).order_by(Address.street_name, Address.house_number).limit(20)
    )).all()
    valve_rows = (await db.scalars(
        select(Valve).where(Valve.deleted_at.is_(None), Valve.code.ilike(term)).order_by(Valve.code).limit(20)
    )).all()
    pipe_rows = (await db.scalars(
        select(Pipe).where(Pipe.deleted_at.is_(None), Pipe.code.ilike(term)).order_by(Pipe.code).limit(20)
    )).all()
    inquiry_rows = (await db.scalars(
        select(Inquiry).where(Inquiry.deleted_at.is_(None), Inquiry.number.ilike(term),
                              Inquiry.address_id.is_not(None)).limit(20)
    )).unique().all()
    correction_rows = (await db.scalars(
        select(MapCorrection).where(MapCorrection.deleted_at.is_(None),
                                    MapCorrection.number.ilike(term)).limit(20)
    )).all()

    results: list[dict[str, Any]] = []
    for row in address_rows:
        point = _geometry(row.geometry)
        results.append({
            "id": str(row.id), "type": "address", "label": f"{row.street_name} {row.house_number}",
            "subtitle": f"{row.postal_code} {row.city}", "longitude": point.x, "latitude": point.y,
        })
    for row in valve_rows:
        point = _geometry(row.geometry)
        results.append({
            "id": str(row.id), "type": "valve", "label": row.code,
            "subtitle": f"{row.valve_type} | {row.status}", "longitude": point.x, "latitude": point.y,
        })
    for row in pipe_rows:
        point = _geometry(row.geometry).interpolate(0.5, normalized=True)
        details = [row.pipe_type, row.material, f"{row.diameter_mm} mm" if row.diameter_mm else None]
        results.append({
            "id": str(row.id), "type": "pipe", "label": row.code,
            "subtitle": " | ".join(value for value in details if value),
            "longitude": point.x, "latitude": point.y,
        })
    for row in inquiry_rows:
        if row.address:
            point = _geometry(row.address.geometry)
            results.append({
                "id": str(row.id), "type": "inquiry", "label": row.number,
                "subtitle": f"{row.category} | {row.status}", "longitude": point.x, "latitude": point.y,
            })
    for row in correction_rows:
        point = _geometry(row.geometry)
        results.append({
            "id": str(row.id), "type": "map_correction", "label": row.number,
            "subtitle": f"{row.category} | {row.status}", "longitude": point.x, "latitude": point.y,
        })
    return results[:20]
