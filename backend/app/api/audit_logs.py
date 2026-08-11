from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.models import AuditLog, PlannedShutdown, User

router = APIRouter(prefix="/audit-logs", tags=["audit logs"])


class AuditLogSummary(BaseModel):
    id: UUID
    actor_name: str
    action: str
    object_type: str
    object_id: UUID | None
    object_number: str | None = None
    object_title: str | None = None
    starts_at: datetime | None = None
    expected_end_at: datetime | None = None
    created_at: datetime


@router.get("", response_model=list[AuditLogSummary])
async def list_audit_logs(
    db: DbSession,
    user: CurrentUser,
    limit: int = Query(default=5, ge=1, le=20),
) -> list[AuditLogSummary]:
    rows = (await db.execute(
        select(AuditLog, User.display_name)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )).all()
    shutdown_ids = [
        row.object_id for row, _ in rows
        if row.object_type == "planned_shutdown" and row.object_id is not None
    ]
    shutdowns = {
        shutdown.id: shutdown for shutdown in (
            await db.scalars(select(PlannedShutdown).where(PlannedShutdown.id.in_(shutdown_ids)))
        ).all()
    } if shutdown_ids else {}
    return [
        AuditLogSummary(
            id=row.id,
            actor_name=display_name or "Systemet",
            action=row.action,
            object_type=row.object_type,
            object_id=row.object_id,
            object_number=shutdowns[row.object_id].number if row.object_id in shutdowns else None,
            object_title=shutdowns[row.object_id].title if row.object_id in shutdowns else None,
            starts_at=shutdowns[row.object_id].starts_at if row.object_id in shutdowns else None,
            expected_end_at=shutdowns[row.object_id].expected_end_at if row.object_id in shutdowns else None,
            created_at=row.created_at,
        )
        for row, display_name in rows
    ]
