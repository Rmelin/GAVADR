from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.activity import ActivityType

IncidentStatus = Literal["new", "assessing", "active", "monitoring", "resolved", "closed", "cancelled"]
IncidentPriority = Literal["low", "medium", "high", "critical"]
IncidentType = Literal[
    "suspected_leak", "confirmed_leak", "pressure_drop", "no_water", "discolored_water",
    "planned_work", "defective_valve", "map_error", "other_operational_disruption",
]


class UserOption(BaseModel):
    id: UUID
    display_name: str
    email: str


class Location(BaseModel):
    longitude: float
    latitude: float


class IncidentAddressSummary(BaseModel):
    id: UUID
    label: str
    street_name: str
    house_number: str
    postal_code: str
    city: str


class IncidentCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    type: IncidentType
    priority: IncidentPriority
    address_id: UUID | None = None
    longitude: float | None = Field(default=None, ge=-180, le=180)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    assigned_to_id: UUID | None = None
    expected_end_at: datetime | None = None

    @model_validator(mode="after")
    def has_a_location(self) -> "IncidentCreate":
        if self.address_id is None and (self.longitude is None or self.latitude is None):
            raise ValueError("address_id or longitude and latitude are required")
        if (self.longitude is None) != (self.latitude is None):
            raise ValueError("longitude and latitude must be supplied together")
        return self


class IncidentPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1)
    type: IncidentType | None = None
    priority: IncidentPriority | None = None
    status: IncidentStatus | None = None
    longitude: float | None = Field(default=None, ge=-180, le=180)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    assigned_to_id: UUID | None = None
    expected_end_at: datetime | None = None
    water_restored_at: datetime | None = None
    public_text: str | None = None

    @model_validator(mode="after")
    def coordinates_are_a_pair(self) -> "IncidentPatch":
        provided = self.model_fields_set
        for field in ("title", "description", "type", "priority", "status"):
            if field in provided and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        if ("longitude" in provided) != ("latitude" in provided):
            raise ValueError("longitude and latitude must be updated together")
        if "longitude" in provided and (self.longitude is None or self.latitude is None):
            raise ValueError("longitude and latitude cannot be null")
        return self


class IncidentUpdateCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    message: str = Field(min_length=1)
    status: IncidentStatus | None = None


class UpdateResponse(BaseModel):
    id: UUID
    message: str
    status: IncidentStatus | None
    author: UserOption
    created_at: datetime


class AttachmentResponse(BaseModel):
    id: UUID
    original_filename: str
    mime_type: str
    size_bytes: int
    created_at: datetime
    download_url: str


class LinkedShutdownSummary(BaseModel):
    id: UUID
    number: str
    title: str
    status: str
    activity_type: ActivityType
    starts_at: datetime


class IncidentSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    number: str
    title: str
    type: IncidentType
    activity_type: ActivityType
    priority: IncidentPriority
    status: IncidentStatus
    location: Location
    address: IncidentAddressSummary | None
    registered_at: datetime
    assigned_to: UserOption | None
    created_by: UserOption
    expected_end_at: datetime | None
    water_restored_at: datetime | None
    updated_at: datetime


class IncidentDetail(IncidentSummary):
    description: str
    public_text: str | None
    updates: list[UpdateResponse]
    attachments: list[AttachmentResponse]
    planned_shutdowns: list[LinkedShutdownSummary]
