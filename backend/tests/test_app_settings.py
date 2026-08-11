from sqlalchemy import select

from app.db.session import SessionLocal
from app.models import Address, AuditLog
from tests.conftest import login


async def test_public_branding_and_admin_only_update(client):
    public = await client.get("/api/app-settings/public")
    assert public.status_code == 200
    assert public.json()["organization_name"] == "GAVAD"
    assert public.json()["map_default_zoom"] == 13
    assert public.headers["cache-control"] == "no-cache, must-revalidate"
    assert public.headers["access-control-allow-origin"] == "*"

    reader = await login(client, "reader@example.dk")
    denied = await client.put("/api/app-settings", json={
        "organization_name": "Forkert", "organization_address": "", "organization_locality": "",
    }, headers={"Authorization": f"Bearer {reader}"})
    assert denied.status_code == 403

    admin = await login(client)
    saved = await client.put("/api/app-settings", json={
        "organization_name": "Dianalund Vand",
        "organization_address": "Vandværksvej 1",
        "organization_locality": "4293 Dianalund",
        "map_default_longitude": 12.282759,
        "map_default_latitude": 55.965711,
        "map_default_zoom": 14.5,
    }, headers={"Authorization": f"Bearer {admin}"})
    assert saved.status_code == 200, saved.text
    assert saved.json()["organization_name"] == "Dianalund Vand"
    assert saved.json()["map_default_longitude"] == 12.282759
    assert saved.json()["map_default_zoom"] == 14.5
    assert (await client.get("/api/app-settings/public")).json()["organization_locality"] == "4293 Dianalund"

    async with SessionLocal() as session:
        audit = await session.scalar(select(AuditLog).where(AuditLog.action == "app_settings.update"))
        assert audit.new_data["organization_name"] == "Dianalund Vand"
        assert audit.new_data["map_default_zoom"] == 14.5

    invalid_zoom = await client.put("/api/app-settings", json={
        "organization_name": "Dianalund Vand", "organization_address": "", "organization_locality": "",
        "map_default_zoom": 20,
    }, headers={"Authorization": f"Bearer {admin}"})
    assert invalid_zoom.status_code == 422


async def test_csv_address_preview_commit_duplicate_and_validation(client):
    token = await login(client)
    headers = {"Authorization": f"Bearer {token}"}
    content = (
        "eksternt_adresse_id;adresse;postnummer;lokalitet;x;y;aktiv;noter\n"
        "DAR-IMPORT-1;Gadeledsvej 66A;4293;Dianalund;654930.12;6169200.45;ja;Kontrolleret\n"
    ).encode()
    files = {"file": ("adresser.csv", content, "text/csv")}
    data = {"crs": "EPSG:25832", "commit": "false"}

    preview = await client.post("/api/app-settings/address-import", files=files, data=data, headers=headers)
    assert preview.status_code == 200, preview.text
    assert preview.json()["filename"] == "adresser.csv"
    assert preview.json()["new_rows"] == 1
    assert preview.json()["created_rows"] == 0
    assert preview.json()["errors"] == []

    committed = await client.post(
        "/api/app-settings/address-import", files=files,
        data={"crs": "EPSG:25832", "commit": "true"}, headers=headers,
    )
    assert committed.status_code == 200, committed.text
    assert committed.json()["committed"] is True
    assert committed.json()["created_rows"] == 1

    duplicate = await client.post("/api/app-settings/address-import", files=files, data=data, headers=headers)
    assert duplicate.json()["new_rows"] == 0
    assert duplicate.json()["skipped_rows"] == 1

    invalid = await client.post("/api/app-settings/address-import", files={
        "file": ("forkert.csv", b"adresse;postnummer;lokalitet;x;y\nUden husnummer;42;By;11;55\n", "text/csv")
    }, data={"crs": "EPSG:4326", "commit": "true"}, headers=headers)
    assert invalid.json()["committed"] is False
    assert invalid.json()["errors"]

    mixed_content = (
        "adresse;postnummer;lokalitet;longitude;latitude\n"
        "Birkevej 7;3400;Hillerød;12.282759;55.965711\n"
        "Adresse uden nummer;3400;Hillerød;12.282777;55.965430\n"
    ).encode()
    mixed = await client.post("/api/app-settings/address-import", files={
        "file": ("blandet.csv", mixed_content, "text/csv")
    }, data={"crs": "EPSG:4326", "commit": "true"}, headers=headers)
    assert mixed.status_code == 200, mixed.text
    assert mixed.json()["committed"] is True
    assert mixed.json()["created_rows"] == 1
    assert mixed.json()["skipped_rows"] == 1
    assert mixed.json()["errors"][0]["row"] == 3

    async with SessionLocal() as session:
        addresses = (await session.scalars(select(Address).where(Address.external_address_id == "DAR-IMPORT-1"))).all()
        audit = await session.scalar(select(AuditLog).where(AuditLog.action == "address.import"))
        assert len(addresses) == 1
        assert addresses[0].city == "Dianalund"
        assert audit.new_data["created"] == 1


async def test_address_import_requires_admin(client):
    reader = await login(client, "reader@example.dk")
    response = await client.post("/api/app-settings/address-import", files={
        "file": ("adresser.csv", b"adresse;postnummer;lokalitet;x;y\nTestvej 1;4293;Dianalund;654930;6169200\n", "text/csv")
    }, data={"crs": "EPSG:25832", "commit": "false"}, headers={"Authorization": f"Bearer {reader}"})
    assert response.status_code == 403
