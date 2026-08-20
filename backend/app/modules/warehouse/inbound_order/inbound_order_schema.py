from __future__ import annotations

from datetime import datetime
from typing import Any, Optional, List

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.modules.warehouse.lot_number_utils import (
    format_lot_number_display,
    normalize_lot_number as _normalize_lot_number,
    resolve_lot_number_fields as _resolve_lot_number_fields,
)


class InboundSuggestAllocationDetail(BaseModel):
    item_id: int
    quantity: int = Field(..., gt=0)
    lot_number_from: Optional[str] = Field(None, max_length=50)
    lot_number_to: Optional[str] = Field(None, max_length=50)
    lot_number: Optional[str] = Field(None, max_length=50)
    unit_id: int = Field(..., gt=0)

    @model_validator(mode="after")
    def validate_lot_fields(self) -> "InboundSuggestAllocationDetail":
        from_val, to_val = _resolve_lot_number_fields(
            lot_number_from=self.lot_number_from,
            lot_number_to=self.lot_number_to,
            lot_number=self.lot_number,
        )
        self.lot_number_from = from_val
        self.lot_number_to = to_val
        return self


class InboundSuggestAdditionalDetail(BaseModel):
    items: list[InboundSuggestAllocationDetail] = Field(..., min_length=1)
    details: Optional[dict[str, Any]] = None


class InboundSuggestAllocation(BaseModel):
    warehouse_id: int
    detail_type: str = Field(..., min_length=1, max_length=50)
    line_items: list[InboundSuggestAdditionalDetail] = Field(..., min_length=1)


class InboundSuggestAllocationItemResponse(BaseModel):
    item_id: int
    quantity: int
    unit_id: int
    lot_number_from: Optional[str] = None
    lot_number_to: Optional[str] = None
    lot_number: Optional[str] = None
    details: dict[str, Any] = Field(default_factory=dict)


class SuggestAdditionalResponse(BaseModel):
    detail_type: str
    target_location_name: str
    target_location_id: int
    line_items: list[InboundSuggestAllocationItemResponse]


class InboundSuggestAllocationResponse(BaseModel):
    line_items: list[SuggestAdditionalResponse]


class InboundReleaseLocationsRequest(BaseModel):
    location_ids: list[int] = Field(..., min_length=1)


class InboundReleaseLocationsResponse(BaseModel):
    deleted: int


class InboundOrderAllocationCreate(BaseModel):
    item_id: int = Field(..., gt=0)
    quantity: int = Field(..., gt=0)
    unit_id: int = Field(..., gt=0)
    lot_number_from: Optional[str] = Field(None, max_length=50)
    lot_number_to: Optional[str] = Field(None, max_length=50)
    lot_number: Optional[str] = Field(None, max_length=50)
    expiry_date: Optional[str] = None

    @model_validator(mode="after")
    def validate_lot_fields(self) -> "InboundOrderAllocationCreate":
        from_val, to_val = _resolve_lot_number_fields(
            lot_number_from=self.lot_number_from,
            lot_number_to=self.lot_number_to,
            lot_number=self.lot_number,
        )
        self.lot_number_from = from_val
        self.lot_number_to = to_val
        return self


class InboundOrderDetailCreate(BaseModel):
    from_location_id: int = Field(..., gt=0)
    to_location_id: int = Field(..., gt=0)
    details: Optional[dict[str, Any]] = None
    allocations: List[InboundOrderAllocationCreate] = Field(..., min_length=1)


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


class InboundOrderListSummary(BaseModel):
    total: int
    initialize: int
    in_progress: int
    completed: int


class InboundOrderListResponse(BaseModel):
    items: list[InboundOrderResponse]
    total: int
    page: int
    page_size: int
    summary: InboundOrderListSummary


class InboundOrderAllocationResponse(BaseModel):
    id: int
    inbound_order_detail_id: int
    item_stock_id: int
    unit_id: int
    quantity: int
    status: str
    item_id: Optional[int] = None
    sku: Optional[str] = None
    item_name: Optional[str] = None
    unit_name: Optional[str] = None
    lot_number_from: Optional[str] = None
    lot_number_to: Optional[str] = None
    lot_number: Optional[str] = None
    expiry_date: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class InboundOrderDetailResponse(BaseModel):
    id: int
    inbound_order_id: int
    from_location_id: Optional[int] = None
    to_location_id: Optional[int] = None
    from_location_code: Optional[str] = None
    from_location_name: Optional[str] = None
    to_location_code: Optional[str] = None
    to_location_name: Optional[str] = None
    status: str
    detail_type: str
    details: dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    allocations: list[InboundOrderAllocationResponse] = Field(default_factory=list)
    model_config = ConfigDict(from_attributes=True)


class InboundOrderAllocationUpdate(BaseModel):
    id: Optional[int] = None  # có id = update, không id = create
    delete: bool = False
    item_id: Optional[int] = Field(None, gt=0)
    quantity: Optional[int] = Field(None, ge=0)
    unit_id: Optional[int] = Field(None, gt=0)
    lot_number_from: Optional[str] = Field(None, max_length=50)
    lot_number_to: Optional[str] = Field(None, max_length=50)
    lot_number: Optional[str] = Field(None, max_length=50)
    expiry_date: Optional[str] = None

    @field_validator(
        "lot_number_from",
        "lot_number_to",
        "lot_number",
        mode="before",
    )
    @classmethod
    def normalize_optional_lot_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = _normalize_lot_number(value)
        if value is not None and not normalized:
            raise ValueError("lot number must not be blank")
        return normalized

    @model_validator(mode="after")
    def validate_lot_fields(self) -> "InboundOrderAllocationUpdate":
        if (
            self.lot_number_from is None
            and self.lot_number_to is None
            and self.lot_number is None
        ):
            return self
        from_val, to_val = _resolve_lot_number_fields(
            lot_number_from=self.lot_number_from,
            lot_number_to=self.lot_number_to,
            lot_number=self.lot_number,
        )
        self.lot_number_from = from_val
        self.lot_number_to = to_val
        return self


class InboundOrderDetailUpdate(BaseModel):
    id: Optional[int] = None
    delete: bool = False
    from_location_id: Optional[int] = Field(None, gt=0)
    to_location_id: Optional[int] = Field(None, gt=0)
    details: Optional[dict[str, Any]] = None
    allocations: Optional[list[InboundOrderAllocationUpdate]] = None


class InboundOrderUpdate(BaseModel):
    note: Optional[str] = None
    details: Optional[dict[str, Any]] = None
    line_items: Optional[list[InboundOrderDetailUpdate]] = None


class InboundOrderDeleteResponse(BaseModel):
    order_code: str
    message: str


class RobotTaskResponse(BaseModel):
    id: int
    order_id: str
    quantity: int
    process_code: str
    system_code: str
    task_order_detail: str
    inbound_order_detail_id: Optional[int] = None
    status: str = "initialize"
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class InboundExecuteDetailResult(BaseModel):
    """Một nhóm hàng + robot task (nếu auto)."""
    detail: InboundOrderDetailResponse
    robot_task: Optional[RobotTaskResponse] = None


class InboundCallerResponse(BaseModel):
    order: InboundOrderResponse
    line_items: list[InboundExecuteDetailResult] = Field(default_factory=list)
    robot_tasks: list[RobotTaskResponse] = Field(default_factory=list)
