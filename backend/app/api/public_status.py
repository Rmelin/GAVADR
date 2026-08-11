from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update

from app.api.deps import CurrentUser, DbSession, require_roles
from app.models import AuditLog, Incident, PlannedShutdown, PublicStatus, User
from app.schemas.public_status import ClosePublicStatus, PublicDraft, PublicFeed, PublicStatusResponse
from app.services.public_status import build_public_feed, generate_public_file

router = APIRouter(tags=["public status"])
management = APIRouter(prefix="/public-status", tags=["public status"])
EditorUser = Annotated[User, Depends(require_roles("admin", "board_member"))]
SourceType = Literal["incident", "shutdown"]


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


async def _source_or_404(db: DbSession, source_type: SourceType, source_id: UUID):
    model = Incident if source_type == "incident" else PlannedShutdown
    source = await db.scalar(select(model).where(model.id == source_id, model.deleted_at.is_(None)))
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{source_type.title()} not found")
    return source


async def _notice(db: DbSession, source_type: SourceType, source_id: UUID) -> PublicStatus | None:
    column = PublicStatus.incident_id if source_type == "incident" else PublicStatus.planned_shutdown_id
    return await db.scalar(select(PublicStatus).where(column == source_id))


async def _notice_or_404(db: DbSession, source_type: SourceType, source_id: UUID) -> PublicStatus:
    notice = await _notice(db, source_type, source_id)
    if notice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Public status not found")
    return notice


def _response(notice: PublicStatus, source_type: SourceType, source_id: UUID, source) -> PublicStatusResponse:
    draft_payload = {
        "title": notice.draft_title,
        "message": notice.draft_message,
        "areas": list(notice.draft_areas),
        "start_at": _utc(notice.draft_start_at).isoformat().replace("+00:00", "Z"),
        "expected_end_at": (
            _utc(notice.draft_expected_end_at).isoformat().replace("+00:00", "Z")
            if notice.draft_expected_end_at else None
        ),
        "severity": notice.draft_severity,
    }
    return PublicStatusResponse(
        id=notice.id,
        source_type=source_type,
        source_id=source_id,
        status=notice.status,
        draft=PublicDraft(
            title=notice.draft_title,
            message=notice.draft_message,
            areas=notice.draft_areas,
            start_at=notice.draft_start_at,
            expected_end_at=notice.draft_expected_end_at,
            severity=notice.draft_severity,
        ),
        approved_payload=notice.approved_payload,
        approved_by_id=notice.approved_by_id,
        approved_at=notice.approved_at,
        source_updated=notice.source_updated,
        needs_approval=notice.approved_payload != draft_payload,
        close_message=notice.close_message,
        closed_at=notice.closed_at,
        display_until=notice.display_until,
        withdrawn_at=notice.withdrawn_at,
        updated_at=notice.updated_at,
    )


def _audit(db: DbSession, request: Request, user: User, action: str, notice: PublicStatus) -> None:
    db.add(AuditLog(
        actor_user_id=user.id,
        action=action,
        object_type="public_status",
        object_id=notice.id,
        new_data={"status": notice.status},
        ip_address=request.client.host if request.client else None,
    ))


@management.get("/{source_type}/{source_id}", response_model=PublicStatusResponse)
async def get_public_status(
    source_type: SourceType, source_id: UUID, db: DbSession, user: CurrentUser
) -> PublicStatusResponse:
    source = await _source_or_404(db, source_type, source_id)
    return _response(await _notice_or_404(db, source_type, source_id), source_type, source_id, source)


