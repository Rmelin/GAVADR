from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.activity import ActivityType


HistoryCategory = ActivityType
HistorySource = Literal["incident", "planned_shutdown"]


class HistoryItem(BaseModel):
    id: UUID
    source: HistorySource
    category: HistoryCategory
    activity_type: ActivityType
    number: str
    title: str
    status: str
    occurred_at: datetime
    expected_end_at: datetime | None
    locations: list[str]
    affected_address_count: int | None
    href: str


class HistorySummary(BaseModel):
    total: int
    breaks: int
    shutdowns: int
    excavations: int
    other_incidents: int


class HistoryResponse(BaseModel):
    items: list[HistoryItem]
    summary: HistorySummary
    page: int
    page_size: int
    total_pages: int
