import csv
import io
import re
from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from app.activity import incident_activity_type
from app.api.deps import CurrentUser, DbSession, require_roles
from app.models import (
    Address,
    AuditLog,
    ClosureArea,
    ClosureAreaAddress,
    ClosureScenario,
    Incident,
    PlannedShutdown,
    PlannedShutdownAddress,
    PlannedShutdownClosureArea,
    PlannedShutdownIncident,
    PlannedShutdownValve,
    PublicStatus,
    User,
    Valve,
)
from app.schemas.incident import UserOption
from app.schemas.planned_shutdown import (
    AddressPatch,
    BulkInformedPatch,
    ClosureAreaResponse,
    IncidentSelection,
    LinkedIncidentSummary,
    ManualAddressAdd,
    ShutdownAddressResponse,
    ShutdownCreate,
    ShutdownDetail,
    ShutdownPatch,
    ShutdownSummary,
    ValveResponse,
    ValveSelection,
    ShutdownStatus,
)

router = APIRouter(prefix="/planned-shutdowns", tags=["planned shutdowns"])
EditorUser = Annotated[User, Depends(require_roles("admin", "board_member"))]
TRANSITIONS = {
    "draft": {"cancelled"},
    "planned": {"cancelled"},
    "in_progress": set(),
    "completed": set(),
    "cancelled": set(),
}


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _user(user: User | None) -> UserOption | None:
    return UserOption(id=user.id, display_name=user.display_name, email=user.email) if user else None


def _effective_status(shutdown: PlannedShutdown, now: datetime | None = None) -> str:
    if shutdown.status in ("draft", "completed", "cancelled"):
        return shutdown.status
    now = now or datetime.now(timezone.utc)
    if shutdown.expected_end_at and _utc(shutdown.expected_end_at) <= now:
        return "completed"
    if _utc(shutdown.starts_at) <= now:
        return "in_progress"
    return "planned"


def _summary(shutdown: PlannedShutdown, now: datetime | None = None) -> ShutdownSummary:
    included = [link for link in shutdown.address_links if link.deleted_at is None and link.included]
    return ShutdownSummary(
        id=shutdown.id,
        number=shutdown.number,
        title=shutdown.title,
        activity_type="shutdown",
        status=_effective_status(shutdown, now),
        starts_at=shutdown.starts_at,
        expected_end_at=shutdown.expected_end_at,
        created_by=_user(shutdown.created_by),
        assigned_to=_user(shutdown.assigned_to),
        contractor=shutdown.contractor,
        valve_count=sum(link.deleted_at is None for link in shutdown.valve_links),
        affected_address_count=len(included),
        informed_address_count=sum(link.informed for link in included),
        updated_at=shutdown.updated_at,
    )


def _detail(shutdown: PlannedShutdown) -> ShutdownDetail:
    addresses = sorted(
        (link for link in shutdown.address_links if link.deleted_at is None),
        key=lambda link: (
            link.address.street_name.casefold(), link.address.house_number.casefold(), str(link.address_id)
        ),
    )
    return ShutdownDetail(
        **_summary(shutdown).model_dump(),
        description=shutdown.description,
        valves=[
            ValveResponse(id=link.valve.id, code=link.valve.code)
            for link in sorted(
                (link for link in shutdown.valve_links if link.deleted_at is None),
                key=lambda link: link.valve.code.casefold(),
            )
        ],
        closure_areas=[
            ClosureAreaResponse(id=link.closure_area.id, name=link.closure_area.name)
            for link in sorted(
                (link for link in shutdown.area_links if link.deleted_at is None),
                key=lambda link: link.closure_area.name.casefold(),
            )
        ],
        addresses=[
            ShutdownAddressResponse(
                id=link.address.id,
                street_name=link.address.street_name,
                house_number=link.address.house_number,
                postal_code=link.address.postal_code,
                city=link.address.city,
                source=link.source,
                included=link.included,
                informed=link.informed,
                informed_at=link.informed_at,
                informed_by=_user(link.informed_by),
            )
            for link in addresses
        ],
        incidents=[
            LinkedIncidentSummary(
                id=link.incident.id,
                number=link.incident.number,
                title=link.incident.title,
                type=link.incident.type,
                status=link.incident.status,
                activity_type=incident_activity_type(link.incident.type),
            )
            for link in sorted(shutdown.incident_links, key=lambda item: item.incident.number)
            if link.deleted_at is None and link.incident.deleted_at is None
        ],
    )


