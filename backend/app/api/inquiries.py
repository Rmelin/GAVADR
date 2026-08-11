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
from app.models import Address, AuditLog, Incident, Inquiry, InquiryAttachment, InquiryUpdate, User
from app.schemas.incident import AttachmentResponse, UserOption
from app.schemas.phase5 import (
    InquiryCreate, InquiryPatch, InquiryResponse, InquiryStatus, InquiryUpdateCreate,
    InquiryUpdateResponse, Priority,
)
from app.services.attachment_files import store_upload, stored_path

router = APIRouter(prefix="/inquiries", tags=["inquiries"])
EditorUser = Annotated[User, Depends(require_roles("admin", "board_member", "map_manager"))]
to_wgs84 = Transformer.from_crs(25832, 4326, always_xy=True).transform
TRANSITIONS = {
    "new": {"in_progress", "waiting", "resolved", "closed"},
    "in_progress": {"waiting", "resolved", "closed"},
    "waiting": {"in_progress", "resolved", "closed"},
    "resolved": {"in_progress", "closed"},
    "closed": set(),
}


def _user(value: User | None) -> UserOption | None:
    return UserOption(id=value.id, display_name=value.display_name, email=value.email) if value else None


def _response(row: Inquiry) -> InquiryResponse:
    return InquiryResponse(
        id=row.id, number=row.number, contact_name=row.contact_name, contact_email=row.contact_email,
        contact_phone=row.contact_phone, address_id=row.address_id, address_text=row.address_text,
        channel=row.channel, category=row.category, description=row.description, priority=row.priority,
        status=row.status, assigned_to=_user(row.assigned_to), follow_up_at=row.follow_up_at,
        incident_id=row.incident_id, notes=row.notes, created_by=_user(row.created_by),
        updates=[InquiryUpdateResponse(
            id=item.id, message=item.message, previous_status=item.previous_status, status=item.status,
            author=_user(item.author), created_at=item.created_at,
        ) for item in row.updates if item.deleted_at is None],
        attachments=[AttachmentResponse(
            id=item.id, original_filename=item.original_filename, mime_type=item.mime_type,
            size_bytes=item.size_bytes, created_at=item.created_at,
            download_url=f"/api/inquiries/{row.id}/attachments/{item.id}",
        ) for item in row.attachments if item.deleted_at is None],
        created_at=row.created_at, updated_at=row.updated_at,
    )


async def _get(db: DbSession, inquiry_id: UUID) -> Inquiry:
    row = await db.scalar(select(Inquiry).where(Inquiry.id == inquiry_id, Inquiry.deleted_at.is_(None)).execution_options(populate_existing=True))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inquiry not found")
    return row


async def _user_or_none(db: DbSession, user_id: UUID | None) -> User | None:
    if user_id is None:
        return None
    row = await db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True), User.deleted_at.is_(None)))
    if not row:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assigned user is not active")
    return row


async def _refs(db: DbSession, address_id: UUID | None, incident_id: UUID | None) -> None:
    if address_id and not await db.scalar(select(Address.id).where(Address.id == address_id, Address.deleted_at.is_(None))):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Address is unavailable")
    if incident_id and not await db.scalar(select(Incident.id).where(Incident.id == incident_id, Incident.deleted_at.is_(None))):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Incident is unavailable")


async def _number(db: DbSession, year: int) -> str:
    if db.bind and db.bind.dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": year * 10 + 5})
    values = (await db.scalars(select(Inquiry.number).where(Inquiry.number.like(f"HEN-{year}-%")))).all()
    sequence = max((int(match.group(1)) for value in values if (match := re.fullmatch(rf"HEN-{year}-(\d{{4}})", value))), default=0) + 1
    return f"HEN-{year}-{sequence:04d}"


def _transition(previous: str, next_status: str) -> None:
    if next_status != previous and next_status not in TRANSITIONS[previous]:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid inquiry status transition from {previous} to {next_status}")


def _audit(db: DbSession, request: Request, user: User, action: str, row: Inquiry, data: dict[str, Any]) -> None:
    db.add(AuditLog(actor_user_id=user.id, action=action, object_type="inquiry", object_id=row.id,
                    new_data=data, ip_address=request.client.host if request.client else None))


@router.get("/geojson")
async def geojson(db: DbSession, user: CurrentUser) -> dict[str, Any]:
    rows = (await db.scalars(select(Inquiry).where(Inquiry.deleted_at.is_(None), Inquiry.address_id.is_not(None)))).unique().all()
    features = []
    for row in rows:
        if row.address:
            geometry = transform(to_wgs84, wkt.loads(row.address.geometry))
            features.append({"type": "Feature", "id": str(row.id), "geometry": mapping(geometry),
                             "properties": {"number": row.number, "category": row.category,
                                            "priority": row.priority, "status": row.status}})
    return {"type": "FeatureCollection", "features": features}


@router.get("", response_model=list[InquiryResponse])
async def list_inquiries(db: DbSession, user: CurrentUser,
                         inquiry_status: Annotated[list[InquiryStatus], Query(alias="status")] = [],
                         priority: Priority | None = None, assigned_to_id: UUID | None = None) -> list[InquiryResponse]:
    query = select(Inquiry).where(Inquiry.deleted_at.is_(None))
    if inquiry_status:
        query = query.where(Inquiry.status.in_(inquiry_status))
    if priority:
        query = query.where(Inquiry.priority == priority)
    if assigned_to_id:
        query = query.where(Inquiry.assigned_to_id == assigned_to_id)
    return [_response(row) for row in (await db.scalars(query.order_by(Inquiry.created_at.desc()))).unique().all()]


