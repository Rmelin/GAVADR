from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.db.geometry import Geometry
from app.models.incident import IncidentEntityMixin

if TYPE_CHECKING:
    from app.models.incident import Incident
    from app.models.network import Address, Pipe, Valve
    from app.models.user import User


class Inquiry(IncidentEntityMixin, Base):
    __tablename__ = "inquiries"
    __table_args__ = (
        CheckConstraint("priority IN ('low', 'medium', 'high', 'critical')", name="priority_value"),
        CheckConstraint("status IN ('new', 'in_progress', 'waiting', 'resolved', 'closed')", name="status_value"),
        CheckConstraint("channel IN ('phone', 'email', 'web', 'in_person', 'other')", name="channel_value"),
    )

    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    contact_name: Mapped[str] = mapped_column(String(200))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    address_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("addresses.id", ondelete="SET NULL"), index=True)
    address_text: Mapped[str | None] = mapped_column(String(300))
    channel: Mapped[str] = mapped_column(String(20), index=True)
    category: Mapped[str] = mapped_column(String(80), index=True)
    description: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(20), default="medium", server_default="medium", index=True)
    status: Mapped[str] = mapped_column(String(20), default="new", server_default="new", index=True)
    assigned_to_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    follow_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    incident_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("incidents.id", ondelete="SET NULL"), index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)

    address: Mapped[Address | None] = relationship(lazy="selectin")
    incident: Mapped[Incident | None] = relationship(lazy="selectin")
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="selectin")
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id], lazy="selectin")
    updates: Mapped[list[InquiryUpdate]] = relationship(back_populates="inquiry", lazy="selectin", order_by="InquiryUpdate.created_at")
    attachments: Mapped[list[InquiryAttachment]] = relationship(
        back_populates="inquiry", lazy="selectin", order_by="InquiryAttachment.created_at"
    )


class InquiryUpdate(IncidentEntityMixin, Base):
    __tablename__ = "inquiry_updates"

    inquiry_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("inquiries.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    message: Mapped[str] = mapped_column(Text)
    previous_status: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str | None] = mapped_column(String(20))

    inquiry: Mapped[Inquiry] = relationship(back_populates="updates")
    author: Mapped[User] = relationship(foreign_keys=[author_id], lazy="selectin")


class InquiryAttachment(IncidentEntityMixin, Base):
    __tablename__ = "inquiry_attachments"

    inquiry_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("inquiries.id", ondelete="CASCADE"), index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_filename: Mapped[str] = mapped_column(String(100), unique=True)
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    checksum_sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )

    inquiry: Mapped[Inquiry] = relationship(back_populates="attachments")


class Supplier(IncidentEntityMixin, Base):
    __tablename__ = "suppliers"

    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(50))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", index=True)


class MapCorrection(IncidentEntityMixin, Base):
    __tablename__ = "map_corrections"
    __table_args__ = (
        CheckConstraint("priority IN ('low', 'medium', 'high', 'critical')", name="priority_value"),
        CheckConstraint(
            "status IN ('new', 'assessed', 'assigned', 'sent_to_supplier', 'supplier_accepted', "
            "'work_scheduled', 'work_completed', 'verified', 'closed')",
            name="status_value",
        ),
        Index("ix_map_corrections_geometry", "geometry", postgresql_using="gist"),
    )

    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(80), index=True)
    priority: Mapped[str] = mapped_column(String(20), default="medium", server_default="medium", index=True)
    status: Mapped[str] = mapped_column(String(30), default="new", server_default="new", index=True)
    geometry: Mapped[str] = mapped_column(Geometry("POINT"))
    inquiry_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("inquiries.id", ondelete="SET NULL"), index=True)
    pipe_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("pipes.id", ondelete="SET NULL"), index=True)
    valve_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("valves.id", ondelete="SET NULL"), index=True)
    assigned_to_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    supplier_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("suppliers.id", ondelete="SET NULL"), index=True)
    supplier_reference: Mapped[str | None] = mapped_column(String(100))
    supplier_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)

    inquiry: Mapped[Inquiry | None] = relationship(lazy="selectin")
    pipe: Mapped[Pipe | None] = relationship(lazy="selectin")
    valve: Mapped[Valve | None] = relationship(lazy="selectin")
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="selectin")
    supplier: Mapped[Supplier | None] = relationship(lazy="selectin")
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id], lazy="selectin")
    history: Mapped[list[MapCorrectionHistory]] = relationship(back_populates="correction", lazy="selectin", order_by="MapCorrectionHistory.created_at")
    attachments: Mapped[list[MapCorrectionAttachment]] = relationship(
        back_populates="correction", lazy="selectin", order_by="MapCorrectionAttachment.created_at"
    )


class MapCorrectionHistory(TimestampMixin, Base):
    __tablename__ = "map_correction_history"

    correction_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("map_corrections.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    previous_status: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30))
    note: Mapped[str | None] = mapped_column(Text)

    correction: Mapped[MapCorrection] = relationship(back_populates="history")
    author: Mapped[User] = relationship(foreign_keys=[author_id], lazy="selectin")


class MapCorrectionAttachment(IncidentEntityMixin, Base):
    __tablename__ = "map_correction_attachments"

    correction_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("map_corrections.id", ondelete="CASCADE"), index=True
    )
    original_filename: Mapped[str] = mapped_column(String(255))
    storage_filename: Mapped[str] = mapped_column(String(100), unique=True)
    mime_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    checksum_sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )

    correction: Mapped[MapCorrection] = relationship(back_populates="attachments")


class Task(IncidentEntityMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint("priority IN ('low', 'medium', 'high', 'critical')", name="priority_value"),
        CheckConstraint("status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')", name="status_value"),
        CheckConstraint(
            "(CASE WHEN incident_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN inquiry_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN correction_id IS NOT NULL THEN 1 ELSE 0 END) <= 1",
            name="single_relation",
        ),
    )

    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(20), default="medium", server_default="medium", index=True)
    status: Mapped[str] = mapped_column(String(20), default="open", server_default="open", index=True)
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    assigned_to_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    incident_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    inquiry_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("inquiries.id", ondelete="CASCADE"), index=True)
    correction_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("map_corrections.id", ondelete="CASCADE"), index=True)
    created_by_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)

    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="selectin")
    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id], lazy="selectin")
    comments: Mapped[list[TaskComment]] = relationship(back_populates="task", lazy="selectin", order_by="TaskComment.created_at")


class TaskComment(IncidentEntityMixin, Base):
    __tablename__ = "task_comments"

    task_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    message: Mapped[str] = mapped_column(Text)

    task: Mapped[Task] = relationship(back_populates="comments")
    author: Mapped[User] = relationship(foreign_keys=[author_id], lazy="selectin")
