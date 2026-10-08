from __future__ import annotations

from typing import Any, Literal, Optional

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
    assign_robot_id: Optional[Literal["EE49822BAK00001", "EE49822BAK00002"]] = Field(
        None, description="Robot được chỉ định: FL 01 hoặc FL 02; bỏ trống để RCS tự chọn."
    )


class MasanInboundCallerResponse(BaseModel):
    queued: int
    detail_ids: list[int]
    job_ids: list[str]


class MasanClearInboundZoneRequest(BaseModel):
    warehouse_id: int = Field(..., gt=0)


class MasanClearInboundZoneResponse(BaseModel):
    warehouse_id: int
    zones: list[str] = Field(
        ...,
        description="Các zone inbound đã clear (settings.zone_inbound)",
    )
    deactivated_count: int = Field(
        0,
        description="Số dòng ItemStock is_active=True đã tắt trong các zone inbound",
    )


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


class MasanCcLocationLine(BaseModel):
    detail_id: int
    outbound_order_id: int
    item_id: int
    quantity: int = 0
    unit: Optional[str] = None
    detail_type: Optional[str] = None
    vehicle_no: Optional[str | int] = None
    customer_name: Optional[str] = None
    sku: Optional[str | int] = None
    trip: Optional[str | int] = None
    nvt: Optional[str | int] = None
    lot_number: Optional[str | int] = None
    pallet_count: Optional[str | int | float] = None
    status: Optional[str] = None


class MasanCcLocationResponse(BaseModel):
    warehouse_id: int
    location_id: int
    assigned: bool
    location_name: Optional[str] = None
    zone: Optional[str] = None
    vehicle_number: Optional[str] = None
    lines: list[MasanCcLocationLine] = Field(default_factory=list)


class MasanSortingZoneCcLocationRow(BaseModel):
    location_id: int
    location_code: str
    location_name: Optional[str] = None
    assigned: bool
    zone: Optional[str] = None
    vehicle_number: Optional[str] = None
    lines: list[MasanCcLocationLine] = Field(default_factory=list)


class MasanSortingZoneCcLocationsResponse(BaseModel):
    warehouse_id: int
    zone: str
    locations: list[MasanSortingZoneCcLocationRow] = Field(default_factory=list)


class MasanSortingItemNeededRow(BaseModel):
    item_id: int
    sku: str
    item_name: str
    total_quantity: int = 0


class MasanSortingItemsNeededResponse(BaseModel):
    warehouse_id: int
    zone: str = Field(
        ...,
        description="Mã zone CC trong cache (vd. Zone_CC_01), khớp bucket['zone']",
    )
    items: list[MasanSortingItemNeededRow] = Field(default_factory=list)
    line_count: int = Field(
        0,
        description="Số dòng detail trong cache thuộc zone trước khi gom theo item",
    )


class MasanSortingOutboundDispatchRequest(BaseModel):
    warehouse_id: int = Field(..., gt=0)
    zone: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Mã zone CC trong cache (vd. Zone_CC_01)",
    )
    item_id: int = Field(..., gt=0)
    to_location_id: int = Field(
        ...,
        gt=0,
        description="Location đích (ô sorting / buffer) khi execute robot",
    )


class MasanSortingOutboundLackedRow(BaseModel):
    id: int = Field(..., description="outbound_order_detail.id")
    item_id: int
    quantity: int = Field(..., description="Số lượng còn thiếu sau calculate")
    unit_id: int
    detail_type: str
    details: dict[str, Any] = Field(default_factory=dict)
    sku: Optional[str] = None
    item_name: Optional[str] = None
    unit: Optional[str] = None
    requested_quantity: int


class MasanSortingOutboundDispatchResponse(BaseModel):
    warehouse_id: int
    zone: str
    item_id: int
    lacked: list[MasanSortingOutboundLackedRow] = Field(default_factory=list)


class MasanConfirmAllocationOutboundRequest(BaseModel):
    warehouse_id: int = Field(..., gt=0)
    zone: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Mã zone CC trong cache (vd. Zone_CC_01)",
    )
    location_id: int = Field(
        ...,
        gt=0,
        description="Ô CC (location) đang hiển thị / confirm",
    )
    allocation_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0, description="Số lượng xác nhận tại CC")


class MasanConfirmAllocationOutboundResponse(BaseModel):
    warehouse_id: int
    zone: str
    location_id: int
    allocation_id: int
    quantity: int
    allocation_status: str = Field(
        ...,
        description="Trạng thái allocation sau confirm (confirmed / completed)",
    )
    outbound_order_detail_id: Optional[int] = None
    detail_status: Optional[str] = Field(
        None,
        description="Trạng thái dòng SO (column_property) sau xử lý",
    )


class MasanSortingZonePendingAllocationRow(BaseModel):
    id: int
    outbound_order_detail_id: int
    item_stock_id: int
    quantity: int
    status: str
    allocation_type: str
    sku: Optional[str] = Field(None, description="Part number / SKU hiển thị trên map")
    robot_task_id: Optional[int] = None
    from_location_id: Optional[int] = None
    to_location_id: Optional[int] = None


class MasanSortingZoneLocationPendingStock(BaseModel):
    location_id: int
    location_name: Optional[str] = None
    allocations: list[MasanSortingZonePendingAllocationRow] = Field(default_factory=list)


class MasanSortingZonePendingStockResponse(BaseModel):
    warehouse_id: int
    zone: str
    locations: list[MasanSortingZoneLocationPendingStock] = Field(default_factory=list)
    published_events: int = Field(
        0,
        description="Số lần publish WS khi republish=true",
    )
