from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class StocktakeCreate(BaseModel):
    warehouse_id: int = Field(..., gt=0)
    description: Optional[str] = None
    location_ids: Optional[list[int]] = None
    item_ids: Optional[list[int]] = None
    lot_numbers: Optional[list[str]] = None


class StocktakeUpdate(BaseModel):
    description: Optional[str] = None


class StocktakeResponse(BaseModel):
    id: int
    warehouse_id: int
    created_by_id: int
    description: Optional[str] = None
    created_by_username: Optional[str] = None
    warehouse_name: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class StocktakeListResponse(BaseModel):
    items: list[StocktakeResponse]
    total: int
    page: int
    page_size: int


class StocktakeItemStockResponse(BaseModel):
    id: int
    stocktake_id: int
    item_stock_id: int
    lot_number: str
    location_id: int
    desired_quantity: int
    actual_quantity: int
    location_code: Optional[str] = None
    location_name: Optional[str] = None
    item_sku: Optional[str] = None
    item_name: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class StocktakeDetailResponse(StocktakeResponse):
    items: list[StocktakeItemStockResponse] = Field(default_factory=list)


class StocktakeItemStockListResponse(BaseModel):
    items: list[StocktakeItemStockResponse]
    total: int
    page: int
    page_size: int