@router.post("", response_model=InquiryResponse, status_code=status.HTTP_201_CREATED)
async def create_inquiry(payload: InquiryCreate, request: Request, db: DbSession, user: EditorUser) -> InquiryResponse:
    await _refs(db, payload.address_id, payload.incident_id)
    assignee = await _user_or_none(db, payload.assigned_to_id)
    now = datetime.now(timezone.utc)
    row = Inquiry(number=await _number(db, now.year), created_by=user, updated_by=user.id,
                  assigned_to=assignee, **payload.model_dump(exclude={"assigned_to_id"}))
    db.add(row)
    await db.flush()
    _audit(db, request, user, "create", row, {"number": row.number, "channel": row.channel,
           "category": row.category, "priority": row.priority, "status": row.status,
           "has_email": bool(row.contact_email), "has_phone": bool(row.contact_phone),
           "address_id": str(row.address_id) if row.address_id else None,
           "incident_id": str(row.incident_id) if row.incident_id else None})
    await db.commit()
    return _response(await _get(db, row.id))


@router.get("/{inquiry_id}", response_model=InquiryResponse)
async def get_inquiry(inquiry_id: UUID, db: DbSession, user: CurrentUser) -> InquiryResponse:
    return _response(await _get(db, inquiry_id))


@router.patch("/{inquiry_id}", response_model=InquiryResponse)
async def patch_inquiry(inquiry_id: UUID, payload: InquiryPatch, request: Request,
                        db: DbSession, user: EditorUser) -> InquiryResponse:
    row = await _get(db, inquiry_id)
    changes = payload.model_dump(exclude_unset=True)
    if "status" in changes:
        _transition(row.status, payload.status)
    await _refs(db, changes.get("address_id"), changes.get("incident_id"))
    if "assigned_to_id" in changes:
        row.assigned_to = await _user_or_none(db, payload.assigned_to_id)
        changes.pop("assigned_to_id")
    changed_fields = sorted(payload.model_fields_set)
    for field, value in changes.items():
        setattr(row, field, value)
    row.updated_by = user.id
    _audit(db, request, user, "update", row, {"changed_fields": changed_fields,
           "status": row.status, "assigned_to_id": str(row.assigned_to_id) if row.assigned_to_id else None})
    await db.commit()
    return _response(await _get(db, row.id))


@router.post("/{inquiry_id}/updates", response_model=InquiryResponse)
async def add_update(inquiry_id: UUID, payload: InquiryUpdateCreate, request: Request,
                     db: DbSession, user: EditorUser) -> InquiryResponse:
    row = await _get(db, inquiry_id)
    previous = row.status
    if payload.status:
        _transition(previous, payload.status)
        row.status = payload.status
    item = InquiryUpdate(inquiry=row, author=user, message=payload.message,
                         previous_status=previous if payload.status else None, status=payload.status, updated_by=user.id)
    db.add(item)
    row.updated_by = user.id
    await db.flush()
    _audit(db, request, user, "comment", row, {"update_id": str(item.id), "message_length": len(item.message),
           "previous_status": item.previous_status, "status": item.status})
    await db.commit()
    return _response(await _get(db, row.id))


@router.post("/{inquiry_id}/attachments", response_model=InquiryResponse)
async def upload_attachment(inquiry_id: UUID, request: Request, db: DbSession, user: EditorUser,
                            file: UploadFile = File(...)) -> InquiryResponse:
    row = await _get(db, inquiry_id)
    destination, original_filename, storage_filename, size_bytes, mime_type, checksum = await store_upload(file)
    attachment = InquiryAttachment(
        inquiry_id=row.id, original_filename=original_filename, storage_filename=storage_filename,
        mime_type=mime_type, size_bytes=size_bytes, checksum_sha256=checksum,
        uploaded_by_id=user.id, updated_by=user.id,
    )
    row.attachments.append(attachment)
    row.updated_by = user.id
    try:
        await db.flush()
        db.add(AuditLog(
            actor_user_id=user.id, action="upload", object_type="inquiry_attachment",
            object_id=attachment.id, new_data={"inquiry_id": str(row.id), "mime_type": mime_type,
            "size_bytes": size_bytes, "checksum_sha256": checksum},
            ip_address=request.client.host if request.client else None,
        ))
        await db.commit()
    except Exception:
        await asyncio.to_thread(destination.unlink, missing_ok=True)
        raise
    return _response(await _get(db, row.id))


@router.get("/{inquiry_id}/attachments/{attachment_id}")
async def download_attachment(inquiry_id: UUID, attachment_id: UUID, db: DbSession,
                              user: CurrentUser) -> FileResponse:
    attachment = await db.scalar(select(InquiryAttachment).where(
        InquiryAttachment.id == attachment_id, InquiryAttachment.inquiry_id == inquiry_id,
        InquiryAttachment.deleted_at.is_(None),
    ))
    if not attachment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    path = stored_path(attachment.storage_filename)
    if not path:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment file not found")
    return FileResponse(path, media_type=attachment.mime_type, filename=attachment.original_filename)
