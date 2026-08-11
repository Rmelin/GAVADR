from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Address, Incident, PlannedShutdown, PlannedShutdownAddress, User
from tests.conftest import login


async def seed_history():
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == "admin@example.dk"))
        addresses = [
            Address(street_name="Åvej", house_number="1", postal_code="4293", city="Dianalund", geometry="POINT (1 1)"),
            Address(street_name="Bøgevej", house_number="2", postal_code="4293", city="Dianalund", geometry="POINT (2 2)"),
        ]
        session.add_all(addresses)
        await session.flush()
        records = [
            Incident(
                number="HÆN-2026-0001", title="Bekræftet brud", description="", type="confirmed_leak",
                priority="high", status="active", geometry="POINT (1 1)", address_id=addresses[0].id,
                registered_at=now - timedelta(days=2), created_by_id=user.id,
            ),
            Incident(
                number="HÆN-2026-0002", title="Gravearbejde", description="", type="planned_work",
                priority="low", status="resolved", geometry="POINT (2 2)", address_id=addresses[1].id,
                registered_at=now - timedelta(days=1), created_by_id=user.id,
            ),
            Incident(
                number="HÆN-2026-0003", title="Trykfald", description="", type="pressure_drop",
                priority="medium", status="assessing", geometry="POINT (2 2)", address_id=addresses[1].id,
                registered_at=now - timedelta(hours=12), created_by_id=user.id,
            ),
            PlannedShutdown(
                number="LUK-2026-0001", title="Vandlukning på Åvej", description="", status="planned",
                starts_at=now - timedelta(hours=2), expected_end_at=now + timedelta(hours=2), created_by_id=user.id,
            ),
        ]
        session.add_all(records)
        await session.flush()
        session.add(PlannedShutdownAddress(
            shutdown_id=records[3].id, address_id=addresses[0].id, source="manual", included=True
        ))
        await session.commit()


async def test_history_requires_authentication(client):
    assert (await client.get("/api/history")).status_code == 401
    assert (await client.get("/api/history/export.csv")).status_code == 401


async def test_history_combines_filters_and_summarizes_canonical_cases(client):
    await seed_history()
    token = await login(client, "reader@example.dk")
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get("/api/history?page_size=2", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"] == {
        "total": 4, "breaks": 1, "shutdowns": 1, "excavations": 1, "other_incidents": 1
    }
    assert body["total_pages"] == 2
    assert [item["category"] for item in body["items"]] == ["shutdown", "other_incident"]
    assert body["items"][0]["status"] == "in_progress"
    assert body["items"][0]["affected_address_count"] == 1

    filtered = await client.get("/api/history?category=shutdown&location=%C3%85vej", headers=headers)
    assert filtered.status_code == 200
    assert filtered.json()["summary"] == {
        "total": 1, "breaks": 0, "shutdowns": 1, "excavations": 0, "other_incidents": 0
    }
    assert filtered.json()["items"][0]["locations"] == ["Åvej 1, 4293 Dianalund"]


async def test_history_validates_dates_and_exports_all_filtered_rows(client):
    await seed_history()
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    invalid = await client.get("/api/history?from=2026-08-10&to=2026-08-01", headers=headers)
    assert invalid.status_code == 422

    exported = await client.get("/api/history/export.csv?category=break", headers=headers)
    assert exported.status_code == 200
    assert exported.content.startswith(b"\xef\xbb\xbf")
    text = exported.content.decode("utf-8-sig")
    assert "Dato;Type;Nummer;Titel;Status;Sted;Berørte adresser\r\n" in text
    assert "Bekræftet brud" in text
    assert "Gravearbejde" not in text


async def test_history_maps_every_incident_type_and_repeated_categories(client):
    now = datetime.now(timezone.utc)
    expected = {
        "suspected_leak": "break",
        "confirmed_leak": "break",
        "pressure_drop": "other_incident",
        "no_water": "other_incident",
        "discolored_water": "other_incident",
        "planned_work": "excavation",
        "defective_valve": "other_incident",
        "map_error": "other_incident",
        "other_operational_disruption": "other_incident",
    }
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == "admin@example.dk"))
        session.add_all([
            Incident(
                number=f"HÆN-2026-{index:04d}", title=incident_type, description="",
                type=incident_type, priority="low", status="new", geometry="POINT (1 1)",
                registered_at=now + timedelta(seconds=index), created_by_id=user.id,
            )
            for index, incident_type in enumerate(expected, 1)
        ])
        await session.commit()

    token = await login(client)
    response = await client.get(
        "/api/history?category=break&category=other_incident&page_size=100",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert {item["title"]: item["activity_type"] for item in items} == {
        key: value for key, value in expected.items() if value in {"break", "other_incident"}
    }
    assert all(item["category"] == item["activity_type"] for item in items)