async def _shutdown_or_404(db: DbSession, shutdown_id: UUID) -> PlannedShutdown:
    shutdown = await db.scalar(
        select(PlannedShutdown)
        .options(
            selectinload(PlannedShutdown.incident_links).selectinload(PlannedShutdownIncident.incident)
        )
        .where(PlannedShutdown.id == shutdown_id, PlannedShutdown.deleted_at.is_(None))
        .execution_options(populate_existing=True)
    )
    if not shutdown:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Planned shutdown not found")
    return shutdown


async def _next_number(db: DbSession, year: int) -> str:
    if db.bind and db.bind.dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": year * 10 + 4})
    numbers = (
        await db.scalars(select(PlannedShutdown.number).where(PlannedShutdown.number.like(f"LUK-{year}-%")))
    ).all()
    sequence = max(
        (int(match.group(1)) for value in numbers if (match := re.fullmatch(rf"LUK-{year}-(\d{{4}})", value))),
        default=0,
    ) + 1
    if sequence > 9999:
        raise HTTPException(status.HTTP_409_CONFLICT, "Shutdown number range exhausted for this year")
    return f"LUK-{year}-{sequence:04d}"


async def _validate_valves(db: DbSession, valve_ids: list[UUID]) -> list[Valve]:
    unique_ids = set(valve_ids)
    valves = (
        await db.scalars(
            select(Valve).where(
                Valve.id.in_(unique_ids), Valve.deleted_at.is_(None)
            )
        )
    ).all()
    if len(valves) != len(unique_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "One or more valves are unavailable")
    return valves


async def _validate_incidents(db: DbSession, incident_ids: list[UUID]) -> list[Incident]:
    unique_ids = set(incident_ids)
    incidents = (await db.scalars(
        select(Incident).where(Incident.id.in_(unique_ids), Incident.deleted_at.is_(None))
    )).all()
    if len(incidents) != len(unique_ids):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "One or more incidents are unavailable")
    return incidents


async def _validate_assignee(db: DbSession, user_id: UUID | None) -> User | None:
    if user_id is None:
        return None
    user = await db.scalar(
        select(User).where(User.id == user_id, User.is_active.is_(True), User.deleted_at.is_(None))
    )
    if not user:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assigned user is not active")
    return user


def _validate_transition(previous: str, next_status: str) -> None:
    if next_status != previous and next_status not in TRANSITIONS[previous]:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Invalid shutdown status transition from {previous} to {next_status}",
        )


async def _recalculate(db: DbSession, shutdown: PlannedShutdown, user: User) -> None:
    valve_ids = [link.valve_id for link in shutdown.valve_links if link.deleted_at is None]
    area_ids: set[UUID] = set()
    if valve_ids:
        selected_valves = set(valve_ids)
        scenarios = (await db.scalars(
            select(ClosureScenario)
            .options(selectinload(ClosureScenario.area_links), selectinload(ClosureScenario.valve_links))
            .where(ClosureScenario.deleted_at.is_(None), ClosureScenario.active.is_(True))
        )).unique().all()
        candidate_area_ids = {
            link.closure_area_id
            for scenario in scenarios
            if (required := {link.valve_id for link in scenario.valve_links if link.deleted_at is None})
            and required.issubset(selected_valves)
            for link in scenario.area_links if link.deleted_at is None
        }
        if candidate_area_ids:
            area_ids = set((await db.scalars(select(ClosureArea.id).where(
                ClosureArea.id.in_(candidate_area_ids), ClosureArea.deleted_at.is_(None), ClosureArea.active.is_(True)
            ))).all())

    for link in list(shutdown.area_links):
        if link.deleted_at is None and link.closure_area_id not in area_ids:
            await db.delete(link)
    existing_area_ids = {
        link.closure_area_id for link in shutdown.area_links
        if link.deleted_at is None and link.closure_area_id in area_ids
    }
    for area_id in area_ids - existing_area_ids:
        shutdown.area_links.append(PlannedShutdownClosureArea(
            closure_area_id=area_id, updated_by=user.id
        ))

    derived_address_ids: set[UUID] = set()
    if area_ids:
        derived_address_ids = set((await db.scalars(
            select(ClosureAreaAddress.address_id)
            .join(Address, Address.id == ClosureAreaAddress.address_id)
            .where(
                ClosureAreaAddress.closure_area_id.in_(area_ids),
                ClosureAreaAddress.deleted_at.is_(None),
                Address.deleted_at.is_(None),
                Address.active.is_(True),
            )
        )).all())

    existing_addresses = {
        link.address_id: link for link in shutdown.address_links if link.deleted_at is None
    }
    for address_id in derived_address_ids - existing_addresses.keys():
        shutdown.address_links.append(PlannedShutdownAddress(
            address_id=address_id, source="derived", included=True, updated_by=user.id
        ))
    for address_id, link in existing_addresses.items():
        if link.source == "derived" and address_id not in derived_address_ids:
            await db.delete(link)
    shutdown.updated_by = user.id
    await db.flush()


