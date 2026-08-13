import os
import shutil
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"
os.environ["AUTH_SECRET_KEY"] = "test-secret-key-at-least-thirty-two-characters"
os.environ["AUTH_COOKIE_SECURE"] = "false"
os.environ["UPLOAD_DIR"] = "test-uploads"
os.environ["PUBLIC_STATUS_DIR"] = "test-public-status"

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.security import hash_password
from app.api.auth import attempts
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.main import app
from app.models import Role, User


@pytest.fixture(autouse=True)
async def database():
    attempts.clear()
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL)"))
        await connection.execute(text("INSERT INTO alembic_version VALUES ('20260813_0017')"))
    async with SessionLocal() as session:
        roles = [
            Role(name="admin", description="Administrator"),
            Role(name="board_member", description="Bestyrelsesmedlem"),
            Role(name="map_manager", description="Kortansvarlig"),
            Role(name="reader", description="Læsebruger"),
        ]
        session.add_all(roles)
        await session.flush()
        session.add_all(
            [
                User(email="admin@example.dk", display_name="Admin", password_hash=hash_password("correct horse battery"), roles=[roles[0]]),
                User(email="reader@example.dk", display_name="Reader", password_hash=hash_password("correct horse battery"), roles=[roles[3]]),
            ]
        )
        await session.commit()
    yield
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.execute(text("DROP TABLE alembic_version"))
    from pathlib import Path

    upload_dir = Path("test-uploads")
    if upload_dir.exists():
        shutil.rmtree(upload_dir)
    public_status_dir = Path("test-public-status")
    if public_status_dir.exists():
        shutil.rmtree(public_status_dir)


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client


async def login(client: AsyncClient, email: str = "admin@example.dk") -> str:
    response = await client.post("/api/auth/login", json={"email": email, "password": "correct horse battery"})
    assert response.status_code == 200
    return response.json()["access_token"]
