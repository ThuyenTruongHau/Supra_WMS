from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class LocationCreate(BaseModel):
    location_code: str = Field(..., min_length=1, max_length=50)
    location_name: str = Field(..., min_length=1, max_length=100)
    row: Optional[str] = Field(None, max_length=10)
    column: Optional[str] = Field(None, max_length=10)
    level: Optional[str] = Field(None, max_length=10)
    node_name: Optional[str] = Field(None, max_length=50)
    warehouse_id: int
    zone_id: int


class LocationUpdate(BaseModel):
    location_code: Optional[str] = Field(None, min_length=1, max_length=50)
    location_name: Optional[str] = Field(None, min_length=1, max_length=100)
    row: Optional[str] = Field(None, max_length=10)
    column: Optional[str] = Field(None, max_length=10)
    level: Optional[str] = Field(None, max_length=10)
    node_name: Optional[str] = Field(None, max_length=50)
    warehouse_id: Optional[int] = None
    zone_id: Optional[int] = None
    is_active: Optional[bool] = None


class LocationResponse(BaseModel):
    id: int
    location_code: str
    location_name: str
    row: Optional[str] = None
    column: Optional[str] = None
    level: Optional[str] = None
    node_name: Optional[str] = None
    warehouse_id: int
    zone_id: int
    is_active: bool
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class LocationListResponse(BaseModel):
    items: list[LocationResponse]
    total: int
    page: int
    page_size: int
