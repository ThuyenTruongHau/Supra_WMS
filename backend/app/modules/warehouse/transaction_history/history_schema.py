from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class TransactionCreate(BaseModel):
    from_location_id: int
    to_location_id: int
    transaction_type: str = Field(..., min_length=1, max_length=50)
    item_stock_id: int
    quantity: int = Field(..., ge=0)


class TransactionResponse(BaseModel):
    id: int
    from_location_id: int
    to_location_id: int
    transaction_type: str
    item_stock_id: int
    quantity: int
    created_by_id: int
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    page: int
    page_size: int


class HistoryCreate(BaseModel):
    inbound_order_id: Optional[int] = None
    outbound_order_id: Optional[int] = None
    old_status: str
    new_status: str
    description: str
    details: dict

class HistoryResponse(BaseModel):
    id: int
    inbound_order_id: Optional[int] = None
    outbound_order_id: Optional[int] = None
    old_status: str
    new_status: str
    created_by_id: int
    created_at: Optional[datetime] = None
    description: str
    details: dict

    model_config = ConfigDict(from_attributes=True)

class HistoryListResponse(BaseModel):
    items: list[HistoryResponse]
    total: int
    page: int
    page_size: int