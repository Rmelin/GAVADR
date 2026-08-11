from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    display_name: str
    is_active: bool
    roles: list[str]
    created_at: datetime
    updated_at: datetime


RoleName = Literal["admin", "board_member", "map_manager", "reader"]


class UserCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=12, max_length=128)
    roles: list[RoleName] = Field(min_length=1)


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    is_active: bool | None = None
    roles: list[RoleName] | None = Field(default=None, min_length=1)
    password: str | None = Field(default=None, min_length=12, max_length=128)