def _audit(db: DbSession, request: Request, user: User, action: str, shutdown: PlannedShutdown,
           old_data: dict | None = None, new_data: dict | None = None) -> None:
    db.add(AuditLog(
        actor_user_id=user.id,
        action=action,
        object_type="planned_shutdown",
        object_id=shutdown.id,
        old_data=old_data,
        new_data=new_data,
        ip_address=_ip(request),
    ))


@router.get("", response_model=list[ShutdownSummary])
async def list_shutdowns(
    db: DbSession,
    user: CurrentUser,
    shutdown_status: Annotated[list[ShutdownStatus], Query(alias="status")] = [],
) -> list[ShutdownSummary]:
    query = select(PlannedShutdown).where(PlannedShutdown.deleted_at.is_(None))
    rows = (await db.scalars(query.order_by(PlannedShutdown.starts_at.desc()))).unique().all()
    now = datetime.now(timezone.utc)
    summaries = [_summary(row, now) for row in rows]
    return [item for item in summaries if not shutdown_status or item.status in shutdown_status]


@router.post("", response_model=ShutdownDetail, status_code=status.HTTP_201_CREATED)
async def create_shutdown(
    payload: ShutdownCreate, request: Request, db: DbSession, user: EditorUser
) -> ShutdownDetail:
    valves = await _validate_valves(db, payload.valve_ids)
    incidents = await _validate_incidents(db, payload.incident_ids)
    assignee = await _validate_assignee(db, payload.assigned_to_id)
    now = datetime.now(timezone.utc)
    shutdown = PlannedShutdown(
        number=await _next_number(db, now.year),
        title=payload.title,
        description=payload.description,
        starts_at=payload.starts_at,
        expected_end_at=payload.expected_end_at,
        assigned_to=assignee,
        contractor=payload.contractor or None,
        created_by=user,
        updated_by=user.id,
        area_links=[],
        address_links=[],
        incident_links=[],
    )
    shutdown.valve_links = [PlannedShutdownValve(valve=valve, updated_by=user.id) for valve in valves]
    shutdown.incident_links = [
        PlannedShutdownIncident(incident=incident, updated_by=user.id) for incident in incidents
    ]
    db.add(shutdown)
    await db.flush()
    await _recalculate(db, shutdown, user)
    _audit(db, request, user, "create", shutdown, new_data={
        "number": shutdown.number, "status": shutdown.status,
        "valve_ids": sorted(str(valve.id) for valve in valves),
        "incident_ids": sorted(str(incident.id) for incident in incidents),
        "assigned_to_id": str(assignee.id) if assignee else None,
        "contractor": shutdown.contractor,
    })
    await db.commit()
    return _detail(await _shutdown_or_404(db, shutdown.id))


@router.get("/{shutdown_id}", response_model=ShutdownDetail)
async def get_shutdown(shutdown_id: UUID, db: DbSession, user: CurrentUser) -> ShutdownDetail:
    return _detail(await _shutdown_or_404(db, shutdown_id))


@router.put("/{shutdown_id}/incidents", response_model=ShutdownDetail)
async def select_incidents(
    shutdown_id: UUID, payload: IncidentSelection, request: Request, db: DbSession, user: EditorUser
) -> ShutdownDetail:
    shutdown = await _shutdown_or_404(db, shutdown_id)
    incidents = await _validate_incidents(db, payload.incident_ids)
    old_ids = sorted(
        str(link.incident_id) for link in shutdown.incident_links if link.deleted_at is None
    )
    for link in list(shutdown.incident_links):
        if link.deleted_at is None:
            await db.delete(link)
    await db.flush()
    shutdown.incident_links = [
        PlannedShutdownIncident(incident=incident, updated_by=user.id) for incident in incidents
    ]
    shutdown.updated_by = user.id
    new_ids = sorted(str(incident.id) for incident in incidents)
    _audit(
        db,
        request,
        user,
        "select_incidents",
        shutdown,
        old_data={"incident_ids": old_ids},
        new_data={"incident_ids": new_ids},
    )
    await db.commit()
    return _detail(await _shutdown_or_404(db, shutdown.id))


