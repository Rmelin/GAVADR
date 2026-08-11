from __future__ import annotations

from uuid import UUID

from sqlalchemy import Float, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class AppSetting(TimestampMixin, Base):
    __tablename__ = "app_settings"

    setting_key: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    organization_name: Mapped[str | None] = mapped_column(String(120))
    organization_address: Mapped[str | None] = mapped_column(String(200))
    organization_locality: Mapped[str | None] = mapped_column(String(120))
    map_default_longitude: Mapped[float | None] = mapped_column(Float)
    map_default_latitude: Mapped[float | None] = mapped_column(Float)
    map_default_zoom: Mapped[float | None] = mapped_column(Float)
    updated_by: Mapped[UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
