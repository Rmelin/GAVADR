from collections import defaultdict, deque
from datetime import UTC, datetime
from time import monotonic

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.security import create_access_token, verify_password
from app.models import AuditLog, User
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])
attempts: dict[str, deque[float]] = defaultdict(deque)


def user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        is_active=user.is_active,
        roles=[role.name for role in user.roles],
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def enforce_login_rate_limit(key: str) -> None:
    settings = get_settings()
    now = monotonic()
    bucket = attempts[key]
    while bucket and bucket[0] <= now - settings.login_rate_window_seconds:
        bucket.popleft()
    if len(bucket) >= settings.login_rate_limit:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many login attempts",
            headers={"Retry-After": str(settings.login_rate_window_seconds)},
        )
    bucket.append(now)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, response: Response, db: DbSession) -> TokenResponse:
    client_ip = request.client.host if request.client else "unknown"
    key = client_ip
    enforce_login_rate_limit(key)
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not user.is_active or user.deleted_at or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    attempts.pop(key, None)
    user.last_login_at = datetime.now(UTC)
    token, expires_in = create_access_token(user.id)
    db.add(
        AuditLog(
            actor_user_id=user.id,
            action="login",
            object_type="user",
            object_id=user.id,
            ip_address=client_ip,
        )
    )
    await db.commit()
    settings = get_settings()
    response.set_cookie(
        settings.auth_cookie_name,
        token,
        max_age=expires_in,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="strict",
        path="/api",
    )
    return TokenResponse(access_token=token, expires_in=expires_in)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(settings.auth_cookie_name, path="/api", secure=settings.auth_cookie_secure, httponly=True, samesite="strict")


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> UserResponse:
    return user_response(user)
