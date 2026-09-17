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
