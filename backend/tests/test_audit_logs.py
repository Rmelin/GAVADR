from tests.conftest import login


async def test_audit_feed_requires_login_and_exposes_only_safe_summary(client):
    assert (await client.get("/api/audit-logs")).status_code == 401
    token = await login(client)
    response = await client.get("/api/audit-logs?limit=1", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert len(response.json()) == 1
    entry = response.json()[0]
    assert set(entry) == {"id", "actor_name", "action", "object_type", "object_id", "object_number", "object_title", "starts_at", "expected_end_at", "created_at"}
    assert entry["actor_name"] == "Admin"
    assert entry["action"] == "login"
    assert entry["object_title"] is None
