import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from app.db.session import SessionLocal
from app.core.security import hash_password
from app.models import Incident, PlannedShutdown, PublicStatus, Role, User
from app.services.public_status import _write_atomic
from tests.conftest import login
from tests.test_incidents import create as create_incident
from tests.test_planned_shutdowns import create_shutdown


def draft(title: str = "Midlertidig lukning") -> dict:
    start = datetime.now(timezone.utc).replace(microsecond=0)
    return {
        "title": title,
        "message": "Vandet er midlertidigt lukket i et afgrænset område.",
        "areas": ["Bøgekrogen", "Gadeledsvej", "Bøgekrogen"],
        "start_at": start.isoformat(),
        "expected_end_at": (start + timedelta(hours=3)).isoformat(),
        "severity": "high",
    }


async def test_safe_empty_anonymous_feed_and_headers(client):
    response = await client.get("/api/public/driftsstatus")
    assert response.status_code == 200
    assert response.json() == {"updated_at": None, "status": "normal_drift", "items": []}
    assert response.headers["cache-control"] == "public, max-age=60"
    assert response.headers["access-control-allow-origin"] == "*"


async def test_draft_approval_snapshot_is_only_public_source(client):
    token, incident = await create_incident(client)
    headers = {"Authorization": f"Bearer {token}"}
    path = f"/api/public-status/incident/{incident['id']}"

    assert (await client.get(path, headers=headers)).status_code == 404
    saved = await client.put(f"{path}/draft", json=draft(), headers=headers)
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "draft"
    assert (await client.get("/api/public/driftsstatus")).json()["items"] == []

    approved = await client.post(f"{path}/approve", headers=headers)
    assert approved.status_code == 200, approved.text
    snapshot = approved.json()["approved_payload"]
    assert snapshot["title"] == "Midlertidig lukning"

    changed = await client.put(f"{path}/draft", json=draft("Intern ny kladde"), headers=headers)
    assert changed.status_code == 200
    assert changed.json()["approved_payload"] == snapshot
    public = (await client.get("/api/public/driftsstatus")).json()
    assert public["status"] == "driftsforstyrrelse"
    assert set(public["items"][0]) == {
        "source_type", "resolved", "active_now", "title", "message", "start_at", "expected_end_at", "severity", "areas", "updated_at"
    }
    assert public["items"][0]["source_type"] == "incident"
    assert public["items"][0]["resolved"] is False
    assert public["items"][0]["active_now"] is True
    assert public["items"][0]["title"] == "Midlertidig lukning"
    serialized = json.dumps(public)
    for forbidden in (incident["id"], incident["number"], "longitude", "latitude", "created_by"):
        assert forbidden not in serialized


async def test_permissions_source_marker_close_and_withdraw(client):
    token, incident = await create_incident(client)
    admin = {"Authorization": f"Bearer {token}"}
    reader_token = await login(client, "reader@example.dk")
    reader = {"Authorization": f"Bearer {reader_token}"}
    path = f"/api/public-status/incident/{incident['id']}"

    assert (await client.put(f"{path}/draft", json=draft(), headers=reader)).status_code == 403
    await client.put(f"{path}/draft", json=draft(), headers=admin)
    assert (await client.post(f"{path}/approve", headers=reader)).status_code == 403
    await client.post(f"{path}/approve", headers=admin)
    assert (await client.get(path, headers=reader)).status_code == 200

    await client.patch(
        f"/api/incidents/{incident['id']}", json={"title": "Internal source update"}, headers=admin
    )
    assert (await client.get(path, headers=reader)).json()["source_updated"] is True

    close = await client.post(f"{path}/close", json={
        "message": "Vandforsyningen er normal igen.",
        "display_until": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
    }, headers=admin)
    assert close.status_code == 200
    feed = (await client.get("/api/public/driftsstatus")).json()
    assert feed["items"][0]["message"] == "Vandforsyningen er normal igen."
    assert feed["items"][0]["resolved"] is True
    assert feed["status"] == "normal_drift"
    assert (await client.post(f"{path}/withdraw", headers=admin)).status_code == 409


async def test_withdraw_removes_notice_and_atomic_file_is_optional(client):
    token, incident = await create_incident(client)
    headers = {"Authorization": f"Bearer {token}"}
    path = f"/api/public-status/incident/{incident['id']}"
    await client.put(f"{path}/draft", json=draft(), headers=headers)

    # A missing configured directory must not make publication fail or create it implicitly.
    assert not Path("test-public-status").exists()
    assert (await client.post(f"{path}/approve", headers=headers)).status_code == 200
    assert not Path("test-public-status").exists()

    Path("test-public-status").mkdir()
    assert (await client.post(f"{path}/approve", headers=headers)).status_code == 200
    output = Path("test-public-status/driftsstatus.json")
    assert output.exists()
    assert json.loads(output.read_text())["items"][0]["title"] == "Midlertidig lukning"
    assert not list(output.parent.glob("*.tmp"))

    assert (await client.post(f"{path}/withdraw", headers=headers)).status_code == 200
    assert json.loads(output.read_text())["items"] == []

    async with SessionLocal() as session:
        notice = await session.scalar(select(PublicStatus))
        source = await session.scalar(select(Incident))
        assert notice.incident_id == source.id
        assert notice.planned_shutdown_id is None


