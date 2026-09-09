from datetime import UTC, datetime, timedelta
from uuid import UUID

import jwt
from pwdlib import PasswordHash

from app.core.config import get_settings

password_hasher = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def create_access_token(user_id: UUID, *, remember_me: bool = False) -> tuple[str, int]:
    settings = get_settings()
    lifetime = (
        timedelta(days=settings.auth_remember_days)
        if remember_me
        else timedelta(minutes=settings.auth_token_minutes)
    )
    expires = datetime.now(UTC) + lifetime
    token = jwt.encode(
        {"sub": str(user_id), "exp": expires, "iat": datetime.now(UTC), "type": "access"},
        settings.auth_secret_key,
        algorithm=settings.auth_algorithm,
    )
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> UUID:
    settings = get_settings()
    payload = jwt.decode(token, settings.auth_secret_key, algorithms=[settings.auth_algorithm])
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Invalid token type")
    return UUID(payload["sub"])
