from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from uuid import UUID

from app.api.auth import user_response
from app.api.deps import AdminUser, CurrentUser, DbSession
from app.core.security import hash_password
from app.models import AuditLog, Role, User
from app.schemas.user import UserCreate, UserResponse, UserUpdate
from app.schemas.incident import UserOption

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/options", response_model=list[UserOption])
async def user_options(_: CurrentUser, db: DbSession) -> list[UserOption]:
    users = (await db.scalars(
        select(User).where(User.is_active.is_(True), User.deleted_at.is_(None)).order_by(User.display_name)
    )).all()
    return [UserOption(id=user.id, display_name=user.display_name, email=user.email) for user in users]


async def resolve_roles(db: DbSession, names: list[str]) -> list[Role]:
    unique_names = set(names)
    roles = list((await db.scalars(select(Role).where(Role.name.in_(unique_names)))).all())
    if {role.name for role in roles} != unique_names:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "One or more roles are invalid")
    return roles


async def active_admin_count(db: DbSession) -> int:
    active_admin_ids = (await db.scalars(
        select(User.id)
        .join(User.roles)
        .where(User.is_active.is_(True), User.deleted_at.is_(None), Role.name == "admin")
        .order_by(User.id)
        .with_for_update(of=User)
    )).all()
    return len(active_admin_ids)


@router.get("", response_model=list[UserResponse])
async def list_users(_: AdminUser, db: DbSession) -> list[UserResponse]:
    users = (await db.scalars(select(User).order_by(User.email))).all()
    return [user_response(user) for user in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, request: Request, admin: AdminUser, db: DbSession) -> UserResponse:
    user = User(
        email=payload.email.lower(),
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        roles=await resolve_roles(db, payload.roles),
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email is already registered") from None
    db.add(
        AuditLog(
            actor_user_id=admin.id,
            action="create",
            object_type="user",
            object_id=user.id,
            new_data={"email": user.email, "roles": sorted(role.name for role in user.roles), "is_active": True},
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(user)
    return user_response(user)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(user_id: UUID, payload: UserUpdate, request: Request, admin: AdminUser, db: DbSession) -> UserResponse:
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    old_roles = sorted(role.name for role in user.roles)
    next_roles = set(payload.roles) if payload.roles is not None else set(old_roles)
    next_active = payload.is_active if payload.is_active is not None else user.is_active
    is_admin = "admin" in old_roles
    if user.id == admin.id and not next_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Administrators cannot deactivate themselves")
    if user.id == admin.id and "admin" not in next_roles:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Administrators cannot remove their own admin role")
    if user.is_active and is_admin and (not next_active or "admin" not in next_roles):
        if await active_admin_count(db) <= 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The last active administrator cannot be deactivated or demoted")

    old_data: dict[str, object] = {}
    new_data: dict[str, object] = {}
    if payload.display_name is not None:
        old_data["display_name"] = user.display_name
        new_data["display_name"] = payload.display_name
        user.display_name = payload.display_name
    if payload.is_active is not None:
        old_data["is_active"] = user.is_active
        new_data["is_active"] = payload.is_active
        user.is_active = payload.is_active
    if payload.roles is not None:
        old_data["roles"] = old_roles
        new_data["roles"] = sorted(next_roles)
        user.roles = await resolve_roles(db, payload.roles)
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
        new_data["credentials_changed"] = True
    db.add(
        AuditLog(
            actor_user_id=admin.id,
            action="update",
            object_type="user",
            object_id=user.id,
            old_data=old_data,
            new_data=new_data,
            ip_address=request.client.host if request.client else None,
        )
    )
    await db.commit()
    await db.refresh(user)
    return user_response(user)
