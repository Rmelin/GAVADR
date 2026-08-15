from app.db.session import SessionLocal
from sqlalchemy import select

from app.core.security import hash_password
from app.models import Address, AuditLog, ClosureArea, ClosureAreaAddress, ClosureScenario, ClosureScenarioArea, ClosureScenarioValve, Pipe, Role, User, Valve
from tests.conftest import login


async def seed_network():
    async with SessionLocal() as session:
        address = Address(
            external_address_id="SYN-TEST-1",
            street_name="Gavad Byvej",
            house_number="12",
            postal_code="4293",
            city="Dianalund",
            geometry="POINT (654930 6169200)",
            notes="Synthetic test address",
        )
        valve = Valve(
            code="SYN-V-101",
            geometry="POINT (654940 6169210)",
            valve_type="gate",
            network_level="distribution",
            accessibility="roadside",
        )
        pipe = Pipe(
            code="SYN-P-101",
            geometry="LINESTRING (654900 6169180, 655000 6169280)",
            pipe_type="distribution",
            material="PE",
            diameter_mm=110,
        )
        area = ClosureArea(
            name="Synthetic test area",
            geometry="MULTIPOLYGON (((654880 6169160, 655020 6169160, 655020 6169320, 654880 6169320, 654880 6169160)))",
            description="Synthetic relation test",
            confidence=0.8,
        )
        session.add_all([address, valve, pipe, area])
        await session.flush()
        scenario = ClosureScenario(name="Luk SYN-V-101")
        session.add_all([ClosureAreaAddress(closure_area_id=area.id, address_id=address.id), scenario])
        await session.flush()
        session.add_all([ClosureScenarioArea(scenario_id=scenario.id, closure_area_id=area.id), ClosureScenarioValve(scenario_id=scenario.id, valve_id=valve.id)])
        await session.commit()
        return address.id, valve.id, pipe.id, area.id


async def test_map_read_endpoints_require_authentication(client):
    for path in ("/api/addresses", "/api/valves", "/api/pipes", "/api/closure-areas", "/api/network-summary", "/api/map/search?q=Gavad"):
        response = await client.get(path)
        assert response.status_code == 401


async def test_reader_receives_wgs84_geojson_feature_collections(client):
    await seed_network()
    token = await login(client, "reader@example.dk")

    expected_types = {
        "/api/addresses": "Point",
        "/api/valves": "Point",
        "/api/pipes": "LineString",
        "/api/closure-areas": "MultiPolygon",
    }
    for path, geometry_type in expected_types.items():
        response = await client.get(path, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        body = response.json()
        assert body["type"] == "FeatureCollection"
        assert len(body["features"]) == 1
        assert body["features"][0]["type"] == "Feature"
        assert body["features"][0]["geometry"]["type"] == geometry_type
        assert body["features"][0]["properties"]["id"] == body["features"][0]["id"]

    address = (await client.get("/api/addresses", headers={"Authorization": f"Bearer {token}"})).json()["features"][0]
    longitude, latitude = address["geometry"]["coordinates"]
    assert 8 < longitude < 13
    assert 54 < latitude < 58
    assert address["properties"]["street_name"] == "Gavad Byvej"
    valve = (await client.get("/api/valves", headers={"Authorization": f"Bearer {token}"})).json()["features"][0]
    assert valve["properties"]["valve_type"] == "gate"
    assert valve["properties"]["network_level"] == "distribution"

    summary = (await client.get("/api/network-summary", headers={"Authorization": f"Bearer {token}"})).json()
    assert summary == {"active_addresses": 1, "valves": 1, "active_pipes": 1, "active_closure_areas": 1}


async def test_search_finds_supported_entities_and_returns_representative_points(client):
    await seed_network()
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}

    address_results = (await client.get("/api/map/search?q=Byvej", headers=headers)).json()
    valve_results = (await client.get("/api/map/search?q=SYN-V-101", headers=headers)).json()
    pipe_results = (await client.get("/api/map/search?q=SYN-P", headers=headers)).json()

    assert address_results[0]["type"] == "address"
    assert address_results[0]["label"] == "Gavad Byvej 12"
    assert valve_results[0]["type"] == "valve"
    assert valve_results[0]["label"] == "SYN-V-101"
    assert pipe_results[0]["type"] == "pipe"
    assert set(pipe_results[0]) == {"id", "type", "label", "subtitle", "longitude", "latitude"}
    assert len(address_results) <= 20


