from datetime import datetime, timezone

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Role, User
from tests.conftest import login


async def test_audit_feed_requires_login_and_exposes_only_safe_summary(client):
    assert (await client.get("/api/audit-logs")).status_code == 401
    reader_token = await login(client, "reader@example.dk")
    assert (await client.get("/api/audit-logs", headers={"Authorization": f"Bearer {reader_token}"})).status_code == 403
    token = await login(client)
    response = await client.get("/api/audit-logs?limit=2", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert len(response.json()) == 2
    entry = next(item for item in response.json() if item["actor_name"] == "Admin")
    assert set(entry) == {"id", "actor_user_id", "actor_name", "action", "object_type", "object_id", "object_number", "object_title", "starts_at", "expected_end_at", "created_at"}
    assert entry["action"] == "login"
    assert entry["object_title"] is None


async def test_board_member_can_filter_activity_and_view_last_logins(client):
    async with SessionLocal() as session:
        board_role = await session.scalar(select(Role).where(Role.name == "board_member"))
        board = User(
            email="board@example.dk",
            display_name="Bestyrelsen",
            password_hash=(await session.scalar(select(User.password_hash).where(User.email == "admin@example.dk"))),
            roles=[board_role],
        )
        session.add(board)
        await session.commit()

    board_token = await login(client, "board@example.dk")
    headers = {"Authorization": f"Bearer {board_token}"}
    response = await client.get("/api/audit-logs/activity?activity_type=login&page_size=1", headers=headers)
    assert response.status_code == 200
    assert response.json()["total"] >= 1
    assert response.json()["items"][0]["action"] == "login"

    users = await client.get("/api/audit-logs/users", headers=headers)
    assert users.status_code == 200
    board_summary = next(user for user in users.json() if user["display_name"] == "Bestyrelsen")
    assert datetime.fromisoformat(board_summary["last_login_at"]).astimezone(timezone.utc)
