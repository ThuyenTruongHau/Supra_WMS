from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from app.modules.warehouse.inbound_order.inbound_order_schema import InboundSuggestAllocation


class MasanInboundPreviewRow(BaseModel):
    row_no: int
    inbound_datetime: Optional[str] = None
    vehicle_no: Optional[str] = None
    from_warehouse: Optional[str] = None
    to_warehouse: Optional[str] = None
    delivery: Optional[str] = None
    nvt: Optional[str] = None
    sku: str
    item_name: Optional[str] = None
    lot: Optional[str] = None
    lot_status: Optional[str] = None
    quantity: int = 0
    pallet_count: Optional[str] = None
    storage_location: Optional[str] = None
    from_location_id: Optional[int] = None
    from_location_name: Optional[str] = None
    locator: Optional[str] = None
    item_id: Optional[int] = None
    unit_id: Optional[int] = None
    suggest_group_index: Optional[int] = Field(
        None,
        description="Index trong suggest_allocation.line_items; null nếu dòng không vào payload gợi ý",
    )
    error: Optional[str] = None


class MasanInboundParseResponse(BaseModel):
    preview_rows: list[MasanInboundPreviewRow]
    suggest_allocation: InboundSuggestAllocation
    total_rows: int
    valid_rows: int
    invalid_rows: int
    group_count: int
    warnings: list[str] = Field(default_factory=list)


class MasanInboundCallerRequest(BaseModel):
    location_ids: list[int] = Field(..., min_length=1)


class MasanInboundCallerResponse(BaseModel):
    queued: int
    detail_ids: list[int]
    job_ids: list[str]


class MasanOutboundPreviewRow(BaseModel):
    row_no: int
    vehicle_no: Optional[str] = None
    customer_name: Optional[str] = None
    trip: Optional[str] = None
    nvt: Optional[str] = None
    sku: str
    item_name: Optional[str] = None
    lot_number: Optional[str] = None
    lot_status: Optional[str] = None
    quantity: int = 0
    pallet_count: Optional[str] = None
    locator: Optional[str] = None
    item_id: Optional[int] = None
    unit_id: Optional[int] = None
    error: Optional[str] = None


class MasanOutboundLineItem(BaseModel):
    item_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)
    unit_id: int = Field(..., gt=0)
    detail_type: str = Field(..., min_length=1, max_length=50)
    details: dict[str, Any] = Field(default_factory=dict)


class MasanOutboundParseResponse(BaseModel):
    preview_rows: list[MasanOutboundPreviewRow]
    line_items: list[MasanOutboundLineItem]
    total_rows: int
    valid_rows: int
    invalid_rows: int
    warnings: list[str] = Field(default_factory=list)
