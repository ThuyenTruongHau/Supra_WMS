from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _serialize_item_for_response(data: Any) -> Any:
    from app.modules.warehouse.item.item_model import Item

    if isinstance(data, Item):
        return {
            "id": data.id,
            "sku": data.sku,
            "name": data.name,
            "description": data.description,
            "base_unit": data.unit.name if data.unit else "",
            "base_quantity": data.base_quantity,
            "max_quantity": data.max_quantity,
            "min_quantity": data.min_quantity,
            "warehouse_id": data.warehouse_id,
            "supplier": data.supplier,
            "details": data.details or {},
            "is_active": data.is_active,
            "quantity": data.quantity,
            "created_at": data.created_at,
            "updated_at": data.updated_at,
        }
    return data


class ItemCreate(BaseModel):
    sku: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    base_unit: int = Field(..., gt=0)
    base_quantity: int = Field(default=1, gt=0)
    max_quantity: int = Field(..., ge=0)
    min_quantity: int = Field(..., ge=0)
    warehouse_id: int
    supplier: str = Field(default="", max_length=50)
    details: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def validate_quantity_bounds(self) -> "ItemCreate":
        if self.min_quantity > self.max_quantity:
            raise ValueError("min_quantity must be less than or equal to max_quantity")
        return self


class ItemUpdate(BaseModel):
    sku: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    base_unit: Optional[int] = Field(None, gt=0)
    base_quantity: Optional[int] = Field(None, gt=0)
    max_quantity: Optional[int] = Field(None, ge=0)
    min_quantity: Optional[int] = Field(None, ge=0)
    warehouse_id: Optional[int] = None
    supplier: Optional[str] = Field(None, min_length=1, max_length=50)
    details: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def validate_quantity_bounds(self) -> "ItemUpdate":
        if (
            self.max_quantity is not None
            and self.min_quantity is not None
            and self.min_quantity > self.max_quantity
        ):
            raise ValueError("min_quantity must be less than or equal to max_quantity")
        return self


class ItemResponse(BaseModel):
    id: int
    sku: str
    name: str
    description: Optional[str] = None
    base_unit: str
    base_quantity: int
    max_quantity: int
    min_quantity: int
    warehouse_id: int
    supplier: str
    details: dict[str, Any] = Field(default_factory=dict)
    is_active: bool
    quantity: Optional[Decimal] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def serialize_item(cls, data: Any) -> Any:
        return _serialize_item_for_response(data)


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
    unit_id: int
    location_code: Optional[str] = None
    lot_number: Optional[str] = None
    expiry_date: Optional[str] = None
    quantity: Decimal
    status: str

    model_config = ConfigDict(from_attributes=True)


class ItemDetailResponse(BaseModel):
    item: ItemResponse
    stocks: list[ItemStockInDetail]
