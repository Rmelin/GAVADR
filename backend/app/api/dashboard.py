from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from pyproj import Transformer
from shapely import wkt
from shapely.geometry import mapping
from shapely.ops import transform, unary_union
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models import Incident, PlannedShutdown

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
to_wgs84 = Transformer.from_crs(25832, 4326, always_xy=True).transform


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _point_feature(entity, geometry, properties: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "Feature",
        "id": str(entity.id),
        "geometry": mapping(transform(to_wgs84, geometry)),
        "properties": {"id": str(entity.id), **properties},
    }


@router.get("/map")
async def dashboard_map(db: DbSession, user: CurrentUser) -> dict[str, Any]:
    incidents = (await db.scalars(select(Incident).where(
        Incident.deleted_at.is_(None), Incident.status.in_(("new", "active"))
    ))).all()
    shutdowns = (await db.scalars(select(PlannedShutdown).where(
        PlannedShutdown.deleted_at.is_(None), PlannedShutdown.status.in_(("planned", "in_progress"))
    ))).unique().all()
    now = datetime.now(timezone.utc)
    features = [
        _point_feature(row, wkt.loads(row.geometry), {
            "kind": "incident", "title": row.title, "status": row.status, "url": f"/haendelser/{row.id}",
        })
        for row in incidents
    ]
    for row in shutdowns:
        if row.expected_end_at is not None and _utc(row.expected_end_at) <= now:
            continue
        geometries = [
            wkt.loads(link.closure_area.geometry) for link in row.area_links
            if link.deleted_at is None and link.closure_area.deleted_at is None
        ]
        if geometries:
            point = unary_union(geometries).representative_point()
        else:
            valve_geometries = [
                wkt.loads(link.valve.geometry) for link in row.valve_links
                if link.deleted_at is None and link.valve.deleted_at is None
            ]
            if not valve_geometries:
                continue
            point = unary_union(valve_geometries).centroid
        effective_status = "in_progress" if _utc(row.starts_at) <= now else "planned"
        features.append(_point_feature(row, point, {
            "kind": "shutdown", "title": row.title, "status": effective_status,
            "url": f"/vandlukninger/{row.id}",
        }))
    return {"type": "FeatureCollection", "features": features}
