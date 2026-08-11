import os
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.api.deps import DbSession
from app.core.config import get_settings

router = APIRouter(tags=["health"])


def expected_migration_head() -> str | None:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    return ScriptDirectory.from_config(config).get_current_head()


@router.get("/health")
async def health(response: Response, db: DbSession) -> dict:
    checks: dict[str, str] = {"backend": "ok"}
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "unavailable"
        await db.rollback()

    try:
        revision = (await db.execute(text("SELECT version_num FROM alembic_version"))).scalar_one_or_none()
        checks["migrations"] = "ok" if revision == expected_migration_head() else "outdated"
    except Exception:
        checks["migrations"] = "unknown"
        await db.rollback()

    upload_dir = get_settings().upload_dir
    try:
        upload_dir.mkdir(parents=True, exist_ok=True)
        probe = upload_dir / ".healthcheck"
        probe.write_text("ok", encoding="ascii")
        os.remove(probe)
        checks["filesystem"] = "ok"
    except OSError:
        checks["filesystem"] = "unavailable"

    healthy = all(value == "ok" for value in checks.values())
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if healthy else "degraded", "checks": checks}
