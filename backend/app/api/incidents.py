import asyncio
import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from pyproj import Transformer
from shapely import wkt
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload

from app.activity import incident_activity_type
from app.api.deps import CurrentUser, DbSession, require_roles
from app.core.config import get_settings
from app.models import Address, Attachment, AuditLog, Incident, IncidentUpdate, PlannedShutdownIncident, User
from app.schemas.incident import (
    AttachmentResponse,
    IncidentCreate,
    IncidentAddressSummary,
    IncidentDetail,
    IncidentPatch,
    IncidentPriority,
    IncidentStatus,
    IncidentSummary,
    IncidentUpdateCreate,
    Location,
    LinkedShutdownSummary,
    UpdateResponse,
    UserOption,
)
from app.services.notifications import notify_board

router = APIRouter(prefix="/incidents", tags=["incidents"])
settings = get_settings()
to_internal = Transformer.from_crs(4326, 25832, always_xy=True)
to_wgs84 = Transformer.from_crs(25832, 4326, always_xy=True)
EditorUser = Annotated[User, Depends(require_roles("admin", "board_member", "map_manager"))]

TRANSITIONS = {
    "new": {"assessing", "active", "cancelled"},
    "assessing": {"active", "monitoring", "resolved", "cancelled"},
    "active": {"monitoring", "resolved", "cancelled"},
    "monitoring": {"active", "resolved", "cancelled"},
    "resolved": {"active", "closed"},
    "closed": set(),
    "cancelled": set(),
}
FILE_TYPES = {
    "image/jpeg": (".jpg", lambda data: data.startswith(b"\xff\xd8\xff")),
    "image/png": (".png", lambda data: data.startswith(b"\x89PNG\r\n\x1a\n")),
    "application/pdf": (".pdf", lambda data: data.startswith(b"%PDF-")),
}


def _ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _audit_value(value):
    if isinstance(value, (datetime, UUID)):
        return str(value)
    return value


def _point(longitude: float, latitude: float) -> str:
    x, y = to_internal.transform(longitude, latitude)
    return f"POINT ({x} {y})"


def _location(value: str) -> Location:
    point = wkt.loads(value)
    longitude, latitude = to_wgs84.transform(point.x, point.y)
    return Location(longitude=longitude, latitude=latitude)


def _user_option(user: User | None) -> UserOption | None:
    return UserOption(id=user.id, display_name=user.display_name, email=user.email) if user else None


def _address_summary(address: Address | None) -> IncidentAddressSummary | None:
    if not address:
        return None
    return IncidentAddressSummary(
        id=address.id,
        label=f"{address.street_name} {address.house_number}",
        street_name=address.street_name,
        house_number=address.house_number,
        postal_code=address.postal_code,
        city=address.city,
    )


def _summary(incident: Incident) -> IncidentSummary:
    return IncidentSummary(
        id=incident.id,
        number=incident.number,
        title=incident.title,
        type=incident.type,
        activity_type=incident_activity_type(incident.type),
        priority=incident.priority,
        status=incident.status,
        location=_location(incident.geometry),
        address=_address_summary(incident.address),
        registered_at=incident.registered_at,
        assigned_to=_user_option(incident.assigned_to),
        created_by=_user_option(incident.created_by),
        expected_end_at=incident.expected_end_at,
        water_restored_at=incident.water_restored_at,
        updated_at=incident.updated_at,
    )


def _detail(incident: Incident) -> IncidentDetail:
    summary = _summary(incident).model_dump()
    return IncidentDetail(
        **summary,
        description=incident.description,
        public_text=incident.public_text,
        updates=[
            UpdateResponse(
                id=item.id,
                message=item.message,
                status=item.status,
                author=_user_option(item.author),
                created_at=item.created_at,
            )
            for item in incident.updates
            if item.deleted_at is None
        ],
        attachments=[
            AttachmentResponse(
                id=item.id,
                original_filename=item.original_filename,
                mime_type=item.mime_type,
                size_bytes=item.size_bytes,
                created_at=item.created_at,
                download_url=f"/api/incidents/{incident.id}/attachments/{item.id}",
            )
            for item in incident.attachments
            if item.deleted_at is None
        ],
        planned_shutdowns=[
            LinkedShutdownSummary(
                id=link.shutdown.id,
                number=link.shutdown.number,
                title=link.shutdown.title,
                status=link.shutdown.status,
                activity_type="shutdown",
                starts_at=link.shutdown.starts_at,
            )
            for link in sorted(incident.shutdown_links, key=lambda item: item.shutdown.starts_at, reverse=True)
            if link.deleted_at is None and link.shutdown.deleted_at is None
        ],
    )


async def _incident_or_404(db: DbSession, incident_id: UUID) -> Incident:
    incident = await db.scalar(
        select(Incident)
        .options(
            selectinload(Incident.shutdown_links).selectinload(PlannedShutdownIncident.shutdown)
        )
        .where(Incident.id == incident_id, Incident.deleted_at.is_(None))
        .execution_options(populate_existing=True)
    )
    if not incident:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    return incident


