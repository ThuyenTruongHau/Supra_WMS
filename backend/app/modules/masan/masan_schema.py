from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.modules.warehouse.inbound_order.inbound_order_schema import InboundSuggestAllocation
from app.modules.warehouse.outbound_order.outbound_order_schema import (
    OutboundRobotTaskResponse,
)


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


class MasanInboundBulkExportRequest(BaseModel):
    order_ids: list[int] = Field(..., min_length=1, max_length=100)


MasanOutboundBulkExportRequest = MasanInboundBulkExportRequest


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


class MasanClearCcCacheRequest(BaseModel):
    warehouse_id: int = Field(..., gt=0)


class MasanClearCcCacheResponse(BaseModel):
    warehouse_id: int
    zones: list[str] = Field(
        ...,
        description="Các zone CC cấu hình (settings.zone_cc)",
    )
    assigned_cc_location_keys: int = 0
    assigned_cc_details_keys: int = 0
    stock_ready_keys: int = 0
    total_keys_deleted: int = 0


class MasanClearOutboundStationCacheRequest(BaseModel):
    warehouse_id: int = Field(..., gt=0)
    cc_location_ids: list[int] = Field(
        ...,
        min_length=1,
        description="Danh sách location.id các ô CC thuộc một zone (map zone 10/11)",
    )


class MasanClearOutboundStationCacheResponse(BaseModel):
    warehouse_id: int
    assigned_cc_location: int = 0
    assigned_cc_details: int = 0
    stock_ready: int = 0
    orphan_details: int = 0
    zones_seen: list[str] = Field(
        default_factory=list,
        description="Zone.code đọc từ bucket đã xóa (vd. Zone_CC_01)",
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
    """False khi có lỗi locator/tồn chặn tạo đơn — FE vẫn nhận preview_rows."""
    can_import: bool = True
    import_errors: list[str] = Field(default_factory=list)


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


class MasanSortingZoneRobotTasksResponse(BaseModel):
    zone: str = Field(
        ...,
        description="Zone.code khu VT (vd. Zone_sorting_1) — khớp to_location sau gửi lệnh",
    )
    tasks: list[OutboundRobotTaskResponse] = Field(default_factory=list)


class MasanConfirmAllocationOutboundRequest(BaseModel):
    warehouse_id: int = Field(..., gt=0)
    zone: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Mã zone CC trong cache (vd. Zone_CC_01)",
    )
    quantities: dict[int, int] = Field(
        ...,
        min_length=1,
        description="allocation_id -> số lượng xác nhận",
    )

    @field_validator("quantities", mode="before")
    @classmethod
    def coerce_quantities(cls, value: Any) -> dict[int, int]:
        if not isinstance(value, dict):
            raise ValueError("quantities must be an object")
        out: dict[int, int] = {}
        for key, qty in value.items():
            alloc_id = int(key)
            quantity = int(qty)
            if quantity <= 0:
                raise ValueError(f"quantity for allocation {alloc_id} must be > 0")
            out[alloc_id] = quantity
        return out


class MasanConfirmAllocationOutboundResponse(BaseModel):
    warehouse_id: int
    zone: str
    quantities: dict[int, int]
    allocation_statuses: dict[int, str] = Field(
        default_factory=dict,
        description="Trạng thái allocation sau confirm (confirmed / completed)",
    )
    detail_statuses: dict[int, str] = Field(
        default_factory=dict,
        description="Trạng thái từng dòng SO (detail_id -> status) sau xử lý",
    )
    outbound_order_detail_id: Optional[int] = Field(
        None,
        description="Detail đầu tiên trong batch (tương thích cũ)",
    )
    detail_status: Optional[str] = Field(
        None,
        description="Trạng thái detail đầu tiên trong batch (tương thích cũ)",
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
    locator: Optional[str] = Field(
        None,
        description="Nguồn lấy hàng: location_name (from_location) hoặc locator trên detail",
    )
    outbound_order_id: Optional[int] = None
    item_id: Optional[int] = None
    unit: Optional[str] = None
    detail_type: Optional[str] = None
    vehicle_no: Optional[str | int] = None
    customer_name: Optional[str] = None
    trip: Optional[str | int] = None
    nvt: Optional[str | int] = None
    lot_number: Optional[str | int] = None
    pallet_count: Optional[str | int | float] = None


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


class MasanPickingListCreateRequest(BaseModel):
    warehouse_id: int = Field(..., ge=1)
    vehicle_no: str = Field(..., min_length=1, max_length=100)
    location_id: Optional[int] = Field(
        None,
        ge=1,
        description="Ô CC đang mở (validate khớp sorting_location của xe)",
    )


class MasanPickingListSummary(BaseModel):
    extracted: int
    line_count: int
    assigned_location: str = ""
    zone: str = ""
    vehicle_number: str


class MasanPickingListListResponse(BaseModel):
    vehicle_number: str
    items: list[MasanPickingListSummary] = Field(default_factory=list)
