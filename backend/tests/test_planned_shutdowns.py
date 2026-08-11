from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import (
    Address,
    AuditLog,
    ClosureArea,
    ClosureAreaAddress,
    ClosureScenario,
    ClosureScenarioArea,
    ClosureScenarioValve,
    Incident,
    PlannedShutdown,
    Role,
    User,
    Valve,
)
from tests.conftest import login


async def seed_network():
    async with SessionLocal() as session:
        addresses = [
            Address(
                external_address_id=f"SHUTDOWN-{index}", street_name="Åvej", house_number=str(index),
                postal_code="4293", city="Dianalund", geometry=f"POINT ({654900 + index} 6169200)",
            )
            for index in range(1, 4)
        ]
        valve = Valve(code="SHUT-V-1", geometry="POINT (654900 6169200)", valve_type="gate")
        area = ClosureArea(
            name="Shutdown test area",
            geometry="MULTIPOLYGON (((654800 6169100, 655000 6169100, 655000 6169300, 654800 6169300, 654800 6169100)))",
        )
        session.add_all([*addresses, valve, area])
        await session.flush()
        scenario = ClosureScenario(name="Luk hovedhane")
        session.add(scenario)
        await session.flush()
        session.add_all([ClosureScenarioArea(scenario_id=scenario.id, closure_area_id=area.id), ClosureScenarioValve(scenario_id=scenario.id, valve_id=valve.id)])
        session.add_all([
            ClosureAreaAddress(closure_area_id=area.id, address_id=addresses[0].id),
            ClosureAreaAddress(closure_area_id=area.id, address_id=addresses[1].id),
        ])
        await session.commit()
        return valve.id, [address.id for address in addresses], area.id


def shutdown_payload(valve_id):
    starts_at = datetime.now(timezone.utc) + timedelta(days=2)
    return {
        "title": "Planlagt arbejde på Åvej",
        "description": "Udskiftning af komponent",
        "starts_at": starts_at.isoformat(),
        "expected_end_at": (starts_at + timedelta(hours=3)).isoformat(),
        "valve_ids": [str(valve_id)],
    }


async def create_shutdown(client):
    valve_id, address_ids, area_id = await seed_network()
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    response = await client.post("/api/planned-shutdowns", json=shutdown_payload(valve_id), headers=headers)
    assert response.status_code == 201, response.text
    return headers, response.json(), valve_id, address_ids, area_id


async def test_create_derives_and_persists_areas_and_addresses(client):
    headers, shutdown, valve_id, address_ids, area_id = await create_shutdown(client)

    assert shutdown["number"].startswith("LUK-") and shutdown["number"].endswith("-0001")
    assert shutdown["valves"] == [{"id": str(valve_id), "code": "SHUT-V-1"}]
    assert shutdown["closure_areas"] == [{"id": str(area_id), "name": "Shutdown test area"}]
    assert {row["id"] for row in shutdown["addresses"]} == {str(value) for value in address_ids[:2]}
    assert shutdown["affected_address_count"] == 2
    assert shutdown["activity_type"] == "shutdown"

    listed = await client.get("/api/planned-shutdowns", headers=headers)
    detailed = await client.get(f"/api/planned-shutdowns/{shutdown['id']}", headers=headers)
    assert listed.status_code == detailed.status_code == 200
    assert listed.json()[0]["id"] == shutdown["id"]

    async with SessionLocal() as session:
        row = await session.scalar(select(PlannedShutdown).where(PlannedShutdown.id == UUID(shutdown["id"])))
        assert len(row.area_links) == 1
        assert len(row.address_links) == 2


