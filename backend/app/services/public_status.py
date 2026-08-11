import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.planned_shutdown import PlannedShutdown
from app.models.public_status import PublicStatus
from app.schemas.public_status import PublicFeed, PublicItem


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


async def build_public_feed(db: AsyncSession, now: datetime | None = None) -> PublicFeed:
    now = now or datetime.now(timezone.utc)
    notices = (await db.scalars(
        select(PublicStatus).where(PublicStatus.approved_payload.is_not(None))
    )).all()
    cancelled_shutdown_ids = set((await db.scalars(
        select(PlannedShutdown.id).where(PlannedShutdown.status == "cancelled")
    )).all())
    visible = []
    for notice in notices:
        if notice.planned_shutdown_id is not None:
            payload = notice.approved_payload or {}
            expected_end_value = payload.get("expected_end_at")
            if (
                notice.status == "published"
                and notice.planned_shutdown_id not in cancelled_shutdown_ids
                and expected_end_value is not None
                and _utc(datetime.fromisoformat(expected_end_value.replace("Z", "+00:00"))) > now
            ):
                visible.append(notice)
        elif notice.status == "published" or (
            notice.status == "closed"
            and notice.display_until is not None
            and _utc(notice.display_until) > now
        ):
            visible.append(notice)
    visible.sort(key=lambda notice: (
        _utc(notice.draft_start_at),
        str(notice.incident_id or notice.planned_shutdown_id),
    ))
    items = []
    for notice in visible:
        payload = notice.approved_payload or {}
        start_at = _utc(datetime.fromisoformat(payload["start_at"].replace("Z", "+00:00")))
        expected_end_value = payload.get("expected_end_at")
        expected_end_at = (
            _utc(datetime.fromisoformat(expected_end_value.replace("Z", "+00:00")))
            if expected_end_value else None
        )
        active_now = notice.status == "published" and (
            notice.incident_id is not None
            or (start_at <= now and (expected_end_at is None or now < expected_end_at))
        )
        items.append(PublicItem(
            source_type="incident" if notice.incident_id else "shutdown",
            resolved=notice.status == "closed",
            active_now=active_now,
            title=payload["title"],
            message=notice.close_message if notice.status == "closed" else payload["message"],
            start_at=payload["start_at"],
            expected_end_at=payload.get("expected_end_at"),
            severity=payload["severity"],
            areas=payload["areas"],
            updated_at=notice.closed_at if notice.status == "closed" else notice.approved_at,
        ))

    items.sort(key=lambda item: (_utc(item.start_at), item.title.casefold()))
    event_times = [
        value for notice in notices
        for value in (notice.approved_at, notice.closed_at, notice.withdrawn_at)
        if value is not None
    ] + [item.updated_at for item in items]
    updated_at = max(event_times, key=_utc) if event_times else None
    has_active = any(item.active_now and not item.resolved for item in items)
    has_planned = any(
        item.source_type == "shutdown" and not item.resolved and _utc(item.start_at) > now
        for item in items
    )
    return PublicFeed(
        updated_at=updated_at,
        status="driftsforstyrrelse" if has_active else "planlagt_arbejde" if has_planned else "normal_drift",
        items=items,
    )


def _write_atomic(path: Path, content: bytes) -> None:
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        with temporary.open("xb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


async def generate_public_file(db: AsyncSession) -> bool:
    settings = get_settings()
    if settings.public_status_dir is None:
        return False
    path = settings.public_status_dir / settings.public_status_filename
    try:
        feed = await build_public_feed(db)
        content = json.dumps(
            feed.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":"), sort_keys=True
        ).encode("utf-8") + b"\n"
        await asyncio.to_thread(_write_atomic, path, content)
    except (OSError, ValueError, TypeError, KeyError):
        return False
    return True