@management.put("/{source_type}/{source_id}/draft", response_model=PublicStatusResponse)
async def put_draft(
    source_type: SourceType,
    source_id: UUID,
    payload: PublicDraft,
    request: Request,
    db: DbSession,
    user: EditorUser,
) -> PublicStatusResponse:
    source = await _source_or_404(db, source_type, source_id)
    notice = await _notice(db, source_type, source_id)
    if notice and notice.status in ("closed", "withdrawn"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Final public status cannot be edited")
    if notice is None:
        notice = PublicStatus(
            incident_id=source_id if source_type == "incident" else None,
            planned_shutdown_id=source_id if source_type == "shutdown" else None,
            status="draft",
            updated_by=user.id,
        )
        db.add(notice)
    notice.draft_title = payload.title
    notice.draft_message = payload.message
    notice.draft_areas = payload.areas
    notice.draft_start_at = payload.start_at
    notice.draft_expected_end_at = payload.expected_end_at
    notice.draft_severity = payload.severity
    notice.updated_by = user.id
    await db.flush()
    _audit(db, request, user, "public_status.draft_saved", notice)
    await db.commit()
    await db.refresh(notice)
    return _response(notice, source_type, source_id, source)


@management.post("/{source_type}/{source_id}/approve", response_model=PublicStatusResponse)
async def approve_public_status(
    source_type: SourceType,
    source_id: UUID,
    request: Request,
    db: DbSession,
    user: EditorUser,
) -> PublicStatusResponse:
    source = await _source_or_404(db, source_type, source_id)
    notice = await _notice_or_404(db, source_type, source_id)
    if notice.status not in ("draft", "published"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a draft or published status can be approved")
    if source_type == "shutdown":
        if notice.draft_expected_end_at is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Forventet afslutning skal angives før offentliggørelse")
        if source.status in ("completed", "cancelled"):
            raise HTTPException(status.HTTP_409_CONFLICT, "En afsluttet eller aflyst vandlukning kan ikke offentliggøres")
        source.status = "planned"
        source.starts_at = notice.draft_start_at
        source.expected_end_at = notice.draft_expected_end_at
        source.updated_by = user.id
    now = datetime.now(timezone.utc)
    notice.approved_payload = {
        "title": notice.draft_title,
        "message": notice.draft_message,
        "areas": list(notice.draft_areas),
        "start_at": _utc(notice.draft_start_at).isoformat().replace("+00:00", "Z"),
        "expected_end_at": (
            _utc(notice.draft_expected_end_at).isoformat().replace("+00:00", "Z")
            if notice.draft_expected_end_at else None
        ),
        "severity": notice.draft_severity,
    }
    notice.status = "published"
    notice.approved_by_id = user.id
    notice.approved_at = now
    notice.source_updated_at = now
    notice.source_updated = False
    notice.updated_by = user.id
    _audit(db, request, user, "public_status.published", notice)
    if source_type == "shutdown":
        db.add(AuditLog(
            actor_user_id=user.id,
            action="planned_shutdown.published",
            object_type="planned_shutdown",
            object_id=source.id,
            new_data={
                "status": "planned",
                "starts_at": _utc(source.starts_at).isoformat(),
                "expected_end_at": _utc(source.expected_end_at).isoformat(),
            },
            ip_address=request.client.host if request.client else None,
        ))
    await db.flush()
    # Synchronizing the source is part of this approval, not a later unreviewed source edit.
    notice.source_updated = False
    notice.source_updated_at = now
    await db.flush()
    if source_type == "shutdown":
        await db.execute(
            update(PublicStatus)
            .where(PublicStatus.id == notice.id)
            .values(source_updated=False, source_updated_at=now)
        )
    await db.commit()
    await generate_public_file(db)
    await db.refresh(notice)
    return _response(notice, source_type, source_id, source)


@management.post("/{source_type}/{source_id}/close", response_model=PublicStatusResponse)
async def close_public_status(
    source_type: SourceType,
    source_id: UUID,
    payload: ClosePublicStatus,
    request: Request,
    db: DbSession,
    user: EditorUser,
) -> PublicStatusResponse:
    if source_type == "shutdown":
        raise HTTPException(status.HTTP_409_CONFLICT, "Vandlukninger afsluttes automatisk ved det forventede sluttidspunkt")
    source = await _source_or_404(db, source_type, source_id)
    notice = await _notice_or_404(db, source_type, source_id)
    if notice.status != "published":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only a published status can be closed")
    notice.status = "closed"
    notice.close_message = payload.message
    notice.closed_at = datetime.now(timezone.utc)
    notice.display_until = payload.display_until
    notice.updated_by = user.id
    _audit(db, request, user, "public_status.closed", notice)
    await db.commit()
    await generate_public_file(db)
    await db.refresh(notice)
    return _response(notice, source_type, source_id, source)


@management.post("/{source_type}/{source_id}/withdraw", response_model=PublicStatusResponse)
async def withdraw_public_status(
    source_type: SourceType,
    source_id: UUID,
    request: Request,
    db: DbSession,
    user: EditorUser,
) -> PublicStatusResponse:
    if source_type == "shutdown":
        raise HTTPException(status.HTTP_409_CONFLICT, "Aflys vandlukningen i stedet for at trække status tilbage")
    source = await _source_or_404(db, source_type, source_id)
    notice = await _notice_or_404(db, source_type, source_id)
    if notice.status not in ("draft", "published"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Public status is already final")
    notice.status = "withdrawn"
    notice.withdrawn_at = datetime.now(timezone.utc)
    notice.updated_by = user.id
    _audit(db, request, user, "public_status.withdrawn", notice)
    await db.commit()
    await generate_public_file(db)
    await db.refresh(notice)
    return _response(notice, source_type, source_id, source)


@router.get("/public/driftsstatus", response_model=PublicFeed)
async def public_driftsstatus(response: Response, db: DbSession) -> PublicFeed:
    response.headers["Cache-Control"] = "public, max-age=60"
    response.headers["Access-Control-Allow-Origin"] = "*"
    return await build_public_feed(db)


router.include_router(management)