async def test_incident_relations_create_replace_reverse_validation_and_permissions(client):
    valve_id, _, _ = await seed_network()
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    incident_responses = [
        await client.post("/api/incidents", json={
            "title": title, "description": "", "type": incident_type, "priority": "medium",
            "longitude": 11.491 + index / 1000, "latitude": 55.532,
        }, headers=headers)
        for index, (title, incident_type) in enumerate((
            ("Leak", "confirmed_leak"), ("Pressure", "pressure_drop")
        ))
    ]
    incident_ids = [response.json()["id"] for response in incident_responses]
    payload = shutdown_payload(valve_id) | {"incident_ids": [incident_ids[0], incident_ids[0]]}
    created = await client.post("/api/planned-shutdowns", json=payload, headers=headers)
    assert created.status_code == 201, created.text
    shutdown = created.json()
    assert [item["id"] for item in shutdown["incidents"]] == [incident_ids[0]]
    assert shutdown["incidents"][0]["activity_type"] == "break"

    reverse = await client.get(f"/api/incidents/{incident_ids[0]}", headers=headers)
    assert [item["id"] for item in reverse.json()["planned_shutdowns"]] == [shutdown["id"]]

    replaced = await client.put(
        f"/api/planned-shutdowns/{shutdown['id']}/incidents",
        json={"incident_ids": [incident_ids[1], incident_ids[1]]}, headers=headers,
    )
    assert replaced.status_code == 200, replaced.text
    assert [item["id"] for item in replaced.json()["incidents"]] == [incident_ids[1]]
    assert (await client.get(f"/api/incidents/{incident_ids[0]}", headers=headers)).json()["planned_shutdowns"] == []

    invalid = await client.put(
        f"/api/planned-shutdowns/{shutdown['id']}/incidents",
        json={"incident_ids": ["00000000-0000-0000-0000-000000000000"]}, headers=headers,
    )
    assert invalid.status_code == 422
    assert [item["id"] for item in (await client.get(
        f"/api/planned-shutdowns/{shutdown['id']}", headers=headers
    )).json()["incidents"]] == [incident_ids[1]]

    async with SessionLocal() as session:
        incident = await session.get(Incident, UUID(incident_ids[0]))
        incident.deleted_at = datetime.now(timezone.utc)
        await session.commit()
    soft_deleted = await client.put(
        f"/api/planned-shutdowns/{shutdown['id']}/incidents",
        json={"incident_ids": [incident_ids[0]]}, headers=headers,
    )
    assert soft_deleted.status_code == 422

    reader = await login(client, "reader@example.dk")
    reader_headers = {"Authorization": f"Bearer {reader}"}
    assert (await client.get(
        f"/api/planned-shutdowns/{shutdown['id']}", headers=reader_headers
    )).status_code == 200
    assert (await client.put(
        f"/api/planned-shutdowns/{shutdown['id']}/incidents",
        json={"incident_ids": []}, headers=reader_headers,
    )).status_code == 403

    async with SessionLocal() as session:
        audit = await session.scalar(select(AuditLog).where(
            AuditLog.object_type == "planned_shutdown", AuditLog.action == "select_incidents"
        ))
        assert audit.old_data == {"incident_ids": [incident_ids[0]]}
        assert audit.new_data == {"incident_ids": [incident_ids[1]]}


