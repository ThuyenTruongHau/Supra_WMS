from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# --- Warehouse ---

class WarehouseCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=20)
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


class WarehouseUpdate(BaseModel):
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


class WarehouseResponse(BaseModel):
    id: int
    code: str
    name: Optional[str] = None
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class WarehouseListResponse(BaseModel):
    items: list[WarehouseResponse]
    total: int
    page: int
    page_size: int


# --- Zone ---

class ZoneCreate(BaseModel):
    warehouse_id: int
    code: str = Field(..., min_length=1, max_length=20)
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


class ZoneUpdate(BaseModel):
    warehouse_id: Optional[int] = None
    code: Optional[str] = Field(None, min_length=1, max_length=20)
    name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None


class ZoneResponse(BaseModel):
    id: int
    warehouse_id: int
    code: str
    name: Optional[str] = None
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ZoneListResponse(BaseModel):
    items: list[ZoneResponse]
    total: int
    page: int
    page_size: int


class ZoneLocationAssign(BaseModel):
    location_ids: list[int] = Field(default_factory=list)
