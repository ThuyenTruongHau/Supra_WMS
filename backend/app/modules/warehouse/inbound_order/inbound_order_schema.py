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

class InboundSuggestAllocationItemResponse(BaseModel):
    item_id: int
    quantity: int
    unit_id: int
    detail_type: str
    target_location_name: str
    target_location_id: int
    details: dict[str, Any] = Field(default_factory=dict)

class InboundSuggestAllocationResponse(BaseModel):
    line_items: list[InboundSuggestAllocationItemResponse]

class InboundReleaseLocationsRequest(BaseModel):
    location_ids: list[int] = Field(..., min_length=1)

class InboundReleaseLocationsResponse(BaseModel):
    deleted: int

class InboundOrderAllocationCreate(BaseModel):
    from_location_id: Optional[int] = None
    to_location_id: Optional[int] = None

class InboundOrderDetailCreate(BaseModel):
    item_id: int
    quantity: int = Field(..., ge=0)
    unit_id: int = Field(..., gt=0)
    lot_number: Optional[str] = None
    expiry_date: Optional[str] = None
    details: Optional[dict[str, Any]] = None
    allocation: InboundOrderAllocationCreate = Field(...)

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

class InboundOrderAllocationResponse(BaseModel):
    id: int
    inbound_order_detail_id: int
    item_stock_id: int
    quantity: int
    from_location_id: int
    to_location_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

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

class InboundOrderAllocationUpdate(BaseModel):
    id: Optional[int] = None  # có id = update, không id = create
    from_location_id: Optional[int] = Field(None, gt=0)
    to_location_id: Optional[int] = Field(None, gt=0)
    quantity: Optional[int] = Field(None, ge=0)

class InboundOrderDetailUpdate(BaseModel):
    id: Optional[int] = None
    delete: bool = False
    item_id: Optional[int] = Field(None, gt=0)
    quantity: Optional[int] = Field(None, ge=0)
    unit_id: Optional[int] = Field(None, gt=0)
    lot_number: Optional[str] = None
    expiry_date: Optional[str] = None
    details: Optional[dict[str, Any]] = None
    allocation: Optional[InboundOrderAllocationUpdate] = None

class InboundOrderUpdate(BaseModel):
    note: Optional[str] = None
    details: Optional[dict[str, Any]] = None
    line_items: Optional[list[InboundOrderDetailUpdate]] = None