async def test_list_accepts_repeated_effective_status_filters(client):
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == "admin@example.dk"))
        rows = [
            PlannedShutdown(
                number=f"LUK-2026-000{index}", title=value, description="", status=value,
                starts_at=now + timedelta(days=1), created_by_id=user.id,
            )
            for index, value in enumerate(("draft", "planned"), 1)
        ]
        session.add_all(rows)
        await session.commit()
        ids = {str(row.id) for row in rows}

    token = await login(client)
    response = await client.get(
        "/api/planned-shutdowns?status=draft&status=planned",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    assert {row["id"] for row in response.json()} == ids


async def test_ring_requires_complete_scenario_and_accepts_alternative(client):
    async with SessionLocal() as session:
        address = Address(external_address_id="RING-1", street_name="Ringvej", house_number="1", postal_code="4293", city="Dianalund", geometry="POINT (654900 6169200)")
        second_address = Address(external_address_id="RING-2", street_name="Ringvej", house_number="2", postal_code="4293", city="Dianalund", geometry="POINT (655200 6169200)")
        valves = [Valve(code=f"RING-V-{index}", geometry=f"POINT ({654900 + index} 6169200)", valve_type="gate") for index in range(1, 4)]
        area = ClosureArea(name="Ringområde", geometry="MULTIPOLYGON (((654800 6169100, 655000 6169100, 655000 6169300, 654800 6169300, 654800 6169100)))")
        second_area = ClosureArea(name="Ringområde syd", geometry="MULTIPOLYGON (((655100 6169100, 655300 6169100, 655300 6169300, 655100 6169300, 655100 6169100)))")
        session.add_all([address, second_address, *valves, area, second_area])
        await session.flush()
        ring = ClosureScenario(name="Luk begge ender")
        alternative = ClosureScenario(name="Luk alternativ hovedhane")
        session.add_all([ring, alternative])
        await session.flush()
        session.add_all([
            ClosureScenarioArea(scenario_id=ring.id, closure_area_id=area.id),
            ClosureScenarioArea(scenario_id=ring.id, closure_area_id=second_area.id),
            ClosureScenarioArea(scenario_id=alternative.id, closure_area_id=area.id),
            ClosureScenarioArea(scenario_id=alternative.id, closure_area_id=second_area.id),
            ClosureScenarioValve(scenario_id=ring.id, valve_id=valves[0].id),
            ClosureScenarioValve(scenario_id=ring.id, valve_id=valves[1].id),
            ClosureScenarioValve(scenario_id=alternative.id, valve_id=valves[2].id),
            ClosureAreaAddress(closure_area_id=area.id, address_id=address.id),
            ClosureAreaAddress(closure_area_id=second_area.id, address_id=second_address.id),
        ])
        await session.commit()
        valve_ids = [valve.id for valve in valves]
        expected_areas = {str(area.id): "Ringområde", str(second_area.id): "Ringområde syd"}

    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}

    incomplete_payload = shutdown_payload(valve_ids[0])
    incomplete_payload["title"] = "Kun den ene ende"
    incomplete = await client.post("/api/planned-shutdowns", json=incomplete_payload, headers=headers)
    assert incomplete.status_code == 201, incomplete.text
    assert incomplete.json()["closure_areas"] == []

    ring_payload = shutdown_payload(valve_ids[0])
    ring_payload.update({"title": "Begge ender", "valve_ids": [str(valve_ids[0]), str(valve_ids[1])]})
    ring_shutdown = await client.post("/api/planned-shutdowns", json=ring_payload, headers=headers)
    assert ring_shutdown.status_code == 201, ring_shutdown.text
    assert {row["id"]: row["name"] for row in ring_shutdown.json()["closure_areas"]} == expected_areas
    assert ring_shutdown.json()["affected_address_count"] == 2

    alternative_payload = shutdown_payload(valve_ids[2])
    alternative_payload["title"] = "Alternativ hovedhane"
    alternative_shutdown = await client.post("/api/planned-shutdowns", json=alternative_payload, headers=headers)
    assert alternative_shutdown.status_code == 201, alternative_shutdown.text
    assert {row["id"]: row["name"] for row in alternative_shutdown.json()["closure_areas"]} == expected_areas


async def test_recalculation_preserves_manual_corrections_and_information(client):
    headers, shutdown, valve_id, address_ids, _ = await create_shutdown(client)
    shutdown_id = shutdown["id"]

    excluded = await client.patch(
        f"/api/planned-shutdowns/{shutdown_id}/addresses/{address_ids[0]}",
        json={"included": False, "informed": True}, headers=headers,
    )
    assert excluded.status_code == 200
    manual = await client.post(
        f"/api/planned-shutdowns/{shutdown_id}/addresses",
        json={"address_id": str(address_ids[2])}, headers=headers,
    )
    assert manual.status_code == 200

    recalculated = await client.put(
        f"/api/planned-shutdowns/{shutdown_id}/valves",
        json={"valve_ids": [str(valve_id)]}, headers=headers,
    )
    assert recalculated.status_code == 200, recalculated.text
    by_id = {row["id"]: row for row in recalculated.json()["addresses"]}
    assert by_id[str(address_ids[0])]["included"] is False
    assert by_id[str(address_ids[0])]["informed"] is True
    assert by_id[str(address_ids[2])]["source"] == "manual"
    assert by_id[str(address_ids[2])]["included"] is True


