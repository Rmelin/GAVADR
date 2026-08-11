from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.db.session import SessionLocal
from app.models import PlannedShutdown
from tests.test_incidents import create as create_incident
from tests.test_planned_shutdowns import create_shutdown


async def test_dashboard_map_requires_login_and_returns_live_operations(client):
    assert (await client.get("/api/dashboard/map")).status_code == 401
    headers, shutdown, *_ = await create_shutdown(client)
    _, incident = await create_incident(client)
    async with SessionLocal() as session:
        row = await session.get(PlannedShutdown, UUID(shutdown["id"]))
        row.status = "planned"
        row.starts_at = datetime.now(timezone.utc) + timedelta(hours=1)
        row.expected_end_at = datetime.now(timezone.utc) + timedelta(hours=3)
        await session.commit()

    response = await client.get("/api/dashboard/map", headers=headers)
    assert response.status_code == 200
    features = response.json()["features"]
    assert {feature["properties"]["kind"] for feature in features} == {"incident", "shutdown"}
    assert {feature["geometry"]["type"] for feature in features} == {"Point"}
    assert {feature["properties"]["status"] for feature in features} == {"new", "planned"}
