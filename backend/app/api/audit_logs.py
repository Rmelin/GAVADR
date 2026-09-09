from datetime import date, datetime, time, timezone
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import DbSession, require_roles
from app.models import AuditLog, PlannedShutdown, User

router = APIRouter(prefix="/audit-logs", tags=["audit logs"])
AuditViewer = Annotated[User, Depends(require_roles("admin", "board_member"))]
LOCAL_TIMEZONE = ZoneInfo("Europe/Copenhagen")


class AuditLogSummary(BaseModel):
    id: UUID
    actor_user_id: UUID | None
    actor_name: str
    action: str
    object_type: str
    object_id: UUID | None
    object_number: str | None = None
    object_title: str | None = None
    starts_at: datetime | None = None
    expected_end_at: datetime | None = None
    created_at: datetime


class AuditLogPage(BaseModel):
    items: list[AuditLogSummary]
    page: int
    page_size: int
    total: int
    total_pages: int


class AuditUserSummary(BaseModel):
    id: UUID
    display_name: str
    is_active: bool
    last_login_at: datetime | None


async def _summaries(db: DbSession, rows) -> list[AuditLogSummary]:
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
            actor_user_id=row.actor_user_id,
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


@router.get("", response_model=list[AuditLogSummary])
async def list_audit_logs(
    db: DbSession,
    user: AuditViewer,
    limit: int = Query(default=5, ge=1, le=20),
) -> list[AuditLogSummary]:
    rows = (await db.execute(
        select(AuditLog, User.display_name)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(limit)
    )).all()
    return await _summaries(db, rows)


@router.get("/activity", response_model=AuditLogPage)
async def list_activity(
    db: DbSession,
    user: AuditViewer,
    from_date: Annotated[date | None, Query(alias="from")] = None,
    to_date: Annotated[date | None, Query(alias="to")] = None,
    actor_user_id: UUID | None = None,
    activity_type: Literal["all", "login", "changes"] = "all",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
) -> AuditLogPage:
    query = select(AuditLog, User.display_name).outerjoin(User, User.id == AuditLog.actor_user_id)
    count_query = select(func.count()).select_from(AuditLog)
    conditions = []
    if from_date:
        conditions.append(AuditLog.created_at >= datetime.combine(from_date, time.min, LOCAL_TIMEZONE).astimezone(timezone.utc))
    if to_date:
        conditions.append(AuditLog.created_at <= datetime.combine(to_date, time.max, LOCAL_TIMEZONE).astimezone(timezone.utc))
    if actor_user_id:
        conditions.append(AuditLog.actor_user_id == actor_user_id)
    if activity_type == "login":
        conditions.append(AuditLog.action == "login")
    elif activity_type == "changes":
        conditions.append(AuditLog.action != "login")
    if conditions:
        query = query.where(*conditions)
        count_query = count_query.where(*conditions)
    total = int(await db.scalar(count_query) or 0)
    rows = (await db.execute(
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).all()
    return AuditLogPage(
        items=await _summaries(db, rows),
        page=page,
        page_size=page_size,
        total=total,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.get("/users", response_model=list[AuditUserSummary])
async def list_user_logins(db: DbSession, user: AuditViewer) -> list[AuditUserSummary]:
    users = (await db.scalars(
        select(User).where(User.deleted_at.is_(None)).order_by(User.display_name)
    )).all()
    return [
        AuditUserSummary(
            id=row.id,
            display_name=row.display_name,
            is_active=row.is_active,
            last_login_at=row.last_login_at,
        )
        for row in users
    ]