async def test_bulk_and_per_address_information_state(client):
    headers, shutdown, _, address_ids, _ = await create_shutdown(client)
    path = f"/api/planned-shutdowns/{shutdown['id']}"

    bulk = await client.patch(f"{path}/addresses/informed", json={"informed": True}, headers=headers)
    assert bulk.status_code == 200
    assert bulk.json()["informed_address_count"] == 2
    assert all(row["informed_at"] for row in bulk.json()["addresses"])

    single = await client.patch(
        f"{path}/addresses/{address_ids[0]}", json={"informed": False}, headers=headers
    )
    assert single.status_code == 200
    row = next(item for item in single.json()["addresses"] if item["id"] == str(address_ids[0]))
    assert row["informed"] is False and row["informed_at"] is None and row["informed_by"] is None
    assert single.json()["informed_address_count"] == 1


async def test_csv_is_semicolon_delimited_utf8_bom_and_only_includes_affected(client):
    headers, shutdown, _, address_ids, _ = await create_shutdown(client)
    path = f"/api/planned-shutdowns/{shutdown['id']}"
    await client.patch(f"{path}/addresses/{address_ids[0]}", json={"included": False}, headers=headers)
    exported = await client.get(f"{path}/addresses.csv", headers=headers)

    assert exported.status_code == 200
    assert exported.content.startswith(b"\xef\xbb\xbf")
    decoded = exported.content.decode("utf-8-sig")
    assert decoded.splitlines()[0] == "Vejnavn;Husnummer;Postnummer;By;Informeret"
    assert "Åvej;2;4293;Dianalund;nej" in decoded
    assert "Åvej;1;" not in decoded
    assert exported.headers["content-disposition"].endswith('-adresser.csv"')


async def test_reader_reads_and_exports_but_cannot_mutate(client):
    _, shutdown, valve_id, address_ids, _ = await create_shutdown(client)
    reader = await login(client, "reader@example.dk")
    headers = {"Authorization": f"Bearer {reader}"}
    path = f"/api/planned-shutdowns/{shutdown['id']}"

    assert (await client.get(path, headers=headers)).status_code == 200
    assert (await client.get(f"{path}/addresses.csv", headers=headers)).status_code == 200
    assert (await client.post("/api/planned-shutdowns", json=shutdown_payload(valve_id), headers=headers)).status_code == 403
    assert (await client.patch(path, json={"status": "planned"}, headers=headers)).status_code == 403
    assert (await client.patch(
        f"{path}/addresses/{address_ids[0]}", json={"included": False}, headers=headers
    )).status_code == 403


async def test_board_member_can_mutate_and_actions_are_audited(client):
    valve_id, _, _ = await seed_network()
    async with SessionLocal() as session:
        role = await session.scalar(select(Role).where(Role.name == "board_member"))
        session.add(User(
            email="board@example.dk", display_name="Board", password_hash=hash_password("correct horse battery"),
            roles=[role],
        ))
        await session.commit()
    token = await login(client, "board@example.dk")
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post("/api/planned-shutdowns", json=shutdown_payload(valve_id), headers=headers)
    assert created.status_code == 201
    patched = await client.patch(
        f"/api/planned-shutdowns/{created.json()['id']}", json={"status": "cancelled"}, headers=headers
    )
    assert patched.status_code == 200

    async with SessionLocal() as session:
        audits = (await session.scalars(select(AuditLog).where(
            AuditLog.object_type == "planned_shutdown"
        ))).all()
        assert {row.action for row in audits} >= {"create", "update"}


async def test_assignee_contractor_filter_and_status_transitions(client):
    valve_id, _, _ = await seed_network()
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    async with SessionLocal() as session:
        assignee = await session.scalar(select(User).where(User.email == "admin@example.dk"))
        assignee_id = str(assignee.id)

    payload = shutdown_payload(valve_id) | {
        "assigned_to_id": assignee_id,
        "contractor": "Vand & Grav ApS",
    }
    created = await client.post("/api/planned-shutdowns", json=payload, headers=headers)
    assert created.status_code == 201, created.text
    assert created.json()["assigned_to"]["id"] == assignee_id
    assert created.json()["contractor"] == "Vand & Grav ApS"

    draft = await client.get("/api/planned-shutdowns?status=draft", headers=headers)
    planned = await client.get("/api/planned-shutdowns?status=planned", headers=headers)
    assert [row["id"] for row in draft.json()] == [created.json()["id"]]
    assert planned.json() == []

    invalid = await client.patch(
        f"/api/planned-shutdowns/{created.json()['id']}",
        json={"status": "planned"},
        headers=headers,
    )
    assert invalid.status_code == 422
