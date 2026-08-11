from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.activity import ActivityType
from app.schemas.incident import IncidentStatus, IncidentType, UserOption

ShutdownStatus = Literal["draft", "planned", "in_progress", "completed", "cancelled"]


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


class ShutdownCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="")
    starts_at: datetime
    expected_end_at: datetime | None = None
    assigned_to_id: UUID | None = None
    contractor: str | None = Field(default=None, max_length=200)
    valve_ids: list[UUID] = Field(default_factory=list)
    incident_ids: list[UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def valid_period(self):
        if self.expected_end_at and _utc(self.expected_end_at) < _utc(self.starts_at):
            raise ValueError("expected_end_at must not be before starts_at")
        return self


class ShutdownPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    status: ShutdownStatus | None = None
    starts_at: datetime | None = None
    expected_end_at: datetime | None = None
    assigned_to_id: UUID | None = None
    contractor: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def required_values(self):
        for field in ("title", "description", "status", "starts_at"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ValveSelection(BaseModel):
    valve_ids: list[UUID]


class IncidentSelection(BaseModel):
    incident_ids: list[UUID]


class ManualAddressAdd(BaseModel):
    address_id: UUID


class AddressPatch(BaseModel):
    included: bool | None = None
    informed: bool | None = None

    @model_validator(mode="after")
    def has_change(self):
        if not self.model_fields_set:
            raise ValueError("At least one address state must be supplied")
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Address states cannot be null")
        return self


class BulkInformedPatch(BaseModel):
    informed: bool
    address_ids: list[UUID] | None = None


class ValveResponse(BaseModel):
    id: UUID
    code: str


class ClosureAreaResponse(BaseModel):
    id: UUID
    name: str


class LinkedIncidentSummary(BaseModel):
    id: UUID
    number: str
    title: str
    type: IncidentType
    status: IncidentStatus
    activity_type: ActivityType


class ShutdownAddressResponse(BaseModel):
    id: UUID
    street_name: str
    house_number: str
    postal_code: str
    city: str
    source: Literal["derived", "manual"]
    included: bool
    informed: bool
    informed_at: datetime | None
    informed_by: UserOption | None


class ShutdownSummary(BaseModel):
    id: UUID
    number: str
    title: str
    activity_type: ActivityType
    status: ShutdownStatus
    starts_at: datetime
    expected_end_at: datetime | None
    created_by: UserOption
    assigned_to: UserOption | None
    contractor: str | None
    valve_count: int
    affected_address_count: int
    informed_address_count: int
    updated_at: datetime


class ShutdownDetail(ShutdownSummary):
    description: str
    valves: list[ValveResponse]
    closure_areas: list[ClosureAreaResponse]
    addresses: list[ShutdownAddressResponse]
    incidents: list[LinkedIncidentSummary]