async def _validate_assignee(db: DbSession, user_id: UUID | None) -> User | None:
    if user_id is None:
        return None
    user = await db.scalar(
        select(User).where(User.id == user_id, User.is_active.is_(True), User.deleted_at.is_(None))
    )
    if not user:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assigned user is not active")
    return user


async def _validate_address(db: DbSession, address_id: UUID | None) -> Address | None:
    if address_id is None:
        return None
    address = await db.scalar(select(Address).where(
        Address.id == address_id, Address.active.is_(True), Address.deleted_at.is_(None)
    ))
    if not address:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Address is not active")
    return address


async def _next_number(db: DbSession, year: int) -> str:
    if db.bind and db.bind.dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": year})
    numbers = (
        await db.scalars(select(Incident.number).where(Incident.number.like(f"HÆN-{year}-%")))
    ).all()
    sequence = max(
        (int(match.group(1)) for value in numbers if (match := re.fullmatch(rf"HÆN-{year}-(\d{{4}})", value))),
        default=0,
    ) + 1
    if sequence > 9999:
        raise HTTPException(status.HTTP_409_CONFLICT, "Incident number range exhausted for this year")
    return f"HÆN-{year}-{sequence:04d}"


def _validate_transition(previous: str, next_status: str) -> None:
    if next_status != previous and next_status not in TRANSITIONS[previous]:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Invalid incident status transition from {previous} to {next_status}",
        )


@router.get("", response_model=list[IncidentSummary])
async def list_incidents(
    db: DbSession,
    user: CurrentUser,
    incident_status: Annotated[list[IncidentStatus], Query(alias="status")] = [],
    priority: IncidentPriority | None = None,
) -> list[IncidentSummary]:
    query = select(Incident).where(Incident.deleted_at.is_(None))
    if incident_status:
        query = query.where(Incident.status.in_(incident_status))
    if priority:
        query = query.where(Incident.priority == priority)
    rows = (await db.scalars(query.order_by(Incident.registered_at.desc()))).unique().all()
    return [_summary(row) for row in rows]


@router.post("", response_model=IncidentDetail, status_code=status.HTTP_201_CREATED)
async def create_incident(
    payload: IncidentCreate, request: Request, db: DbSession, user: EditorUser
) -> IncidentDetail:
    now = datetime.now(timezone.utc)
    assignee = await _validate_assignee(db, payload.assigned_to_id)
    address = await _validate_address(db, payload.address_id)
    incident = Incident(
        number=await _next_number(db, now.year),
        title=payload.title.strip(),
        description=payload.description.strip(),
        type=payload.type,
        priority=payload.priority,
        geometry=address.geometry if address else _point(payload.longitude, payload.latitude),
        address=address,
        registered_at=now,
        created_by=user,
        assigned_to=assignee,
        expected_end_at=payload.expected_end_at,
        updated_by=user.id,
    )
    db.add(incident)
    await db.flush()
    db.add(AuditLog(
        actor_user_id=user.id, action="create", object_type="incident", object_id=incident.id,
        new_data={
            "number": incident.number, "type": incident.type, "priority": incident.priority,
            "status": incident.status, "assigned_to_id": str(incident.assigned_to_id) if incident.assigned_to_id else None,
            "address_id": str(address.id) if address else None,
            "longitude": payload.longitude, "latitude": payload.latitude,
        }, ip_address=_ip(request),
    ))
    if incident.priority in {"high", "critical"}:
        notification = await notify_board(incident, settings)
        db.add(notification)
        await db.flush()
        db.add(AuditLog(
            actor_user_id=user.id, action="notify", object_type="notification", object_id=notification.id,
            new_data={"incident_id": str(incident.id), "channel": "email", "status": notification.status,
                      "recipient_count": len(notification.recipients)}, ip_address=_ip(request),
        ))
    await db.commit()
    return _detail(await _incident_or_404(db, incident.id))


@router.get("/{incident_id}", response_model=IncidentDetail)
async def get_incident(incident_id: UUID, db: DbSession, user: CurrentUser) -> IncidentDetail:
    return _detail(await _incident_or_404(db, incident_id))


