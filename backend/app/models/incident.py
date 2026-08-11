from __future__ import annotations

from datetime import datetime
from uuid import UUID
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.db.geometry import Geometry

if TYPE_CHECKING:
    from app.models.network import Address
    from app.models.planned_shutdown import PlannedShutdownIncident
    from app.models.user import User


class IncidentEntityMixin(TimestampMixin):
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )


class Incident(IncidentEntityMixin, Base):
    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint("length(trim(title)) > 0", name="title_not_blank"),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'critical')", name="priority_value"
        ),
        CheckConstraint(
            "status IN ('new', 'assessing', 'active', 'monitoring', 'resolved', 'closed', 'cancelled')",
            name="status_value",
        ),
        CheckConstraint(
            "type IN ('suspected_leak', 'confirmed_leak', 'pressure_drop', 'no_water', "
            "'discolored_water', 'planned_work', 'defective_valve', 'map_error', "
            "'other_operational_disruption')",
            name="type_value",
        ),
        Index("ix_incidents_geometry", "geometry", postgresql_using="gist"),
    )

    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(50), index=True)
    priority: Mapped[str] = mapped_column(String(20), index=True)
    status: Mapped[str] = mapped_column(String(20), default="new", server_default="new", index=True)
    geometry: Mapped[str] = mapped_column(Geometry("POINT"))
    address_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("addresses.id", ondelete="SET NULL"), index=True
    )
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    assigned_to_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    expected_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    water_restored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    public_text: Mapped[str | None] = mapped_column(Text)

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id], lazy="selectin")
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="selectin")
    address: Mapped[Address | None] = relationship(lazy="selectin")
    updates: Mapped[list[IncidentUpdate]] = relationship(
        back_populates="incident", lazy="selectin", order_by="IncidentUpdate.created_at"
    )
    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="incident", lazy="selectin", order_by="Attachment.created_at"
    )
    notifications: Mapped[list[Notification]] = relationship(back_populates="incident")
    shutdown_links: Mapped[list[PlannedShutdownIncident]] = relationship(
        back_populates="incident", lazy="selectin", cascade="all, delete-orphan"
    )


class IncidentUpdate(IncidentEntityMixin, Base):
    __tablename__ = "incident_updates"

    incident_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("incidents.id", ondelete="CASCADE"), index=True
    )
    author_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    message: Mapped[str] = mapped_column(Text)
    previous_status: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str | None] = mapped_column(String(20))

    incident: Mapped[Incident] = relationship(back_populates="updates")
    author: Mapped[User] = relationship(foreign_keys=[author_id], lazy="selectin")


class Attachment(IncidentEntityMixin, Base):
    __tablename__ = "attachments"

    incident_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("incidents.id", ondelete="CASCADE"), index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_filename: Mapped[str] = mapped_column(String(100), unique=True)
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    checksum_sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )

    incident: Mapped[Incident] = relationship(back_populates="attachments")


class Notification(IncidentEntityMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        CheckConstraint("status IN ('sent', 'failed', 'skipped')", name="status_value"),
    )

    incident_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("incidents.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(20), default="email", server_default="email")
    recipients: Mapped[list[str]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), index=True)
    subject: Mapped[str] = mapped_column(String(255))
    error_message: Mapped[str | None] = mapped_column(Text)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    incident: Mapped[Incident] = relationship(back_populates="notifications")