async def test_board_member_can_publish_shutdown_and_order_is_deterministic(client):
    admin_headers, shutdown, *_ = await create_shutdown(client)
    async with SessionLocal() as session:
        role = await session.scalar(select(Role).where(Role.name == "board_member"))
        session.add(User(
            email="board@example.dk", display_name="Board", roles=[role],
            password_hash=hash_password("correct horse battery"),
        ))
        await session.commit()
    board_token = await login(client, "board@example.dk")
    board = {"Authorization": f"Bearer {board_token}"}
    shutdown_path = f"/api/public-status/shutdown/{shutdown['id']}"
    later = draft("Planlagt lukning")
    later["start_at"] = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    later["expected_end_at"] = (datetime.now(timezone.utc) + timedelta(days=2, hours=2)).isoformat()
    assert (await client.put(f"{shutdown_path}/draft", json=later, headers=board)).status_code == 200
    assert (await client.post(f"{shutdown_path}/approve", headers=board)).status_code == 200

    _, incident = await create_incident(client)
    incident_path = f"/api/public-status/incident/{incident['id']}"
    assert (await client.put(f"{incident_path}/draft", json=draft("Akut hændelse"), headers=admin_headers)).status_code == 200
    assert (await client.post(f"{incident_path}/approve", headers=admin_headers)).status_code == 200
    feed = (await client.get("/api/public/driftsstatus")).json()
    assert [item["title"] for item in feed["items"]] == ["Akut hændelse", "Planlagt lukning"]
    assert [item["source_type"] for item in feed["items"]] == ["incident", "shutdown"]

    async with SessionLocal() as session:
        shutdown_notice = await session.scalar(
            select(PublicStatus).where(PublicStatus.planned_shutdown_id == UUID(shutdown["id"]))
        )
        assert shutdown_notice.incident_id is None
        source = await session.get(PlannedShutdown, UUID(shutdown["id"]))
        assert source.status == "planned"
        assert source.starts_at.replace(tzinfo=timezone.utc) == datetime.fromisoformat(later["start_at"])
        assert source.expected_end_at.replace(tzinfo=timezone.utc) == datetime.fromisoformat(later["expected_end_at"])
        assert shutdown_notice.source_updated is False


async def test_shutdown_requires_approval_and_disappears_at_expected_end(client):
    headers, shutdown, *_ = await create_shutdown(client)
    now = datetime.now(timezone.utc)
    path = f"/api/public-status/shutdown/{shutdown['id']}"
    payload = draft("Planlagt arbejde på Åvej") | {
        "start_at": (now - timedelta(minutes=30)).isoformat(),
        "expected_end_at": (now + timedelta(hours=2)).isoformat(),
    }
    assert (await client.get("/api/public/driftsstatus")).json()["items"] == []
    assert (await client.put(f"{path}/draft", json=payload, headers=headers)).status_code == 200
    approved = await client.post(f"{path}/approve", headers=headers)
    assert approved.status_code == 200, approved.text
    assert approved.json()["needs_approval"] is False

    active = (await client.get("/api/public/driftsstatus")).json()
    assert active["status"] == "driftsforstyrrelse"
    assert active["items"][0]["active_now"] is True
    assert (await client.get(f"/api/planned-shutdowns/{shutdown['id']}", headers=headers)).json()["status"] == "in_progress"

    payload["expected_end_at"] = (now - timedelta(minutes=1)).isoformat()
    saved = await client.put(f"{path}/draft", json=payload, headers=headers)
    assert saved.status_code == 200
    assert saved.json()["needs_approval"] is True
    assert (await client.get("/api/public/driftsstatus")).json()["items"]
    assert (await client.post(f"{path}/approve", headers=headers)).status_code == 200
    ended = (await client.get("/api/public/driftsstatus")).json()
    assert ended["status"] == "normal_drift"
    assert ended["items"] == []
    assert (await client.get(f"/api/planned-shutdowns/{shutdown['id']}", headers=headers)).json()["status"] == "completed"


async def test_shutdown_requires_end_time_and_is_cancelled_through_one_workflow(client):
    headers, shutdown, *_ = await create_shutdown(client)
    path = f"/api/public-status/shutdown/{shutdown['id']}"
    payload = draft("Planlagt lukning")
    payload["start_at"] = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    payload["expected_end_at"] = None
    assert (await client.put(f"{path}/draft", json=payload, headers=headers)).status_code == 200
    assert (await client.post(f"{path}/approve", headers=headers)).status_code == 422

    payload["expected_end_at"] = (datetime.now(timezone.utc) + timedelta(days=1, hours=2)).isoformat()
    assert (await client.put(f"{path}/draft", json=payload, headers=headers)).status_code == 200
    assert (await client.post(f"{path}/approve", headers=headers)).status_code == 200
    assert (await client.post(f"{path}/close", json={"message": "Slut", "display_until": None}, headers=headers)).status_code == 409
    assert (await client.post(f"{path}/withdraw", headers=headers)).status_code == 409

    cancelled = await client.patch(
        f"/api/planned-shutdowns/{shutdown['id']}", json={"status": "cancelled"}, headers=headers
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert (await client.get("/api/public/driftsstatus")).json()["items"] == []
    assert (await client.get(path, headers=headers)).json()["status"] == "withdrawn"


def test_atomic_writer_keeps_previous_file_on_replace_failure(tmp_path, monkeypatch):
    path = tmp_path / "driftsstatus.json"
    path.write_bytes(b"previous\n")

    def fail_replace(source, destination):
        raise OSError("simulated filesystem failure")

    monkeypatch.setattr(os, "replace", fail_replace)
    try:
        _write_atomic(path, b"new\n")
    except OSError:
        pass
    assert path.read_bytes() == b"previous\n"
    assert list(tmp_path.iterdir()) == [path]
