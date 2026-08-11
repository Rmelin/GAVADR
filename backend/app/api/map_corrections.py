import asyncio
import re
from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from pyproj import Transformer
from shapely import wkt
from shapely.geometry import mapping
from shapely.ops import transform
from sqlalchemy import select, text

from app.api.deps import CurrentUser, DbSession, require_roles
from app.models import (
    AuditLog, Inquiry, MapCorrection, MapCorrectionAttachment, MapCorrectionHistory, Pipe,
    Supplier, User, Valve,
)
from app.schemas.incident import AttachmentResponse, Location, UserOption
from app.schemas.phase5 import (
    CorrectionCreate, CorrectionHistoryResponse, CorrectionPatch, CorrectionResponse,
    CorrectionStatus, CorrectionTransition, Priority, SupplierOption,
)
from app.services.attachment_files import store_upload, stored_path

router = APIRouter(prefix="/map-corrections", tags=["map corrections"])
CreateUser = Annotated[User, Depends(require_roles("admin", "board_member", "map_manager"))]
EditorUser = Annotated[User, Depends(require_roles("admin", "map_manager"))]
to_internal = Transformer.from_crs(4326, 25832, always_xy=True)
to_wgs84_xy = Transformer.from_crs(25832, 4326, always_xy=True)
to_wgs84 = to_wgs84_xy.transform
STAGES = [
    "new", "assessed", "assigned", "sent_to_supplier", "supplier_accepted",
    "work_scheduled", "work_completed", "verified", "closed",
]


def _point(longitude: float, latitude: float) -> str:
    x, y = to_internal.transform(longitude, latitude)
    return f"POINT ({x} {y})"


def _location(value: str) -> Location:
    point = wkt.loads(value)
    longitude, latitude = to_wgs84_xy.transform(point.x, point.y)
    return Location(longitude=longitude, latitude=latitude)


def _user(value: User | None) -> UserOption | None:
    return UserOption(id=value.id, display_name=value.display_name, email=value.email) if value else None


def _response(row: MapCorrection) -> CorrectionResponse:
    return CorrectionResponse(
        id=row.id, number=row.number, title=row.title, description=row.description,
        category=row.category, priority=row.priority, status=row.status, location=_location(row.geometry),
        inquiry_id=row.inquiry_id, pipe_id=row.pipe_id, valve_id=row.valve_id,
        assigned_to=_user(row.assigned_to),
        supplier=SupplierOption(id=row.supplier.id, name=row.supplier.name) if row.supplier else None,
        supplier_reference=row.supplier_reference, supplier_due_at=row.supplier_due_at,
        created_by=_user(row.created_by),
        history=[CorrectionHistoryResponse(
            id=item.id, previous_status=item.previous_status, status=item.status,
            note=item.note, author=_user(item.author), created_at=item.created_at,
        ) for item in row.history],
        attachments=[AttachmentResponse(
            id=item.id, original_filename=item.original_filename, mime_type=item.mime_type,
            size_bytes=item.size_bytes, created_at=item.created_at,
            download_url=f"/api/map-corrections/{row.id}/attachments/{item.id}",
        ) for item in row.attachments if item.deleted_at is None],
        created_at=row.created_at, updated_at=row.updated_at,
    )


async def _get(db: DbSession, correction_id: UUID) -> MapCorrection:
    row = await db.scalar(select(MapCorrection).where(
        MapCorrection.id == correction_id, MapCorrection.deleted_at.is_(None)
    ).execution_options(populate_existing=True))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Map correction not found")
    return row


async def _active_user(db: DbSession, user_id: UUID | None) -> User | None:
    if user_id is None:
        return None
    row = await db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True), User.deleted_at.is_(None)))
    if not row:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assigned user is not active")
    return row


async def _validate_links(db: DbSession, values: dict[str, UUID | None]) -> None:
    checks = (("inquiry_id", Inquiry, "Inquiry"), ("pipe_id", Pipe, "Pipe"),
              ("valve_id", Valve, "Valve"), ("supplier_id", Supplier, "Supplier"))
    for field, model, label in checks:
        value = values.get(field)
        if value and not await db.scalar(select(model.id).where(model.id == value, model.deleted_at.is_(None))):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{label} is unavailable")
    supplier_id = values.get("supplier_id")
    if supplier_id and not await db.scalar(select(Supplier.id).where(Supplier.id == supplier_id, Supplier.active.is_(True))):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Supplier is inactive")