async def test_closure_area_exposes_valve_and_address_relations(client):
    address_id, valve_id, _, area_id = await seed_network()
    token = await login(client, "reader@example.dk")

    response = await client.get("/api/closure-areas", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    feature = response.json()["features"][0]
    assert feature["id"] == str(area_id)
    assert feature["properties"]["address_ids"] == [str(address_id)]
    assert feature["properties"]["valve_ids"] == [str(valve_id)]
    assert feature["properties"]["closure_scenarios"][0]["valve_ids"] == [str(valve_id)]
    assert feature["properties"]["closure_scenarios"][0]["area_ids"] == [str(area_id)]


async def test_map_manager_updates_relations_and_gets_polygon_candidates(client):
    address_id, valve_id, _, area_id = await seed_network()
    async with SessionLocal() as session:
        inside = Address(
            external_address_id="SYN-TEST-INSIDE", street_name="Gavad Byvej", house_number="14",
            postal_code="4293", city="Dianalund", geometry="POINT (654950 6169220)",
        )
        outside = Address(
            external_address_id="SYN-TEST-OUTSIDE", street_name="Fjernvej", house_number="1",
            postal_code="4293", city="Dianalund", geometry="POINT (660000 6175000)",
        )
        second_valve = Valve(code="SYN-V-102", geometry="POINT (654960 6169230)", valve_type="gate")
        role = await session.scalar(select(Role).where(Role.name == "map_manager"))
        session.add_all([inside, outside, second_valve, User(
            email="map@example.dk", display_name="Kortansvarlig",
            password_hash=hash_password("correct horse battery"), roles=[role],
        )])
        await session.commit()
        inside_id, outside_id, second_valve_id = inside.id, outside.id, second_valve.id

    reader = await login(client, "reader@example.dk")
    path = f"/api/closure-areas/{area_id}/relations"
    assert (await client.get(path, headers={"Authorization": f"Bearer {reader}"})).status_code == 403

    manager = await login(client, "map@example.dk")
    headers = {"Authorization": f"Bearer {manager}"}
    current = await client.get(path, headers=headers)
    assert current.status_code == 200, current.text
    assert set(current.json()["candidate_address_ids"]) == {str(address_id), str(inside_id)}
    assert str(outside_id) not in current.json()["candidate_address_ids"]
    updated = await client.put(path, json={
        "address_ids": [str(inside_id)],
    }, headers=headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["valve_ids"] == [str(valve_id)]
    assert updated.json()["address_ids"] == [str(inside_id)]

    reactivated = await client.put(path, json={
        "address_ids": [str(address_id)],
    }, headers=headers)
    assert reactivated.status_code == 200, reactivated.text
    assert reactivated.json()["valve_ids"] == [str(valve_id)]
    assert reactivated.json()["address_ids"] == [str(address_id)]

    rejected = await client.put(path, json={"address_ids": [], "scenarios": []}, headers=headers)
    assert rejected.status_code == 422

    async with SessionLocal() as session:
        audit = await session.scalar(select(AuditLog).where(AuditLog.action == "closure_area.relations_update"))
        assert audit.object_id == area_id


async def test_global_scenario_crud_links_multiple_areas_and_audits(client):
    _, valve_id, _, area_id = await seed_network()
    async with SessionLocal() as session:
        second_area = ClosureArea(name="Second scenario area", geometry="MULTIPOLYGON (((655100 6169100, 655300 6169100, 655300 6169300, 655100 6169300, 655100 6169100)))")
        second_valve = Valve(code="SYN-V-202", geometry="POINT (655200 6169200)", valve_type="gate")
        session.add_all([second_area, second_valve])
        await session.commit()
        second_area_id, second_valve_id = second_area.id, second_valve.id

    reader = await login(client, "reader@example.dk")
    assert (await client.get("/api/closure-scenarios", headers={"Authorization": f"Bearer {reader}"})).status_code == 403
    admin = await login(client)
    headers = {"Authorization": f"Bearer {admin}"}
    created = await client.post("/api/closure-scenarios", json={
        "name": "Luk begge forsyningsgrene",
        "area_ids": [str(area_id), str(second_area_id)],
        "valve_ids": [str(valve_id), str(second_valve_id)],
    }, headers=headers)
    assert created.status_code == 201, created.text
    body = created.json()
    assert set(body["area_ids"]) == {str(area_id), str(second_area_id)}
    assert set(body["valve_ids"]) == {str(valve_id), str(second_valve_id)}

    filtered = await client.get(f"/api/closure-scenarios?closure_area_id={second_area_id}", headers=headers)
    assert body["id"] in {row["id"] for row in filtered.json()}

    changed = await client.put(f"/api/closure-scenarios/{body['id']}", json={
        "name": "Luk hovedgren",
        "area_ids": [str(area_id), str(second_area_id)],
        "valve_ids": [str(valve_id)],
        "expected_updated_at": body["updated_at"],
    }, headers=headers)
    assert changed.status_code == 200, changed.text
    assert changed.json()["valve_ids"] == [str(valve_id)]

    stale = await client.put(f"/api/closure-scenarios/{body['id']}", json={
        "name": "Forældet", "area_ids": [str(area_id)], "valve_ids": [str(valve_id)],
        "expected_updated_at": body["updated_at"],
    }, headers=headers)
    assert stale.status_code == 409

    deleted = await client.delete(f"/api/closure-scenarios/{body['id']}", headers=headers)
    assert deleted.status_code == 204
    async with SessionLocal() as session:
        actions = set((await session.scalars(select(AuditLog.action).where(AuditLog.object_id == UUID(body["id"])))).all())
        assert {"closure_scenario.create", "closure_scenario.update", "closure_scenario.delete"}.issubset(actions)
from uuid import UUID
