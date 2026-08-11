from datetime import date, timedelta
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import AuditLog, Inquiry, MapCorrection, Role, Task, User
from tests.conftest import login


async def add_user(email: str, role_name: str) -> None:
    async with SessionLocal() as session:
        role = await session.scalar(select(Role).where(Role.name == role_name))
        session.add(User(email=email, display_name=role_name, password_hash=hash_password("correct horse battery"), roles=[role]))
        await session.commit()


def inquiry_payload():
    return {
        "contact_name": "Resident Name",
        "contact_email": "resident@example.dk",
        "contact_phone": "+45 12345678",
        "address_text": "Main Street 1",
        "channel": "phone",
        "category": "water_quality",
        "description": "Resident supplied details that must not enter audit data",
        "priority": "high",
        "notes": "Internal personal note",
    }


async def test_inquiry_crud_updates_roles_and_safe_audit(client):
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post("/api/inquiries", json=inquiry_payload(), headers=headers)
    assert created.status_code == 201, created.text
    inquiry = created.json()
    assert inquiry["number"].endswith("-0001")
    assert inquiry["contact_email"] == "resident@example.dk"

    updated = await client.post(
        f"/api/inquiries/{inquiry['id']}/updates",
        json={"message": "Called resident with an update", "status": "in_progress"}, headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["updates"][0]["message"] == "Called resident with an update"
    assert (await client.get("/api/inquiries?status=in_progress&priority=high", headers=headers)).json()[0]["id"] == inquiry["id"]

    reader = await login(client, "reader@example.dk")
    reader_headers = {"Authorization": f"Bearer {reader}"}
    assert (await client.get(f"/api/inquiries/{inquiry['id']}", headers=reader_headers)).status_code == 200
    assert (await client.patch(f"/api/inquiries/{inquiry['id']}", json={"priority": "low"}, headers=reader_headers)).status_code == 403

    async with SessionLocal() as session:
        audits = (await session.scalars(select(AuditLog).where(AuditLog.object_type == "inquiry"))).all()
        serialized = str([row.new_data for row in audits])
        assert "Resident Name" not in serialized
        assert "resident@example.dk" not in serialized
        assert "Called resident" not in serialized
        assert "Internal personal note" not in serialized


async def test_case_lists_accept_repeated_status_filters(client):
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == "admin@example.dk"))
        inquiries = [
            Inquiry(
                number=f"HEN-2026-000{index}", contact_name="Resident", channel="phone",
                category="other", description="Details", status=value, created_by_id=user.id,
            )
            for index, value in enumerate(("new", "waiting"), 1)
        ]
        corrections = [
            MapCorrection(
                number=f"KOR-2026-000{index}", title="Correction", description="Details",
                category="other", geometry=f"POINT ({index} {index})", status=value,
                created_by_id=user.id,
            )
            for index, value in enumerate(("new", "assessed"), 1)
        ]
        tasks = [
            Task(title="Task", status=value, created_by_id=user.id)
            for value in ("open", "blocked")
        ]
        session.add_all([*inquiries, *corrections, *tasks])
        await session.commit()
        expected = {
            "/api/inquiries?status=new&status=waiting": {str(row.id) for row in inquiries},
            "/api/map-corrections?status=new&status=assessed": {str(row.id) for row in corrections},
            "/api/tasks?status=open&status=blocked": {str(row.id) for row in tasks},
        }

    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    for path, ids in expected.items():
        response = await client.get(path, headers=headers)
        assert response.status_code == 200, response.text
        assert {row["id"] for row in response.json()} == ids


async def test_inquiry_attachment_validation_download_auth_and_safe_audit(client):
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    inquiry = (await client.post("/api/inquiries", json=inquiry_payload(), headers=headers)).json()
    rejected = await client.post(
        f"/api/inquiries/{inquiry['id']}/attachments",
        files={"file": ("fake.png", b"not an image", "image/png")}, headers=headers,
    )
    assert rejected.status_code == 415

    content = b"%PDF-private resident attachment"
    accepted = await client.post(
        f"/api/inquiries/{inquiry['id']}/attachments",
        files={"file": ("../../resident-name.pdf", content, "application/pdf")}, headers=headers,
    )
    assert accepted.status_code == 200, accepted.text
    attachment = accepted.json()["attachments"][0]
    assert attachment["original_filename"] == "resident-name.pdf"
    client.cookies.clear()
    assert (await client.get(attachment["download_url"])).status_code == 401
    downloaded = await client.get(attachment["download_url"], headers=headers)
    assert downloaded.status_code == 200
    assert downloaded.content == content

    async with SessionLocal() as session:
        audit = await session.scalar(select(AuditLog).where(AuditLog.object_type == "inquiry_attachment"))
        assert audit.new_data["checksum_sha256"]
        assert "resident-name" not in str(audit.new_data)
        assert "private resident" not in str(audit.new_data)


