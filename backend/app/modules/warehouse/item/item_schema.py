from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class ItemCreate(BaseModel):
    sku: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    base_unit: str = Field(..., min_length=1, max_length=20)
    warehouse_id: int
    supplier: str = Field(..., min_length=1, max_length=50)
    details: Optional[dict[str, Any]] = None


class ItemUpdate(BaseModel):
    sku: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    base_unit: Optional[str] = Field(None, min_length=1, max_length=20)
    warehouse_id: Optional[int] = None
    supplier: Optional[str] = Field(None, min_length=1, max_length=50)
    details: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class ItemResponse(BaseModel):
    id: int
    sku: str
    name: str
    description: Optional[str] = None
    base_unit: str
    warehouse_id: int
    supplier: str
    details: dict[str, Any] = Field(default_factory=dict)
    is_active: bool
    quantity: Optional[Decimal] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ItemListResponse(BaseModel):
    items: list[ItemResponse]
    total: int
    page: int
    page_size: int


class ItemAnalyzeResponse(BaseModel):
    total_items: int
    total_quantity: Decimal
    total_nearly_outdated: int
    total_low_stock: int


class ItemStockInDetail(BaseModel):
    id: int
    item_id: int
    location_id: int
    location_code: Optional[str] = None
    lot_number: Optional[str] = None
    expiry_date: Optional[date] = None
    quantity: Decimal
    status: str

    model_config = ConfigDict(from_attributes=True)


class ItemDetailResponse(BaseModel):
    item: ItemResponse
    stocks: list[ItemStockInDetail]