async def _number(db: DbSession, year: int) -> str:
    if db.bind and db.bind.dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": year * 10 + 6})
    values = (await db.scalars(select(MapCorrection.number).where(MapCorrection.number.like(f"KOR-{year}-%")))).all()
    sequence = max((int(match.group(1)) for value in values if (match := re.fullmatch(rf"KOR-{year}-(\d{{4}})", value))), default=0) + 1
    return f"KOR-{year}-{sequence:04d}"


def _audit(db: DbSession, request: Request, user: User, action: str, row: MapCorrection,
           data: dict[str, Any]) -> None:
    db.add(AuditLog(actor_user_id=user.id, action=action, object_type="map_correction", object_id=row.id,
                    new_data=data, ip_address=request.client.host if request.client else None))


def _validate_next(row: MapCorrection, next_status: str) -> None:
    current = STAGES.index(row.status)
    if current == len(STAGES) - 1 or next_status != STAGES[current + 1]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"Invalid map correction status transition from {row.status} to {next_status}")
    if next_status == "assigned" and row.assigned_to is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "An assignee is required for the assigned stage")
    if next_status == "sent_to_supplier" and not row.supplier_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A supplier is required before sending")


@router.get("/geojson")
async def geojson(db: DbSession, user: CurrentUser) -> dict[str, Any]:
    rows = (await db.scalars(select(MapCorrection).where(MapCorrection.deleted_at.is_(None)))).all()
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "id": str(row.id), "geometry": mapping(transform(to_wgs84, wkt.loads(row.geometry))),
         "properties": {"number": row.number, "title": row.title, "category": row.category,
                        "priority": row.priority, "status": row.status}}
        for row in rows
    ]}


@router.get("", response_model=list[CorrectionResponse])
async def list_corrections(db: DbSession, user: CurrentUser,
                           correction_status: Annotated[list[CorrectionStatus], Query(alias="status")] = [],
                           priority: Priority | None = None, supplier_id: UUID | None = None,
                           assigned_to_id: UUID | None = None) -> list[CorrectionResponse]:
    query = select(MapCorrection).where(MapCorrection.deleted_at.is_(None))
    if correction_status:
        query = query.where(MapCorrection.status.in_(correction_status))
    if priority:
        query = query.where(MapCorrection.priority == priority)
    if supplier_id:
        query = query.where(MapCorrection.supplier_id == supplier_id)
    if assigned_to_id:
        query = query.where(MapCorrection.assigned_to_id == assigned_to_id)
    return [_response(row) for row in (await db.scalars(query.order_by(MapCorrection.created_at.desc()))).unique().all()]


@router.post("", response_model=CorrectionResponse, status_code=status.HTTP_201_CREATED)
async def create_correction(payload: CorrectionCreate, request: Request, db: DbSession,
                            user: CreateUser) -> CorrectionResponse:
    if "board_member" in {role.name for role in user.roles} and not {"admin", "map_manager"}.intersection(role.name for role in user.roles) and not payload.inquiry_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Board members can only create corrections from an inquiry")
    values = payload.model_dump()
    await _validate_links(db, values)
    assignee = await _active_user(db, values.pop("assigned_to_id"))
    longitude, latitude = values.pop("longitude"), values.pop("latitude")
    now = datetime.now(timezone.utc)
    row = MapCorrection(number=await _number(db, now.year), geometry=_point(longitude, latitude),
                        assigned_to=assignee, created_by=user, updated_by=user.id, **values)
    db.add(row)
    await db.flush()
    db.add(MapCorrectionHistory(correction_id=row.id, author=user, previous_status=None, status="new", note=None))
    _audit(db, request, user, "create", row, {"number": row.number, "category": row.category,
           "priority": row.priority, "status": row.status, "inquiry_id": str(row.inquiry_id) if row.inquiry_id else None,
           "pipe_id": str(row.pipe_id) if row.pipe_id else None, "valve_id": str(row.valve_id) if row.valve_id else None,
           "supplier_id": str(row.supplier_id) if row.supplier_id else None,
           "longitude": longitude, "latitude": latitude})
    await db.commit()
    return _response(await _get(db, row.id))


