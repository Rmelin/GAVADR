from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.db.geometry import Geometry


class NetworkEntityMixin(TimestampMixin):
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )


class Address(NetworkEntityMixin, Base):
    __tablename__ = "addresses"
    __table_args__ = (
        CheckConstraint("length(trim(street_name)) > 0", name="street_name_not_blank"),
        CheckConstraint("length(trim(house_number)) > 0", name="house_number_not_blank"),
        CheckConstraint("length(postal_code) = 4", name="postal_code_length"),
        Index("ix_addresses_street_house", "street_name", "house_number"),
        Index("ix_addresses_geometry", "geometry", postgresql_using="gist"),
    )

    external_address_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    street_name: Mapped[str] = mapped_column(String(120), index=True)
    house_number: Mapped[str] = mapped_column(String(20))
    postal_code: Mapped[str] = mapped_column(String(4), index=True)
    city: Mapped[str] = mapped_column(String(100), index=True)
    geometry: Mapped[str] = mapped_column(Geometry("POINT"))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), index=True)
    notes: Mapped[str | None] = mapped_column(Text)

    area_links: Mapped[list[ClosureAreaAddress]] = relationship(back_populates="address")


class Pipe(NetworkEntityMixin, Base):
    __tablename__ = "pipes"
    __table_args__ = (
        CheckConstraint("length(trim(code)) > 0", name="code_not_blank"),
        CheckConstraint("diameter_mm IS NULL OR diameter_mm > 0", name="diameter_positive"),
        CheckConstraint(
            "installation_year IS NULL OR installation_year BETWEEN 1800 AND 2200",
            name="installation_year_range",
        ),
        CheckConstraint("risk_probability IS NULL OR risk_probability BETWEEN 0 AND 5", name="risk_probability_range"),
        CheckConstraint("risk_consequence IS NULL OR risk_consequence BETWEEN 0 AND 5", name="risk_consequence_range"),
        Index("ix_pipes_geometry", "geometry", postgresql_using="gist"),
    )

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    geometry: Mapped[str] = mapped_column(Geometry("LINESTRING"))
    pipe_type: Mapped[str] = mapped_column(String(50), index=True)
    material: Mapped[str | None] = mapped_column(String(50), index=True)
    diameter_mm: Mapped[int | None] = mapped_column(Integer)
    installation_year: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="in_service", server_default="in_service", index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), index=True)
    condition: Mapped[str | None] = mapped_column(String(30))
    risk_probability: Mapped[float | None] = mapped_column(Float)
    risk_consequence: Mapped[float | None] = mapped_column(Float)
    source: Mapped[str | None] = mapped_column(String(100))
    quality: Mapped[str | None] = mapped_column(String(30))
    notes: Mapped[str | None] = mapped_column(Text)


class Valve(NetworkEntityMixin, Base):
    __tablename__ = "valves"
    __table_args__ = (
        CheckConstraint("length(trim(code)) > 0", name="code_not_blank"),
        CheckConstraint("normal_position IN ('open', 'closed', 'unknown')", name="normal_position_value"),
        CheckConstraint("current_position IN ('open', 'closed', 'unknown')", name="current_position_value"),
        Index("ix_valves_geometry", "geometry", postgresql_using="gist"),
    )

    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    geometry: Mapped[str] = mapped_column(Geometry("POINT"))
    valve_type: Mapped[str] = mapped_column(String(50), index=True)
    normal_position: Mapped[str] = mapped_column(String(10), default="open", server_default="open")
    current_position: Mapped[str] = mapped_column(String(10), default="open", server_default="open")
    status: Mapped[str] = mapped_column(String(30), default="operational", server_default="operational", index=True)
    last_operated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_inspected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accessibility: Mapped[str | None] = mapped_column(String(30))
    source: Mapped[str | None] = mapped_column(String(100))
    quality: Mapped[str | None] = mapped_column(String(30))
    notes: Mapped[str | None] = mapped_column(Text)

    area_links: Mapped[list[ClosureAreaValve]] = relationship(back_populates="valve")


class ClosureArea(NetworkEntityMixin, Base):
    __tablename__ = "closure_areas"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="name_not_blank"),
        CheckConstraint("confidence IS NULL OR confidence BETWEEN 0 AND 1", name="confidence_range"),
        Index("ix_closure_areas_geometry", "geometry", postgresql_using="gist"),
    )

    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    geometry: Mapped[str] = mapped_column(Geometry("MULTIPOLYGON"))
    description: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), index=True)

    valve_links: Mapped[list[ClosureAreaValve]] = relationship(back_populates="closure_area", lazy="selectin")
    scenario_links: Mapped[list[ClosureScenarioArea]] = relationship(back_populates="closure_area", lazy="selectin")
    address_links: Mapped[list[ClosureAreaAddress]] = relationship(back_populates="closure_area", lazy="selectin")


class ClosureAreaValve(NetworkEntityMixin, Base):
    __tablename__ = "closure_area_valves"
    __table_args__ = (
        Index("uq_closure_area_valves_active", "closure_area_id", "valve_id", unique=True),
    )

    closure_area_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("closure_areas.id", ondelete="CASCADE"), index=True
    )
    valve_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("valves.id", ondelete="CASCADE"), index=True)

    closure_area: Mapped[ClosureArea] = relationship(back_populates="valve_links")
    valve: Mapped[Valve] = relationship(back_populates="area_links")


class ClosureScenario(NetworkEntityMixin, Base):
    __tablename__ = "closure_scenarios"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="name_not_blank"),
    )

    name: Mapped[str] = mapped_column(String(120))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), index=True)

    area_links: Mapped[list[ClosureScenarioArea]] = relationship(back_populates="scenario", lazy="selectin")
    valve_links: Mapped[list[ClosureScenarioValve]] = relationship(back_populates="scenario", lazy="selectin")


class ClosureScenarioArea(NetworkEntityMixin, Base):
    __tablename__ = "closure_scenario_areas"
    __table_args__ = (
        Index("uq_closure_scenario_areas_active", "scenario_id", "closure_area_id", unique=True),
    )

    scenario_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("closure_scenarios.id", ondelete="CASCADE"), index=True
    )
    closure_area_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("closure_areas.id", ondelete="CASCADE"), index=True)

    scenario: Mapped[ClosureScenario] = relationship(back_populates="area_links", lazy="selectin")
    closure_area: Mapped[ClosureArea] = relationship(back_populates="scenario_links")


class ClosureScenarioValve(NetworkEntityMixin, Base):
    __tablename__ = "closure_scenario_valves"
    __table_args__ = (
        Index("uq_closure_scenario_valves_active", "scenario_id", "valve_id", unique=True),
    )

    scenario_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("closure_scenarios.id", ondelete="CASCADE"), index=True
    )
    valve_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("valves.id", ondelete="CASCADE"), index=True)

    scenario: Mapped[ClosureScenario] = relationship(back_populates="valve_links")


class ClosureAreaAddress(NetworkEntityMixin, Base):
    __tablename__ = "closure_area_addresses"
    __table_args__ = (
        Index("uq_closure_area_addresses_active", "closure_area_id", "address_id", unique=True),
    )

    closure_area_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("closure_areas.id", ondelete="CASCADE"), index=True
    )
    address_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("addresses.id", ondelete="CASCADE"), index=True)

    closure_area: Mapped[ClosureArea] = relationship(back_populates="address_links")
    address: Mapped[Address] = relationship(back_populates="area_links")
