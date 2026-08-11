from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, JSON, String, Text, Uuid, event, update
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class PublicStatus(TimestampMixin, Base):
    __tablename__ = "public_statuses"
    __table_args__ = (
        CheckConstraint(
            "(incident_id IS NOT NULL AND planned_shutdown_id IS NULL) OR "
            "(incident_id IS NULL AND planned_shutdown_id IS NOT NULL)",
            name="exactly_one_source",
        ),
        CheckConstraint(
            "status IN ('draft', 'published', 'closed', 'withdrawn')",
            name="status_value",
        ),
        CheckConstraint(
            "draft_severity IN ('low', 'medium', 'high', 'critical')",
            name="severity_value",
        ),
    )

    incident_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("incidents.id", ondelete="CASCADE"), unique=True, index=True
    )
    planned_shutdown_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("planned_shutdowns.id", ondelete="CASCADE"), unique=True, index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default="draft", index=True)
    draft_title: Mapped[str] = mapped_column(String(200))
    draft_message: Mapped[str] = mapped_column(Text)
    draft_areas: Mapped[list[str]] = mapped_column(JSON)
    draft_start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    draft_expected_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    draft_severity: Mapped[str] = mapped_column(String(20))
    approved_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    approved_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_updated: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    close_message: Mapped[str | None] = mapped_column(Text)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    display_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    updated_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )


# PublicNotice is the domain synonym used by integrations and tests.
PublicNotice = PublicStatus


def _mark_source_updated(_mapper, connection, target) -> None:
    source_column = (
        PublicStatus.incident_id if target.__tablename__ == "incidents"
        else PublicStatus.planned_shutdown_id
    )
    connection.execute(
        update(PublicStatus)
        .where(source_column == target.id, PublicStatus.status == "published")
        .values(source_updated=True)
    )


# Source edits never alter an approved payload; they only signal that review may be needed.
from app.models.incident import Incident  # noqa: E402
from app.models.planned_shutdown import PlannedShutdown  # noqa: E402

event.listen(Incident, "after_update", _mark_source_updated)
event.listen(PlannedShutdown, "after_update", _mark_source_updated)
