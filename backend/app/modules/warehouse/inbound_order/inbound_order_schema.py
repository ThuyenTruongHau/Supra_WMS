from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrder, InboundOrderDetail, InboundOrderAllocation

class InboundSuggestAllocationDetail(BaseModel):
    """1 dòng hàng cần gợi ý phân bổ — giống detail, không có allocations."""
    item_id: int
    quantity: int = Field(..., gt=0)
    unit_id: int = Field(..., gt=0)
    detail_type: str = Field(..., min_length=1, max_length=50)
    details: Optional[dict[str, Any]] = None
    
class InboundSuggestAllocation(BaseModel):
    """Request gợi ý phân bổ cho nhiều detail."""
    warehouse_id: int
    line_items: list[InboundSuggestAllocationDetail] = Field(..., min_length=1)

class InboundOrderAllocationCreate(BaseModel):
    item_stock_id: int
    quantity: int = Field(..., ge=0)
    from_location_id: int
    to_location_id: int

class InboundOrderDetailCreate(BaseModel):
    item_id: int
    quantity: int = Field(..., ge=0)
    unit_id: int = Field(..., gt=0)
    detail_type: str = Field(..., min_length=1, max_length=50)
    details: Optional[dict[str, Any]] = None
    allocations: list[InboundOrderAllocationCreate] = Field(default_factory=list)

class InboundOrderCreate(BaseModel):
    order_code: str = Field(..., min_length=1, max_length=50)
    note: Optional[str] = None
    warehouse_id: int
    details: Optional[dict[str, Any]] = None          
    line_items: list[InboundOrderDetailCreate] = Field(..., min_length=1)


class InboundOrderResponse(BaseModel):
    id: int
    order_code: str
    status: str
    note: Optional[str] = None
    created_by_id: int
    warehouse_id: int
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class InboundOrderDetailResponse(BaseModel):
    id: int
    inbound_order_id: int
    item_id: int
    quantity: int
    unit_id: int
    status: str
    detail_type: str
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    allocations: list[InboundOrderAllocationResponse] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)

