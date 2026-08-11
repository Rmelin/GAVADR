from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AppSettingUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    organization_name: str = Field(min_length=1, max_length=120)
    organization_address: str = Field(default="", max_length=200)
    organization_locality: str = Field(default="", max_length=120)
    map_default_longitude: float = Field(default=11.45, ge=-180, le=180)
    map_default_latitude: float = Field(default=55.62, ge=-90, le=90)
    map_default_zoom: float = Field(default=13, ge=0, le=19)


class AppSettingResponse(AppSettingUpdate):
    updated_at: datetime | None


class AddressImportError(BaseModel):
    row: int
    message: str


class AddressImportReport(BaseModel):
    filename: str
    rows: int
    new_rows: int
    skipped_rows: int
    created_rows: int
    errors: list[AddressImportError]
    committed: bool
