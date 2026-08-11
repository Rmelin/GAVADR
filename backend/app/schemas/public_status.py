from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Severity = Literal["low", "medium", "high", "critical"]
PublicStatusLifecycle = Literal["draft", "published", "closed", "withdrawn"]


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class PublicDraft(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1, max_length=5000)
    areas: list[str] = Field(default_factory=list, max_length=50)
    start_at: datetime
    expected_end_at: datetime | None = None
    severity: Severity

    @field_validator("areas")
    @classmethod
    def valid_areas(cls, values: list[str]) -> list[str]:
        cleaned = sorted({value.strip() for value in values if value.strip()}, key=str.casefold)
        if any(len(value) > 120 for value in cleaned):
            raise ValueError("areas must contain names of at most 120 characters")
        return cleaned

    @model_validator(mode="after")
    def valid_period(self):
        if self.expected_end_at and _utc(self.expected_end_at) < _utc(self.start_at):
            raise ValueError("expected_end_at must not be before start_at")
        return self


class ClosePublicStatus(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    message: str = Field(min_length=1, max_length=5000)
    display_until: datetime | None = None


class PublicStatusResponse(BaseModel):
    id: UUID
    source_type: Literal["incident", "shutdown"]
    source_id: UUID
    status: PublicStatusLifecycle
    draft: PublicDraft
    approved_payload: dict | None
    approved_by_id: UUID | None
    approved_at: datetime | None
    source_updated: bool
    needs_approval: bool
    close_message: str | None
    closed_at: datetime | None
    display_until: datetime | None
    withdrawn_at: datetime | None
    updated_at: datetime


class PublicItem(BaseModel):
    source_type: Literal["incident", "shutdown"]
    resolved: bool
    active_now: bool
    title: str
    message: str
    start_at: datetime
    expected_end_at: datetime | None
    severity: Severity
    areas: list[str]
    updated_at: datetime


class PublicFeed(BaseModel):
    updated_at: datetime | None
    status: Literal["normal_drift", "planlagt_arbejde", "driftsforstyrrelse"]
    items: list[PublicItem]