async def test_supplier_permissions_and_options(client):
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    response = await client.post("/api/suppliers", json={
        "name": "Survey Partner", "contact_name": "Supplier Person",
        "email": "supplier@example.dk", "phone": "1234",
    }, headers=headers)
    assert response.status_code == 201, response.text
    supplier = response.json()
    assert (await client.get("/api/suppliers/options", headers=headers)).json() == [
        {"id": supplier["id"], "name": "Survey Partner"}
    ]

    reader = await login(client, "reader@example.dk")
    reader_headers = {"Authorization": f"Bearer {reader}"}
    assert (await client.get("/api/suppliers", headers=reader_headers)).status_code == 200
    assert (await client.patch(f"/api/suppliers/{supplier['id']}", json={"active": False}, headers=reader_headers)).status_code == 403

    duplicate = await client.post("/api/suppliers", json={"name": "survey partner"}, headers=headers)
    assert duplicate.status_code == 409


async def test_full_nine_stage_correction_workflow_geojson_and_search(client):
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    supplier = (await client.post("/api/suppliers", json={"name": "GIS Supplier"}, headers=headers)).json()
    users = (await client.get("/api/users/options", headers=headers)).json()
    admin_id = next(row["id"] for row in users if row["display_name"] == "Admin")
    response = await client.post("/api/map-corrections", json={
        "title": "Valve is misplaced", "description": "Reported offset",
        "category": "position", "priority": "critical", "longitude": 11.491,
        "latitude": 55.532, "assigned_to_id": admin_id, "supplier_id": supplier["id"],
    }, headers=headers)
    assert response.status_code == 201, response.text
    correction = response.json()
    assert abs(correction["location"]["longitude"] - 11.491) < 0.00001

    invalid = await client.post(f"/api/map-corrections/{correction['id']}/transitions",
                                json={"status": "closed"}, headers=headers)
    assert invalid.status_code == 422
    stages = ["assessed", "assigned", "sent_to_supplier", "supplier_accepted",
              "work_scheduled", "work_completed", "verified", "closed"]
    for stage in stages:
        response = await client.post(f"/api/map-corrections/{correction['id']}/transitions",
                                     json={"status": stage, "note": f"Private note for {stage}"}, headers=headers)
        assert response.status_code == 200, response.text
    correction = response.json()
    assert correction["status"] == "closed"
    assert [item["status"] for item in correction["history"]] == ["new", *stages]

    geojson = await client.get("/api/map-corrections/geojson", headers=headers)
    assert geojson.status_code == 200
    assert geojson.json()["features"][0]["properties"]["number"] == correction["number"]
    search = await client.get(f"/api/map/search?q={correction['number']}", headers=headers)
    assert search.status_code == 200
    assert search.json()[0]["type"] == "map_correction"

    async with SessionLocal() as session:
        audits = (await session.scalars(select(AuditLog).where(AuditLog.object_type == "map_correction"))).all()
        assert "Private note" not in str([row.new_data for row in audits])


