from uuid import UUID

import pytest
from fastapi import HTTPException
from starlette.requests import Request
from sqlalchemy import select

from app.api.users import update_user
from app.core.security import verify_password
from app.db.session import SessionLocal
from app.models import AuditLog, User
from app.schemas.user import UserUpdate
from tests.conftest import login


async def test_admin_can_list_users(client):
    token = await login(client)
    client.cookies.clear()

    response = await client.get("/api/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert len(response.json()) == 2


async def test_reader_cannot_list_users(client):
    token = await login(client, "reader@example.dk")
    client.cookies.clear()

    response = await client.get("/api/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


async def test_admin_can_create_user(client):
    token = await login(client)
    client.cookies.clear()

    response = await client.post(
        "/api/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "board@example.dk",
            "display_name": "Board member",
            "password": "a sufficiently long password",
            "roles": ["board_member"],
        },
    )

    assert response.status_code == 201
    assert response.json()["roles"] == ["board_member"]


async def test_password_reset_is_hashed_and_never_audited(client):
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    users = (await client.get("/api/users", headers=headers)).json()
    reader_id = next(user["id"] for user in users if user["email"] == "reader@example.dk")
    password = "new temporary password"

    response = await client.patch(f"/api/users/{reader_id}", headers=headers, json={"password": password})

    assert response.status_code == 200
    async with SessionLocal() as db:
        reader = await db.scalar(select(User).where(User.id == UUID(reader_id)))
        audit = await db.scalar(
            select(AuditLog).where(AuditLog.object_id == reader.id).order_by(AuditLog.created_at.desc())
        )
        assert verify_password(password, reader.password_hash)
        assert password not in str(audit.old_data)
        assert password not in str(audit.new_data)
        assert "password" not in str(audit.new_data).lower()


async def test_admin_cannot_deactivate_or_demote_self(client):
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    users = (await client.get("/api/users", headers=headers)).json()
    admin_id = next(user["id"] for user in users if user["email"] == "admin@example.dk")

    deactivate = await client.patch(f"/api/users/{admin_id}", headers=headers, json={"is_active": False})
    demote = await client.patch(f"/api/users/{admin_id}", headers=headers, json={"roles": ["reader"]})

    assert deactivate.status_code == 400
    assert demote.status_code == 400


async def test_cannot_deactivate_last_active_admin_even_with_another_actor():
    async with SessionLocal() as db:
        target = await db.scalar(select(User).where(User.email == "admin@example.dk"))
        actor = await db.scalar(select(User).where(User.email == "reader@example.dk"))
        admin_role = target.roles[0]
        actor.roles = [admin_role]
        actor.is_active = False
        await db.commit()
        request = Request({"type": "http", "client": ("127.0.0.1", 1234), "headers": []})

        with pytest.raises(HTTPException) as error:
            await update_user(target.id, UserUpdate(is_active=False), request, actor, db)

        assert error.value.status_code == 400
        assert "last active administrator" in error.value.detail.lower()


async def test_roles_are_limited_to_canonical_values(client):
    token = await login(client)
    response = await client.post(
        "/api/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "email": "bad@example.dk",
            "display_name": "Bad",
            "password": "long enough password",
            "roles": ["superadmin"],
        },
    )
    assert response.status_code == 422