@router.get("/{correction_id}", response_model=CorrectionResponse)
async def get_correction(correction_id: UUID, db: DbSession, user: CurrentUser) -> CorrectionResponse:
    return _response(await _get(db, correction_id))


@router.patch("/{correction_id}", response_model=CorrectionResponse)
async def patch_correction(correction_id: UUID, payload: CorrectionPatch, request: Request,
                           db: DbSession, user: EditorUser) -> CorrectionResponse:
    row = await _get(db, correction_id)
    changes = payload.model_dump(exclude_unset=True)
    await _validate_links(db, changes)
    next_status = changes.pop("status", None)
    if "assigned_to_id" in changes:
        row.assigned_to = await _active_user(db, changes.pop("assigned_to_id"))
    if "longitude" in changes:
        row.geometry = _point(changes.pop("longitude"), changes.pop("latitude"))
    for field, value in changes.items():
        setattr(row, field, value)
    if next_status:
        _validate_next(row, next_status)
        previous = row.status
        row.status = next_status
        db.add(MapCorrectionHistory(correction_id=row.id, author=user, previous_status=previous,
                                    status=next_status, note=None))
    row.updated_by = user.id
    _audit(db, request, user, "update", row, {"changed_fields": sorted(payload.model_fields_set),
           "status": row.status, "supplier_id": str(row.supplier_id) if row.supplier_id else None})
    await db.commit()
    return _response(await _get(db, row.id))


@router.post("/{correction_id}/transitions", response_model=CorrectionResponse)
async def transition(correction_id: UUID, payload: CorrectionTransition, request: Request,
                     db: DbSession, user: EditorUser) -> CorrectionResponse:
    row = await _get(db, correction_id)
    _validate_next(row, payload.status)
    previous = row.status
    row.status = payload.status
    row.updated_by = user.id
    item = MapCorrectionHistory(correction=row, author=user, previous_status=previous,
                                status=payload.status, note=payload.note)
    db.add(item)
    await db.flush()
    _audit(db, request, user, "transition", row, {"history_id": str(item.id),
           "previous_status": previous, "status": row.status, "note_length": len(payload.note or "")})
    await db.commit()
    return _response(await _get(db, row.id))


@router.post("/{correction_id}/attachments", response_model=CorrectionResponse)
async def upload_attachment(correction_id: UUID, request: Request, db: DbSession, user: EditorUser,
                            file: UploadFile = File(...)) -> CorrectionResponse:
    row = await _get(db, correction_id)
    destination, original_filename, storage_filename, size_bytes, mime_type, checksum = await store_upload(file)
    attachment = MapCorrectionAttachment(
        correction_id=row.id, original_filename=original_filename, storage_filename=storage_filename,
        mime_type=mime_type, size_bytes=size_bytes, checksum_sha256=checksum,
        uploaded_by_id=user.id, updated_by=user.id,
    )
    row.attachments.append(attachment)
    row.updated_by = user.id
    try:
        await db.flush()
        db.add(AuditLog(
            actor_user_id=user.id, action="upload", object_type="map_correction_attachment",
            object_id=attachment.id, new_data={"correction_id": str(row.id), "mime_type": mime_type,
            "size_bytes": size_bytes, "checksum_sha256": checksum},
            ip_address=request.client.host if request.client else None,
        ))
        await db.commit()
    except Exception:
        await asyncio.to_thread(destination.unlink, missing_ok=True)
        raise
    return _response(await _get(db, row.id))


@router.get("/{correction_id}/attachments/{attachment_id}")
async def download_attachment(correction_id: UUID, attachment_id: UUID, db: DbSession,
                              user: CurrentUser) -> FileResponse:
    attachment = await db.scalar(select(MapCorrectionAttachment).where(
        MapCorrectionAttachment.id == attachment_id,
        MapCorrectionAttachment.correction_id == correction_id,
        MapCorrectionAttachment.deleted_at.is_(None),
    ))
    if not attachment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    path = stored_path(attachment.storage_filename)
    if not path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment file not found")
    return FileResponse(path, media_type=attachment.mime_type, filename=attachment.original_filename)
