from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.schemas.incident import AttachmentResponse, Location, UserOption

Priority = Literal["low", "medium", "high", "critical"]
InquiryStatus = Literal["new", "in_progress", "waiting", "resolved", "closed"]
InquiryChannel = Literal["phone", "email", "web", "in_person", "other"]
CorrectionStatus = Literal[
    "new", "assessed", "assigned", "sent_to_supplier", "supplier_accepted",
    "work_scheduled", "work_completed", "verified", "closed",
]
TaskStatus = Literal["open", "in_progress", "blocked", "done", "cancelled"]


class InquiryCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    contact_name: str = Field(min_length=1, max_length=200)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    address_id: UUID | None = None
    address_text: str | None = Field(default=None, max_length=300)
    channel: InquiryChannel
    category: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1)
    priority: Priority = "medium"
    assigned_to_id: UUID | None = None
    follow_up_at: datetime | None = None
    incident_id: UUID | None = None
    notes: str | None = None


class InquiryPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    contact_name: str | None = Field(default=None, min_length=1, max_length=200)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    address_id: UUID | None = None
    address_text: str | None = Field(default=None, max_length=300)
    channel: InquiryChannel | None = None
    category: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, min_length=1)
    priority: Priority | None = None
    status: InquiryStatus | None = None
    assigned_to_id: UUID | None = None
    follow_up_at: datetime | None = None
    incident_id: UUID | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def required_values_are_not_null(self):
        for field in ("contact_name", "channel", "category", "description", "priority", "status"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class InquiryUpdateCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    message: str = Field(min_length=1)
    status: InquiryStatus | None = None


class InquiryUpdateResponse(BaseModel):
    id: UUID
    message: str
    previous_status: InquiryStatus | None
    status: InquiryStatus | None
    author: UserOption
    created_at: datetime


class InquiryResponse(BaseModel):
    id: UUID
    number: str
    contact_name: str
    contact_email: EmailStr | None
    contact_phone: str | None
    address_id: UUID | None
    address_text: str | None
    channel: InquiryChannel
    category: str
    description: str
    priority: Priority
    status: InquiryStatus
    assigned_to: UserOption | None
    follow_up_at: datetime | None
    incident_id: UUID | None
    notes: str | None
    created_by: UserOption
    updates: list[InquiryUpdateResponse]
    attachments: list[AttachmentResponse]
    created_at: datetime
    updated_at: datetime


class SupplierCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    active: bool = True


class SupplierPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    contact_name: str | None = Field(default=None, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    active: bool | None = None

    @model_validator(mode="after")
    def required_values_are_not_null(self):
        for field in ("name", "active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class SupplierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    contact_name: str | None
    email: EmailStr | None
    phone: str | None
    active: bool
    created_at: datetime
    updated_at: datetime


class SupplierOption(BaseModel):
    id: UUID
    name: str


class CorrectionCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1)
    category: str = Field(min_length=1, max_length=80)
    priority: Priority = "medium"
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)
    inquiry_id: UUID | None = None
    pipe_id: UUID | None = None
    valve_id: UUID | None = None
    assigned_to_id: UUID | None = None
    supplier_id: UUID | None = None
    supplier_reference: str | None = Field(default=None, max_length=100)
    supplier_due_at: datetime | None = None


class CorrectionPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    priority: Priority | None = None
    status: CorrectionStatus | None = None
    longitude: float | None = Field(default=None, ge=-180, le=180)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    inquiry_id: UUID | None = None
    pipe_id: UUID | None = None
    valve_id: UUID | None = None
    assigned_to_id: UUID | None = None
    supplier_id: UUID | None = None
    supplier_reference: str | None = Field(default=None, max_length=100)
    supplier_due_at: datetime | None = None

    @model_validator(mode="after")
    def coordinates_are_a_pair(self):
        for field in ("title", "description", "category", "priority", "status"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        if ("longitude" in self.model_fields_set) != ("latitude" in self.model_fields_set):
            raise ValueError("longitude and latitude must be updated together")
        if "longitude" in self.model_fields_set and (self.longitude is None or self.latitude is None):
            raise ValueError("longitude and latitude cannot be null")
        return self


class CorrectionTransition(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    status: CorrectionStatus
    note: str | None = None


class CorrectionHistoryResponse(BaseModel):
    id: UUID
    previous_status: CorrectionStatus | None
    status: CorrectionStatus
    note: str | None
    author: UserOption
    created_at: datetime


class CorrectionResponse(BaseModel):
    id: UUID
    number: str
    title: str
    description: str
    category: str
    priority: Priority
    status: CorrectionStatus
    location: Location
    inquiry_id: UUID | None
    pipe_id: UUID | None
    valve_id: UUID | None
    assigned_to: UserOption | None
    supplier: SupplierOption | None
    supplier_reference: str | None
    supplier_due_at: datetime | None
    created_by: UserOption
    history: list[CorrectionHistoryResponse]
    attachments: list[AttachmentResponse]
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    priority: Priority = "medium"
    status: TaskStatus = "open"
    due_date: date | None = None
    assigned_to_id: UUID | None = None
    incident_id: UUID | None = None
    inquiry_id: UUID | None = None
    correction_id: UUID | None = None

    @model_validator(mode="after")
    def one_relation(self):
        if sum(value is not None for value in (self.incident_id, self.inquiry_id, self.correction_id)) > 1:
            raise ValueError("A task can relate to only one object")
        return self


class TaskPatch(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    priority: Priority | None = None
    status: TaskStatus | None = None
    due_date: date | None = None
    assigned_to_id: UUID | None = None

    @model_validator(mode="after")
    def required_values_are_not_null(self):
        for field in ("title", "priority", "status"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class TaskCommentCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    message: str = Field(min_length=1)


class TaskCommentResponse(BaseModel):
    id: UUID
    message: str
    author: UserOption
    created_at: datetime


class TaskResponse(BaseModel):
    id: UUID
    title: str
    description: str | None
    priority: Priority
    status: TaskStatus
    due_date: date | None
    assigned_to: UserOption | None
    incident_id: UUID | None
    inquiry_id: UUID | None
    correction_id: UUID | None
    created_by: UserOption
    comments: list[TaskCommentResponse]
    created_at: datetime
    updated_at: datetime