@router.patch("/{shutdown_id}", response_model=ShutdownDetail)
async def patch_shutdown(
    shutdown_id: UUID, payload: ShutdownPatch, request: Request, db: DbSession, user: EditorUser
) -> ShutdownDetail:
    shutdown = await _shutdown_or_404(db, shutdown_id)
    changes = payload.model_dump(exclude_unset=True)
    starts_at = payload.starts_at if "starts_at" in changes else shutdown.starts_at
    expected_end_at = payload.expected_end_at if "expected_end_at" in changes else shutdown.expected_end_at
    if expected_end_at and _utc(expected_end_at) < _utc(starts_at):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "expected_end_at must not be before starts_at")
    old_data: dict[str, object] = {}
    new_data: dict[str, object] = {}
    if "status" in changes:
        _validate_transition(shutdown.status, payload.status)
        if payload.status == "cancelled" and shutdown.status != "draft" and _utc(shutdown.starts_at) <= datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_409_CONFLICT, "En igangværende vandlukning kan ikke aflyses")
    if "assigned_to_id" in changes:
        old_data["assigned_to_id"] = str(shutdown.assigned_to_id) if shutdown.assigned_to_id else None
        shutdown.assigned_to = await _validate_assignee(db, payload.assigned_to_id)
        new_data["assigned_to_id"] = str(payload.assigned_to_id) if payload.assigned_to_id else None
    for field in ("title", "description", "status", "starts_at", "expected_end_at", "contractor"):
        if field in changes:
            old_data[field] = str(getattr(shutdown, field))
            value = getattr(payload, field)
            setattr(shutdown, field, value or None if field == "contractor" else value)
            new_data[field] = str(value) if value is not None else None
    shutdown.updated_by = user.id
    if changes.get("status") == "cancelled":
        notice = await db.scalar(select(PublicStatus).where(PublicStatus.planned_shutdown_id == shutdown.id))
        if notice and notice.status in ("draft", "published"):
            notice.status = "withdrawn"
            notice.withdrawn_at = datetime.now(timezone.utc)
            notice.updated_by = user.id
            db.add(AuditLog(
                actor_user_id=user.id,
                action="public_status.withdrawn_by_shutdown_cancellation",
                object_type="public_status",
                object_id=notice.id,
                new_data={"status": "withdrawn"},
                ip_address=_ip(request),
            ))
    _audit(db, request, user, "update", shutdown, old_data=old_data, new_data=new_data)
    await db.commit()
    return _detail(await _shutdown_or_404(db, shutdown.id))


@router.put("/{shutdown_id}/valves", response_model=ShutdownDetail)
async def select_valves(
    shutdown_id: UUID, payload: ValveSelection, request: Request, db: DbSession, user: EditorUser
) -> ShutdownDetail:
    shutdown = await _shutdown_or_404(db, shutdown_id)
    valves = await _validate_valves(db, payload.valve_ids)
    old_ids = sorted(str(link.valve_id) for link in shutdown.valve_links if link.deleted_at is None)
    for link in list(shutdown.valve_links):
        if link.deleted_at is None:
            await db.delete(link)
    await db.flush()
    shutdown.valve_links = [PlannedShutdownValve(valve=valve, updated_by=user.id) for valve in valves]
    await db.flush()
    await _recalculate(db, shutdown, user)
    new_ids = sorted(str(valve.id) for valve in valves)
    _audit(db, request, user, "select_valves", shutdown,
           old_data={"valve_ids": old_ids}, new_data={"valve_ids": new_ids})
    await db.commit()
    return _detail(await _shutdown_or_404(db, shutdown.id))


@router.post("/{shutdown_id}/recalculate", response_model=ShutdownDetail)
async def recalculate(
    shutdown_id: UUID, request: Request, db: DbSession, user: EditorUser
) -> ShutdownDetail:
    shutdown = await _shutdown_or_404(db, shutdown_id)
    await _recalculate(db, shutdown, user)
    _audit(db, request, user, "recalculate", shutdown, new_data={
        "closure_area_count": len([link for link in shutdown.area_links if link.deleted_at is None]),
        "address_count": len([link for link in shutdown.address_links if link.deleted_at is None]),
    })
    await db.commit()
    return _detail(await _shutdown_or_404(db, shutdown.id))