@router.patch("/{incident_id}", response_model=IncidentDetail)
async def patch_incident(
    incident_id: UUID, payload: IncidentPatch, request: Request, db: DbSession, user: EditorUser
) -> IncidentDetail:
    incident = await _incident_or_404(db, incident_id)
    changes = payload.model_dump(exclude_unset=True)
    old_data: dict[str, object] = {}
    new_data: dict[str, object] = {}

    if "status" in changes:
        _validate_transition(incident.status, payload.status)
    if "assigned_to_id" in changes:
        old_data["assigned_to_id"] = str(incident.assigned_to_id) if incident.assigned_to_id else None
        incident.assigned_to = await _validate_assignee(db, payload.assigned_to_id)
        new_data["assigned_to_id"] = str(payload.assigned_to_id) if payload.assigned_to_id else None
    if "longitude" in changes:
        old_location = _location(incident.geometry)
        incident.geometry = _point(payload.longitude, payload.latitude)
        old_data["location"] = old_location.model_dump()
        new_data["location"] = {"longitude": payload.longitude, "latitude": payload.latitude}

    for field in ("title", "description", "type", "priority", "expected_end_at", "water_restored_at", "public_text"):
        if field in changes:
            old_data[field] = _audit_value(getattr(incident, field)) if field not in {"description", "public_text"} else "changed"
            value = getattr(payload, field)
            setattr(incident, field, value.strip() if isinstance(value, str) else value)
            new_data[field] = _audit_value(value) if field not in {"description", "public_text"} else "changed"
    if "status" in changes and payload.status != incident.status:
        previous = incident.status
        incident.status = payload.status
        incident.updates.append(IncidentUpdate(
            author=user, message=f"Status changed from {previous} to {payload.status}",
            previous_status=previous, status=payload.status, updated_by=user.id,
        ))
        old_data["status"] = previous
        new_data["status"] = payload.status

    incident.updated_by = user.id
    db.add(AuditLog(
        actor_user_id=user.id, action="update", object_type="incident", object_id=incident.id,
        old_data=old_data, new_data=new_data, ip_address=_ip(request),
    ))
    await db.commit()
    return _detail(await _incident_or_404(db, incident.id))


@router.post("/{incident_id}/updates", response_model=IncidentDetail)
async def add_update(
    incident_id: UUID, payload: IncidentUpdateCreate, request: Request, db: DbSession,
    user: EditorUser,
) -> IncidentDetail:
    incident = await _incident_or_404(db, incident_id)
    previous = incident.status
    if payload.status:
        _validate_transition(previous, payload.status)
        incident.status = payload.status
    item = IncidentUpdate(
        author=user, message=payload.message.strip(), previous_status=previous if payload.status else None,
        status=payload.status, updated_by=user.id,
    )
    incident.updates.append(item)
    incident.updated_by = user.id
    await db.flush()
    db.add(AuditLog(
        actor_user_id=user.id, action="comment", object_type="incident_update", object_id=item.id,
        new_data={"incident_id": str(incident.id), "message_length": len(item.message),
                  "previous_status": item.previous_status, "status": item.status}, ip_address=_ip(request),
    ))
    await db.commit()
    return _detail(await _incident_or_404(db, incident.id))


@router.post("/{incident_id}/attachments", response_model=IncidentDetail)
async def upload_attachment(
    incident_id: UUID, request: Request, db: DbSession, user: EditorUser,
    file: UploadFile = File(...),
) -> IncidentDetail:
    incident = await _incident_or_404(db, incident_id)
    mime_type = (file.content_type or "").split(";", 1)[0].lower()
    if mime_type not in FILE_TYPES:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only JPEG, PNG, and PDF files are allowed")
    content = await file.read(settings.upload_max_bytes + 1)
    if len(content) > settings.upload_max_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File exceeds configured maximum size")
    extension, matches_magic = FILE_TYPES[mime_type]
    if not content or not matches_magic(content):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "File content does not match its MIME type")

    original_filename = Path(file.filename or "upload").name.replace("\x00", "")[:255] or "upload"
    storage_filename = f"{uuid4().hex}{extension}"
    upload_dir = settings.upload_dir.resolve()
    upload_dir.mkdir(parents=True, exist_ok=True)
    destination = (upload_dir / storage_filename).resolve()
    if destination.parent != upload_dir:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid storage path")
    await asyncio.to_thread(destination.write_bytes, content)
    attachment = Attachment(
        incident_id=incident.id, original_filename=original_filename, storage_filename=storage_filename,
        mime_type=mime_type, size_bytes=len(content), checksum_sha256=hashlib.sha256(content).hexdigest(),
        uploaded_by_id=user.id, updated_by=user.id,
    )
    incident.attachments.append(attachment)
    incident.updated_by = user.id
    try:
        await db.flush()
        db.add(AuditLog(
            actor_user_id=user.id, action="upload", object_type="attachment", object_id=attachment.id,
            new_data={"incident_id": str(incident.id), "mime_type": mime_type, "size_bytes": len(content),
                      "checksum_sha256": attachment.checksum_sha256}, ip_address=_ip(request),
        ))
        await db.commit()
    except Exception:
        await asyncio.to_thread(destination.unlink, missing_ok=True)
        raise
    return _detail(await _incident_or_404(db, incident.id))


@router.get("/{incident_id}/attachments/{attachment_id}")
async def download_attachment(
    incident_id: UUID, attachment_id: UUID, db: DbSession, user: CurrentUser
) -> FileResponse:
    attachment = await db.scalar(select(Attachment).where(
        Attachment.id == attachment_id, Attachment.incident_id == incident_id,
        Attachment.deleted_at.is_(None),
    ))
    if not attachment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    upload_dir = settings.upload_dir.resolve()
    path = (upload_dir / attachment.storage_filename).resolve()
    if path.parent != upload_dir or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment file not found")
    return FileResponse(path, media_type=attachment.mime_type, filename=attachment.original_filename)
