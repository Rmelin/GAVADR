from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from app.api import incidents as incidents_api
from app.db.session import SessionLocal
from app.models import Address, AuditLog, Incident, Notification
from app.services import notifications as notification_service
from tests.conftest import login


def payload(priority="medium"):
    return {
        "title": "Possible water main leak",
        "description": "Water observed near the road",
        "type": "suspected_leak",
        "priority": priority,
        "longitude": 11.491,
        "latitude": 55.532,
    }


async def create(client, priority="medium"):
    token = await login(client)
    response = await client.post(
        "/api/incidents", json=payload(priority), headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 201, response.text
    return token, response.json()


async def test_create_transforms_location_and_returns_stable_number(client):
    token, incident = await create(client)

    assert incident["number"].startswith("HÆN-")
    assert incident["number"].endswith("-0001")
    assert abs(incident["location"]["longitude"] - 11.491) < 0.00001
    assert abs(incident["location"]["latitude"] - 55.532) < 0.00001
    assert incident["activity_type"] == "break"
    response = await client.get("/api/incidents?status=new&priority=medium", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert [row["id"] for row in response.json()] == [incident["id"]]

    async with SessionLocal() as session:
        row = await session.scalar(select(Incident))
        assert row.geometry.startswith("POINT (")
        assert "11.491" not in row.geometry


async def test_list_accepts_repeated_status_filters(client):
    token, first = await create(client)
    headers = {"Authorization": f"Bearer {token}"}
    await client.patch(f"/api/incidents/{first['id']}", json={"status": "active"}, headers=headers)
    second = await client.post("/api/incidents", json=payload(), headers=headers)
    response = await client.get("/api/incidents?status=active&status=new", headers=headers)
    assert response.status_code == 200
    assert {item["id"] for item in response.json()} == {first["id"], second.json()["id"]}


async def test_create_uses_active_address_geometry_and_allows_empty_description(client):
    async with SessionLocal() as session:
        address = Address(
            street_name="Gadeledsvej", house_number="66A", postal_code="4200", city="Slagelse",
            geometry=incidents_api._point(11.503, 55.541), active=True,
        )
        session.add(address)
        await session.commit()
        address_id = address.id

    token = await login(client)
    body = payload()
    body.update({"description": "", "address_id": str(address_id)})
    body.pop("longitude")
    body.pop("latitude")
    response = await client.post("/api/incidents", json=body, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 201, response.text
    incident = response.json()
    assert incident["description"] == ""
    assert incident["address"] == {
        "id": str(address_id), "label": "Gadeledsvej 66A", "street_name": "Gadeledsvej",
        "house_number": "66A", "postal_code": "4200", "city": "Slagelse",
    }
    assert abs(incident["location"]["longitude"] - 11.503) < 0.00001
    listed = await client.get("/api/incidents", headers={"Authorization": f"Bearer {token}"})
    assert listed.json()[0]["address"]["id"] == str(address_id)

    async with SessionLocal() as session:
        row = await session.scalar(select(Incident))
        assert row.address_id == address_id
        assert row.geometry == incidents_api._point(11.503, 55.541)


async def test_create_rejects_inactive_address(client):
    async with SessionLocal() as session:
        address = Address(
            street_name="Lukketvej", house_number="1", postal_code="4200", city="Slagelse",
            geometry=incidents_api._point(11.5, 55.5), active=False,
        )
        session.add(address)
        await session.commit()
        address_id = address.id

    token = await login(client)
    body = payload()
    body["address_id"] = str(address_id)
    response = await client.post("/api/incidents", json=body, headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 422


async def test_reader_can_get_but_cannot_modify(client):
    _, incident = await create(client)
    reader = await login(client, "reader@example.dk")
    headers = {"Authorization": f"Bearer {reader}"}

    assert (await client.get(f"/api/incidents/{incident['id']}", headers=headers)).status_code == 200
    assert (await client.post("/api/incidents", json=payload(), headers=headers)).status_code == 403
    assert (await client.patch(f"/api/incidents/{incident['id']}", json={"status": "active"}, headers=headers)).status_code == 403
    assert (await client.post(f"/api/incidents/{incident['id']}/updates", json={"message": "No"}, headers=headers)).status_code == 403


async def test_transitions_append_history_and_safe_audit(client):
    token, incident = await create(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.post(
        f"/api/incidents/{incident['id']}/updates",
        json={"message": "Leak confirmed", "status": "active"},
        headers=headers,
    )
    assert response.status_code == 200
    update = response.json()["updates"][0]
    assert update["message"] == "Leak confirmed"
    assert update["status"] == "active"
    assert update["author"]["display_name"] == "Admin"

    invalid = await client.patch(
        f"/api/incidents/{incident['id']}", json={"status": "closed"}, headers=headers
    )
    assert invalid.status_code == 422

    async with SessionLocal() as session:
        audits = (await session.scalars(select(AuditLog).order_by(AuditLog.created_at))).all()
        comment = next(row for row in audits if row.action == "comment")
        assert comment.new_data["message_length"] == len("Leak confirmed")
        assert "Leak confirmed" not in str(comment.new_data)


async def test_upload_validates_content_persists_and_requires_auth_for_download(client):
    token, incident = await create(client)
    headers = {"Authorization": f"Bearer {token}"}

    rejected = await client.post(
        f"/api/incidents/{incident['id']}/attachments",
        files={"file": ("fake.png", b"not an image", "image/png")},
        headers=headers,
    )
    assert rejected.status_code == 415

    content = b"\x89PNG\r\n\x1a\n" + b"synthetic image content"
    accepted = await client.post(
        f"/api/incidents/{incident['id']}/attachments",
        files={"file": ("../../photo.png", content, "image/png")},
        headers=headers,
    )
    assert accepted.status_code == 200
    attachment = accepted.json()["attachments"][0]
    assert attachment["original_filename"] == "photo.png"
    client.cookies.clear()
    assert (await client.get(attachment["download_url"])).status_code == 401
    downloaded = await client.get(attachment["download_url"], headers=headers)
    assert downloaded.status_code == 200
    assert downloaded.content == content
    files = list(Path("test-uploads").iterdir())
    assert len(files) == 1
    assert files[0].name.endswith(".png") and files[0].name != "photo.png"


async def test_high_priority_notification_records_skip_without_smtp(client, monkeypatch):
    monkeypatch.setattr(incidents_api.settings, "smtp_host", None)
    _, incident = await create(client, "high")

    async with SessionLocal() as session:
        record = await session.scalar(select(Notification).where(Notification.incident_id == UUID(incident["id"])))
        assert record.status == "skipped"


async def test_critical_notification_sends_in_thread_and_records_success(client, monkeypatch):
    sent = []
    monkeypatch.setattr(incidents_api.settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(incidents_api.settings, "smtp_from", "system@example.dk")
    monkeypatch.setattr(incidents_api.settings, "board_notification_emails", ["board@example.dk"])
    monkeypatch.setattr(notification_service, "_send_smtp", lambda settings, message: sent.append(message))

    _, incident = await create(client, "critical")

    assert len(sent) == 1
    async with SessionLocal() as session:
        record = await session.scalar(select(Notification).where(Notification.incident_id == UUID(incident["id"])))
        assert record.status == "sent"
        assert record.sent_at is not None


async def test_active_user_options_are_authenticated(client):
    assert (await client.get("/api/users/options")).status_code == 401
    reader = await login(client, "reader@example.dk")
    response = await client.get("/api/users/options", headers={"Authorization": f"Bearer {reader}"})
    assert response.status_code == 200
    assert {item["display_name"] for item in response.json()} == {"Admin", "Reader"}
