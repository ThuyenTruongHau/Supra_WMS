from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ItemStockCreate(BaseModel):
    item_id: int
    location_id: int
    unit_id: Optional[int] = Field(None, gt=0)
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    lot_number: Optional[str] = Field(None, max_length=50)
    expiry_date: Optional[str] = Field(None, max_length=50)
    status: str = Field(default="available", max_length=20)


class ItemStockUpdate(BaseModel):
    item_id: Optional[int] = None
    location_id: Optional[int] = None
    unit_id: Optional[int] = Field(None, gt=0)
    quantity: Optional[Decimal] = Field(None, ge=0)
    lot_number: Optional[str] = Field(None, max_length=50)
    expiry_date: Optional[str] = Field(None, max_length=50)
    status: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None


class ItemStockResponse(BaseModel):
    id: int
    stock_code: UUID
    item_id: int
    location_id: int
    unit_id: int
    quantity: Decimal
    lot_number: Optional[str] = None
    expiry_date: Optional[str] = None
    status: str
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ItemStockListResponse(BaseModel):
    items: list[ItemStockResponse]
    total: int
    page: int
    page_size: int