async def test_map_correction_attachment_permissions_and_db_failure_cleanup(client, monkeypatch):
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    correction = (await client.post("/api/map-corrections", json={
        "title": "Photo evidence", "description": "Measured in field", "category": "position",
        "longitude": 11.491, "latitude": 55.532,
    }, headers=headers)).json()
    content = b"\x89PNG\r\n\x1a\nmap correction image"
    accepted = await client.post(
        f"/api/map-corrections/{correction['id']}/attachments",
        files={"file": ("field.png", content, "image/png")}, headers=headers,
    )
    assert accepted.status_code == 200, accepted.text
    attachment = accepted.json()["attachments"][0]
    assert (await client.get(attachment["download_url"], headers=headers)).content == content

    reader = await login(client, "reader@example.dk")
    reader_headers = {"Authorization": f"Bearer {reader}"}
    assert (await client.post(
        f"/api/map-corrections/{correction['id']}/attachments",
        files={"file": ("field.png", content, "image/png")}, headers=reader_headers,
    )).status_code == 403

    original_commit = AsyncSession.commit

    async def fail_commit(self):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr(AsyncSession, "commit", fail_commit)
    before = set(Path("test-uploads").iterdir())
    with pytest.raises(RuntimeError, match="database unavailable"):
        await client.post(
            f"/api/map-corrections/{correction['id']}/attachments",
            files={"file": ("orphan.jpg", b"\xff\xd8\xfforphan", "image/jpeg")}, headers=headers,
        )
    assert set(Path("test-uploads").iterdir()) == before
    monkeypatch.setattr(AsyncSession, "commit", original_commit)

    async with SessionLocal() as session:
        audit = await session.scalar(select(AuditLog).where(
            AuditLog.object_type == "map_correction_attachment",
            AuditLog.object_id == UUID(attachment["id"]),
        ))
        assert "field.png" not in str(audit.new_data)


async def test_board_can_create_correction_from_inquiry_but_cannot_transition(client):
    await add_user("board@example.dk", "board_member")
    admin = await login(client)
    inquiry = (await client.post("/api/inquiries", json=inquiry_payload(),
                                 headers={"Authorization": f"Bearer {admin}"})).json()
    board = await login(client, "board@example.dk")
    headers = {"Authorization": f"Bearer {board}"}
    payload = {"title": "From inquiry", "description": "Map report", "category": "other",
               "longitude": 11.5, "latitude": 55.5}
    assert (await client.post("/api/map-corrections", json=payload, headers=headers)).status_code == 403
    payload["inquiry_id"] = inquiry["id"]
    correction = await client.post("/api/map-corrections", json=payload, headers=headers)
    assert correction.status_code == 201, correction.text
    assert (await client.post(f"/api/map-corrections/{correction.json()['id']}/transitions",
                              json={"status": "assessed"}, headers=headers)).status_code == 403


async def test_tasks_relations_comments_and_dashboard_filters(client):
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    inquiry = (await client.post("/api/inquiries", json=inquiry_payload(), headers=headers)).json()
    admin_id = next(row["id"] for row in (await client.get("/api/users/options", headers=headers)).json()
                    if row["display_name"] == "Admin")
    yesterday = str(date.today() - timedelta(days=1))
    first = await client.post("/api/tasks", json={
        "title": "Call resident", "description": "Contains resident context", "priority": "critical",
        "due_date": yesterday, "assigned_to_id": admin_id, "inquiry_id": inquiry["id"],
    }, headers=headers)
    assert first.status_code == 201, first.text
    task = first.json()
    second = await client.post("/api/tasks", json={"title": "Unassigned task"}, headers=headers)
    assert second.status_code == 201

    commented = await client.post(f"/api/tasks/{task['id']}/comments",
                                  json={"message": "Private task comment"}, headers=headers)
    assert commented.status_code == 200
    assert commented.json()["comments"][0]["message"] == "Private task comment"
    for query in ("mine=true", "critical=true", "overdue=true"):
        rows = (await client.get(f"/api/tasks?{query}", headers=headers)).json()
        assert [row["id"] for row in rows] == [task["id"]]
    rows = (await client.get("/api/tasks?unassigned=true", headers=headers)).json()
    assert [row["id"] for row in rows] == [second.json()["id"]]
    relation = await client.get(f"/api/tasks?relation_type=inquiry&relation_id={inquiry['id']}", headers=headers)
    assert [row["id"] for row in relation.json()] == [task["id"]]

    invalid = await client.post("/api/tasks", json={
        "title": "Invalid", "inquiry_id": inquiry["id"], "incident_id": inquiry["id"],
    }, headers=headers)
    assert invalid.status_code == 422

    reader = await login(client, "reader@example.dk")
    reader_headers = {"Authorization": f"Bearer {reader}"}
    assert (await client.get("/api/tasks", headers=reader_headers)).status_code == 200
    assert (await client.post("/api/tasks", json={"title": "No"}, headers=reader_headers)).status_code == 403

    async with SessionLocal() as session:
        audits = (await session.scalars(select(AuditLog).where(AuditLog.object_type == "task"))).all()
        serialized = str([row.new_data for row in audits])
        assert "Private task comment" not in serialized
        assert "Contains resident context" not in serialized
