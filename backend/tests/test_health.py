async def test_health_checks_database_migrations_and_filesystem(client):
    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "checks": {"backend": "ok", "database": "ok", "migrations": "ok", "filesystem": "ok"},
    }
