import pytest
from pydantic import ValidationError

from app.core.config import Settings
from tests.conftest import login


async def test_login_and_me_support_bearer(client):
    token = await login(client)
    client.cookies.clear()

    response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["email"] == "admin@example.dk"
    assert response.json()["roles"] == ["admin"]


async def test_login_sets_http_only_cookie_and_logout_clears_it(client):
    response = await client.post(
        "/api/auth/login", json={"email": "admin@example.dk", "password": "correct horse battery"}
    )
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]

    response = await client.post("/api/auth/logout")
    assert response.status_code == 204
    assert "Max-Age=0" in response.headers["set-cookie"]


async def test_invalid_password_is_rejected(client):
    response = await client.post(
        "/api/auth/login", json={"email": "admin@example.dk", "password": "wrong-password"}
    )

    assert response.status_code == 401


async def test_login_is_rate_limited_by_client_ip(client):
    for number in range(6):
        response = await client.post(
            "/api/auth/login",
            json={"email": f"unknown{number}@example.dk", "password": "wrong-password"},
        )

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"


def test_production_rejects_insecure_session_cookie():
    with pytest.raises(ValidationError, match="AUTH_COOKIE_SECURE must be true"):
        Settings(
            app_env="production",
            auth_secret_key="a-unique-production-secret-of-32-characters",
            auth_cookie_secure=False,
        )


def test_production_rejects_public_filename_that_nginx_cannot_serve():
    with pytest.raises(ValidationError, match="PUBLIC_STATUS_FILENAME must be driftsstatus.json"):
        Settings(
            app_env="production",
            auth_secret_key="a-unique-production-secret-of-32-characters",
            auth_cookie_secure=True,
            public_status_filename="status.json",
        )
