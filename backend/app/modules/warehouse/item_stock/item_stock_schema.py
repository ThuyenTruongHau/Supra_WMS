from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.warehouse.lot_number_utils import (
    format_lot_number_display,
    resolve_lot_number_fields,
)


class ItemStockCreate(BaseModel):
    item_id: int
    location_id: int
    unit_id: Optional[int] = Field(None, gt=0)
    quantity: Decimal = Field(default=Decimal("0"), ge=0)
    lot_number_from: Optional[str] = Field(None, max_length=50)
    lot_number_to: Optional[str] = Field(None, max_length=50)
    lot_number: Optional[str] = Field(None, max_length=50)
    expiry_date: Optional[str] = Field(None, max_length=50)
    status: str = Field(default="available", max_length=20)

    @model_validator(mode="after")
    def validate_lot_fields(self) -> "ItemStockCreate":
        if (
            self.lot_number_from is None
            and self.lot_number_to is None
            and self.lot_number is None
        ):
            return self
        from_val, to_val = resolve_lot_number_fields(
            lot_number_from=self.lot_number_from,
            lot_number_to=self.lot_number_to,
            lot_number=self.lot_number,
        )
        self.lot_number_from = from_val
        self.lot_number_to = to_val
        return self


class ItemStockUpdate(BaseModel):
    item_id: Optional[int] = None
    location_id: Optional[int] = None
    unit_id: Optional[int] = Field(None, gt=0)
    quantity: Optional[Decimal] = Field(None, ge=0)
    lot_number_from: Optional[str] = Field(None, max_length=50)
    lot_number_to: Optional[str] = Field(None, max_length=50)
    lot_number: Optional[str] = Field(None, max_length=50)
    expiry_date: Optional[str] = Field(None, max_length=50)
    status: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None

    @model_validator(mode="after")
    def validate_lot_fields(self) -> "ItemStockUpdate":
        if (
            self.lot_number_from is None
            and self.lot_number_to is None
            and self.lot_number is None
        ):
            return self
        from_val, to_val = resolve_lot_number_fields(
            lot_number_from=self.lot_number_from,
            lot_number_to=self.lot_number_to,
            lot_number=self.lot_number,
        )
        self.lot_number_from = from_val
        self.lot_number_to = to_val
        return self


class ItemStockResponse(BaseModel):
    id: int
    stock_code: UUID
    item_id: int
    location_id: int
    unit_id: int
    quantity: Decimal
    lot_number_from: Optional[str] = None
    lot_number_to: Optional[str] = None
    lot_number: Optional[str] = None
    expiry_date: Optional[str] = None
    status: str
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def set_lot_display(self) -> "ItemStockResponse":
        if self.lot_number is None:
            self.lot_number = format_lot_number_display(
                self.lot_number_from,
                self.lot_number_to,
            )
        return self


class ItemStockListResponse(BaseModel):
    items: list[ItemStockResponse]
    total: int
    page: int
    page_size: int
