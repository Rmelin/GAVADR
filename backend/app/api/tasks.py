from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, require_roles
from app.models import AuditLog, Incident, Inquiry, MapCorrection, Task, TaskComment, User
from app.schemas.incident import UserOption
from app.schemas.phase5 import (
    Priority, TaskCommentCreate, TaskCommentResponse, TaskCreate, TaskPatch, TaskResponse, TaskStatus,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])
EditorUser = Annotated[User, Depends(require_roles("admin", "board_member", "map_manager"))]


def _user(value: User | None) -> UserOption | None:
    return UserOption(id=value.id, display_name=value.display_name, email=value.email) if value else None


def _response(row: Task) -> TaskResponse:
    return TaskResponse(
        id=row.id, title=row.title, description=row.description, priority=row.priority, status=row.status,
        due_date=row.due_date, assigned_to=_user(row.assigned_to), incident_id=row.incident_id,
        inquiry_id=row.inquiry_id, correction_id=row.correction_id, created_by=_user(row.created_by),
        comments=[TaskCommentResponse(id=item.id, message=item.message, author=_user(item.author),
                                      created_at=item.created_at)
                  for item in row.comments if item.deleted_at is None],
        created_at=row.created_at, updated_at=row.updated_at,
    )


async def _get(db: DbSession, task_id: UUID) -> Task:
    row = await db.scalar(select(Task).where(Task.id == task_id, Task.deleted_at.is_(None)).execution_options(populate_existing=True))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    return row


async def _active_user(db: DbSession, user_id: UUID | None) -> User | None:
    if user_id is None:
        return None
    row = await db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True), User.deleted_at.is_(None)))
    if not row:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Assigned user is not active")
    return row


async def _relation(db: DbSession, values: dict) -> None:
    for field, model, label in (("incident_id", Incident, "Incident"), ("inquiry_id", Inquiry, "Inquiry"),
                                ("correction_id", MapCorrection, "Map correction")):
        value = values.get(field)
        if value and not await db.scalar(select(model.id).where(model.id == value, model.deleted_at.is_(None))):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{label} is unavailable")


def _audit(db: DbSession, request: Request, user: User, action: str, row: Task, data: dict) -> None:
    db.add(AuditLog(actor_user_id=user.id, action=action, object_type="task", object_id=row.id,
                    new_data=data, ip_address=request.client.host if request.client else None))


@router.get("", response_model=list[TaskResponse])
async def list_tasks(db: DbSession, user: CurrentUser,
                     task_status: Annotated[list[TaskStatus], Query(alias="status")] = [],
                     priority: Priority | None = None, assigned_to_id: UUID | None = None,
                     relation_type: Literal["incident", "inquiry", "correction"] | None = None,
                     relation_id: UUID | None = None, mine: bool = False, critical: bool = False,
                     overdue: bool = False, unassigned: bool = False) -> list[TaskResponse]:
    query = select(Task).where(Task.deleted_at.is_(None))
    if task_status:
        query = query.where(Task.status.in_(task_status))
    if priority:
        query = query.where(Task.priority == priority)
    if assigned_to_id:
        query = query.where(Task.assigned_to_id == assigned_to_id)
    if mine:
        query = query.where(Task.assigned_to_id == user.id)
    if critical:
        query = query.where(Task.priority == "critical")
    if overdue:
        query = query.where(Task.due_date < date.today(), Task.status.not_in(("done", "cancelled")))
    if unassigned:
        query = query.where(Task.assigned_to_id.is_(None))
    if relation_type and relation_id:
        query = query.where(getattr(Task, f"{relation_type}_id") == relation_id)
    rows = (await db.scalars(query.order_by(Task.due_date.is_(None), Task.due_date, Task.created_at.desc()))).unique().all()
    return [_response(row) for row in rows]


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, request: Request, db: DbSession, user: EditorUser) -> TaskResponse:
    values = payload.model_dump()
    await _relation(db, values)
    assignee = await _active_user(db, values.pop("assigned_to_id"))
    row = Task(**values, assigned_to=assignee, created_by=user, updated_by=user.id)
    db.add(row)
    await db.flush()
    _audit(db, request, user, "create", row, {"priority": row.priority, "status": row.status,
           "due_date": str(row.due_date) if row.due_date else None,
           "assigned_to_id": str(row.assigned_to_id) if row.assigned_to_id else None,
           "incident_id": str(row.incident_id) if row.incident_id else None,
           "inquiry_id": str(row.inquiry_id) if row.inquiry_id else None,
           "correction_id": str(row.correction_id) if row.correction_id else None})
    await db.commit()
    return _response(await _get(db, row.id))


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: UUID, db: DbSession, user: CurrentUser) -> TaskResponse:
    return _response(await _get(db, task_id))


@router.patch("/{task_id}", response_model=TaskResponse)
async def patch_task(task_id: UUID, payload: TaskPatch, request: Request,
                     db: DbSession, user: EditorUser) -> TaskResponse:
    row = await _get(db, task_id)
    changes = payload.model_dump(exclude_unset=True)
    if "assigned_to_id" in changes:
        row.assigned_to = await _active_user(db, changes.pop("assigned_to_id"))
    for field, value in changes.items():
        setattr(row, field, value)
    row.updated_by = user.id
    _audit(db, request, user, "update", row, {"changed_fields": sorted(payload.model_fields_set),
           "priority": row.priority, "status": row.status,
           "assigned_to_id": str(row.assigned_to_id) if row.assigned_to_id else None})
    await db.commit()
    return _response(await _get(db, row.id))


@router.post("/{task_id}/comments", response_model=TaskResponse)
async def add_comment(task_id: UUID, payload: TaskCommentCreate, request: Request,
                      db: DbSession, user: EditorUser) -> TaskResponse:
    row = await _get(db, task_id)
    item = TaskComment(task=row, author=user, message=payload.message, updated_by=user.id)
    db.add(item)
    row.updated_by = user.id
    await db.flush()
    _audit(db, request, user, "comment", row, {"comment_id": str(item.id),
           "message_length": len(item.message)})
    await db.commit()
    return _response(await _get(db, row.id))
