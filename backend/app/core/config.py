from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "GAVADR API"
    organization_name: str = "GAVAD"
    organization_address: str = ""
    organization_locality: str = ""
    map_default_longitude: float = 11.45
    map_default_latitude: float = 55.62
    map_default_zoom: float = 13
    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+asyncpg://gavadr:gavadr@localhost:5432/gavadr"
    auth_secret_key: str = "development-only-secret-change-me"
    auth_algorithm: str = "HS256"
    auth_token_minutes: int = 30
    auth_cookie_name: str = "gavadr_session"
    auth_cookie_secure: bool = True
    login_rate_limit: int = 5
    login_rate_window_seconds: int = 60
    upload_dir: Path = Path("uploads")
    upload_max_bytes: int = 10 * 1024 * 1024
    address_import_max_bytes: int = 2 * 1024 * 1024
    address_import_max_rows: int = 5000
    public_status_dir: Path | None = None
    public_status_filename: str = "driftsstatus.json"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    smtp_starttls: bool = True
    board_notification_emails: list[str] = []
    frontend_url: str = "http://localhost:5173"
    allowed_origins: list[str] = []

    @field_validator("public_status_filename")
    @classmethod
    def validate_public_status_filename(cls, value: str) -> str:
        if not value or Path(value).name != value:
            raise ValueError("PUBLIC_STATUS_FILENAME must be a filename without directories")
        return value

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.app_env == "production" and (
            len(self.auth_secret_key) < 32 or self.auth_secret_key == "development-only-secret-change-me"
        ):
            raise ValueError("AUTH_SECRET_KEY must be a unique value of at least 32 characters in production")
        if self.app_env == "production" and not self.auth_cookie_secure:
            raise ValueError("AUTH_COOKIE_SECURE must be true in production")
        if self.app_env == "production" and self.public_status_filename != "driftsstatus.json":
            raise ValueError("PUBLIC_STATUS_FILENAME must be driftsstatus.json in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