@router.post("/{shutdown_id}/addresses", response_model=ShutdownDetail)
async def add_manual_address(
    shutdown_id: UUID, payload: ManualAddressAdd, request: Request, db: DbSession, user: EditorUser
) -> ShutdownDetail:
    shutdown = await _shutdown_or_404(db, shutdown_id)
    address = await db.scalar(select(Address).where(
        Address.id == payload.address_id, Address.active.is_(True), Address.deleted_at.is_(None)
    ))
    if not address:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Address is unavailable")
    link = next(
        (item for item in shutdown.address_links if item.address_id == address.id and item.deleted_at is None), None
    )
    if link:
        link.source = "manual"
        link.included = True
        link.updated_by = user.id
    else:
        shutdown.address_links.append(PlannedShutdownAddress(
            address=address, source="manual", included=True, updated_by=user.id
        ))
    shutdown.updated_by = user.id
    _audit(db, request, user, "add_address", shutdown, new_data={"address_id": str(address.id)})
    await db.commit()
    return _detail(await _shutdown_or_404(db, shutdown.id))


@router.patch("/{shutdown_id}/addresses/informed", response_model=ShutdownDetail)
async def set_bulk_informed(
    shutdown_id: UUID, payload: BulkInformedPatch, request: Request, db: DbSession, user: EditorUser
) -> ShutdownDetail:
    shutdown = await _shutdown_or_404(db, shutdown_id)
    requested = set(payload.address_ids) if payload.address_ids is not None else None
    links = [
        link for link in shutdown.address_links
        if link.deleted_at is None and ((link.address_id in requested) if requested is not None else link.included)
    ]
    if requested is not None and {link.address_id for link in links} != requested:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "One or more addresses are not on the shutdown")
    now = datetime.now(timezone.utc) if payload.informed else None
    for link in links:
        link.informed = payload.informed
        link.informed_at = now
        link.informed_by = user if payload.informed else None
        link.updated_by = user.id
    shutdown.updated_by = user.id
    _audit(db, request, user, "set_informed", shutdown, new_data={
        "informed": payload.informed, "address_ids": sorted(str(link.address_id) for link in links),
    })
    await db.commit()
    return _detail(await _shutdown_or_404(db, shutdown.id))


@router.patch("/{shutdown_id}/addresses/{address_id}", response_model=ShutdownDetail)
async def patch_address(
    shutdown_id: UUID, address_id: UUID, payload: AddressPatch, request: Request,
    db: DbSession, user: EditorUser,
) -> ShutdownDetail:
    shutdown = await _shutdown_or_404(db, shutdown_id)
    link = next(
        (item for item in shutdown.address_links if item.address_id == address_id and item.deleted_at is None), None
    )
    if not link:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shutdown address not found")
    changes = payload.model_dump(exclude_unset=True)
    old_data = {field: getattr(link, field) for field in changes}
    if "included" in changes:
        link.included = payload.included
    if "informed" in changes:
        link.informed = payload.informed
        link.informed_at = datetime.now(timezone.utc) if payload.informed else None
        link.informed_by = user if payload.informed else None
    link.updated_by = user.id
    shutdown.updated_by = user.id
    _audit(db, request, user, "update_address", shutdown,
           old_data={"address_id": str(address_id), **old_data},
           new_data={"address_id": str(address_id), **changes})
    await db.commit()
    return _detail(await _shutdown_or_404(db, shutdown.id))


@router.get("/{shutdown_id}/addresses.csv")
async def export_addresses(shutdown_id: UUID, db: DbSession, user: CurrentUser) -> Response:
    shutdown = await _shutdown_or_404(db, shutdown_id)
    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter=";", lineterminator="\r\n")
    writer.writerow(["Vejnavn", "Husnummer", "Postnummer", "By", "Informeret"])
    links = sorted(
        (link for link in shutdown.address_links if link.deleted_at is None and link.included),
        key=lambda link: (link.address.street_name.casefold(), link.address.house_number.casefold()),
    )
    for link in links:
        writer.writerow([
            link.address.street_name, link.address.house_number, link.address.postal_code,
            link.address.city, "ja" if link.informed else "nej",
        ])
    content = output.getvalue().encode("utf-8-sig")
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{shutdown.number}-adresser.csv"'},
    )
