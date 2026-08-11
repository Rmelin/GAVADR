from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.incident import Incident
    from app.models.network import Address, ClosureArea, Valve
    from app.models.user import User


class ShutdownEntityMixin(TimestampMixin):
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )


class PlannedShutdown(ShutdownEntityMixin, Base):
    __tablename__ = "planned_shutdowns"
    __table_args__ = (
        CheckConstraint("length(trim(title)) > 0", name="title_not_blank"),
        CheckConstraint(
            "status IN ('draft', 'planned', 'in_progress', 'completed', 'cancelled')",
            name="status_value",
        ),
    )

    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="draft", server_default="draft", index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    expected_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    assigned_to_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    contractor: Mapped[str | None] = mapped_column(String(200))

    created_by: Mapped[User] = relationship(foreign_keys=[created_by_id], lazy="selectin")
    assigned_to: Mapped[User | None] = relationship(foreign_keys=[assigned_to_id], lazy="selectin")
    valve_links: Mapped[list[PlannedShutdownValve]] = relationship(
        back_populates="shutdown", lazy="selectin", cascade="all, delete-orphan"
    )
    area_links: Mapped[list[PlannedShutdownClosureArea]] = relationship(
        back_populates="shutdown", lazy="selectin", cascade="all, delete-orphan"
    )
    address_links: Mapped[list[PlannedShutdownAddress]] = relationship(
        back_populates="shutdown", lazy="selectin", cascade="all, delete-orphan"
    )
    incident_links: Mapped[list[PlannedShutdownIncident]] = relationship(
        back_populates="shutdown", lazy="selectin", cascade="all, delete-orphan"
    )


class PlannedShutdownValve(ShutdownEntityMixin, Base):
    __tablename__ = "planned_shutdown_valves"
    __table_args__ = (Index("uq_planned_shutdown_valve", "shutdown_id", "valve_id", unique=True),)

    shutdown_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("planned_shutdowns.id", ondelete="CASCADE"), index=True
    )
    valve_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("valves.id", ondelete="RESTRICT"), index=True)

    shutdown: Mapped[PlannedShutdown] = relationship(back_populates="valve_links")
    valve: Mapped[Valve] = relationship(lazy="selectin")


class PlannedShutdownClosureArea(ShutdownEntityMixin, Base):
    __tablename__ = "planned_shutdown_closure_areas"
    __table_args__ = (Index("uq_planned_shutdown_area", "shutdown_id", "closure_area_id", unique=True),)

    shutdown_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("planned_shutdowns.id", ondelete="CASCADE"), index=True
    )
    closure_area_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("closure_areas.id", ondelete="RESTRICT"), index=True
    )

    shutdown: Mapped[PlannedShutdown] = relationship(back_populates="area_links")
    closure_area: Mapped[ClosureArea] = relationship(lazy="selectin")


class PlannedShutdownAddress(ShutdownEntityMixin, Base):
    __tablename__ = "planned_shutdown_addresses"
    __table_args__ = (
        Index("uq_planned_shutdown_address", "shutdown_id", "address_id", unique=True),
        CheckConstraint("source IN ('derived', 'manual')", name="source_value"),
    )

    shutdown_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("planned_shutdowns.id", ondelete="CASCADE"), index=True
    )
    address_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("addresses.id", ondelete="RESTRICT"), index=True)
    source: Mapped[str] = mapped_column(String(20))
    included: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), index=True)
    informed: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), index=True)
    informed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    informed_by_id: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    shutdown: Mapped[PlannedShutdown] = relationship(back_populates="address_links")
    address: Mapped[Address] = relationship(lazy="selectin")
    informed_by: Mapped[User | None] = relationship(foreign_keys=[informed_by_id], lazy="selectin")


class PlannedShutdownIncident(ShutdownEntityMixin, Base):
    __tablename__ = "planned_shutdown_incidents"
    __table_args__ = (
        Index("uq_planned_shutdown_incident", "shutdown_id", "incident_id", unique=True),
    )

    shutdown_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("planned_shutdowns.id", ondelete="CASCADE"), index=True
    )
    incident_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("incidents.id", ondelete="CASCADE"), index=True
    )

    shutdown: Mapped[PlannedShutdown] = relationship(back_populates="incident_links")
    incident: Mapped[Incident] = relationship(back_populates="shutdown_links", lazy="selectin")
