from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal, Optional

from sqlalchemy.orm import Session

from app.modules.warehouse.inbound_order import inbound_order_service
from app.modules.warehouse.inbound_order.inbound_order_schema import (
    InboundOrderDetailResponse,
    InboundOrderProgressResponse,
    InboundProgressCounts,
    InboundProgressItemDetailRow,
    InboundProgressItemRow,
)

ProgressStatus = Literal["waiting", "running", "completed", "attention"]


def _empty_counts() -> dict[ProgressStatus, float]:
    return {"waiting": 0.0, "running": 0.0, "completed": 0.0, "attention": 0.0}


def progress_status(raw: str) -> ProgressStatus:
    normalized = raw.strip().lower().replace("-", "_")
    if normalized in {"initialize", "pending"}:
        return "waiting"
    if normalized in {"issued", "in_progress", "in_transit", "receiving", "partial"}:
        return "running"
    if normalized == "completed":
        return "completed"
    return "attention"


def _allocation_amount(quantity: object) -> float:
    try:
        amount = float(quantity)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(amount) or amount <= 0:
        return 0.0
    return amount


def _item_key(item_id: Optional[int], sku: Optional[str]) -> Optional[str]:
    if item_id is not None:
        return f"item:{item_id}"
    trimmed = (sku or "").strip()
    if trimmed:
        return f"sku:{trimmed}"
    return None


def _allocation_item_key(allocation) -> Optional[str]:
    return _item_key(allocation.item_id, allocation.sku)


@dataclass
class _ItemBucket:
    item_id: Optional[int] = None
    sku: Optional[str] = None
    item_name: Optional[str] = None
    waiting: float = 0.0
    running: float = 0.0
    completed: float = 0.0
    attention: float = 0.0

    def add(self, bucket: ProgressStatus, amount: float) -> None:
        setattr(self, bucket, getattr(self, bucket) + amount)

    @property
    def total_quantity(self) -> float:
        return self.waiting + self.running + self.completed + self.attention

    def to_row(self) -> InboundProgressItemRow:
        total = self.total_quantity
        percent = round(self.completed / total * 100) if total > 0 else 0
        return InboundProgressItemRow(
            item_id=self.item_id,
            sku=self.sku,
            item_name=self.item_name,
            total_quantity=total,
            waiting_quantity=self.waiting,
            running_quantity=self.running,
            completed_quantity=self.completed,
            attention_quantity=self.attention,
            completion_percent=percent,
        )


def build_inbound_progress_from_details(
    details: list[InboundOrderDetailResponse],
) -> InboundOrderProgressResponse:
    commands = _empty_counts()
    quantity = _empty_counts()
    vehicles: set[str] = set()
    items: dict[str, _ItemBucket] = {}

    for detail in details:
        status = progress_status(detail.status)
        commands[status] += 1

        vehicle = (detail.details or {}).get("vehicle_no")
        if isinstance(vehicle, str) and vehicle.strip():
            vehicles.add(vehicle.strip())

        for allocation in detail.allocations or []:
            amount = _allocation_amount(allocation.quantity)
            if amount <= 0:
                continue
            quantity[status] += amount

            key = _allocation_item_key(allocation)
            if not key:
                continue
            bucket = items.get(key)
            if bucket is None:
                bucket = _ItemBucket(
                    item_id=allocation.item_id,
                    sku=(allocation.sku or "").strip() or None,
                    item_name=allocation.item_name,
                )
                items[key] = bucket
            elif not bucket.item_name and allocation.item_name:
                bucket.item_name = allocation.item_name
            bucket.add(status, amount)

    def sort_key(row: InboundProgressItemRow) -> tuple[str, str]:
        label = (row.sku or row.item_name or "").casefold()
        return (label, str(row.item_id or ""))

    item_rows = sorted((b.to_row() for b in items.values()), key=sort_key)

    return InboundOrderProgressResponse(
        commands=InboundProgressCounts(**commands),
        quantity=InboundProgressCounts(**quantity),
        vehicles=sorted(vehicles, key=lambda v: v.casefold()),
        items=item_rows,
    )


def get_inbound_order_progress(
    db: Session, order_code: str
) -> Optional[InboundOrderProgressResponse]:
    details = inbound_order_service.get_inbound_order_detail(db, order_code)
    if details is None:
        return None
    return build_inbound_progress_from_details(details)


def _allocation_matches_filter(
    allocation,
    *,
    item_id: Optional[int],
    sku: Optional[str],
) -> bool:
    if item_id is not None:
        return allocation.item_id == item_id
    if sku is not None:
        return (allocation.sku or "").strip() == sku.strip()
    return False


def list_inbound_progress_item_details(
    db: Session,
    order_code: str,
    *,
    item_id: Optional[int] = None,
    sku: Optional[str] = None,
) -> Optional[list[InboundProgressItemDetailRow]]:
    details = inbound_order_service.get_inbound_order_detail(db, order_code)
    if details is None:
        return None

    rows: list[InboundProgressItemDetailRow] = []
    for detail in details:
        detail_qty = 0.0
        unit_name: Optional[str] = None
        for allocation in detail.allocations or []:
            if not _allocation_matches_filter(allocation, item_id=item_id, sku=sku):
                continue
            amount = _allocation_amount(allocation.quantity)
            if amount <= 0:
                continue
            detail_qty += amount
            if unit_name is None and allocation.unit_name:
                unit_name = allocation.unit_name
        if detail_qty <= 0:
            continue

        vehicle = (detail.details or {}).get("vehicle_no")
        vehicle_no = vehicle.strip() if isinstance(vehicle, str) and vehicle.strip() else None
        prog = progress_status(detail.status)
        rows.append(
            InboundProgressItemDetailRow(
                detail_id=detail.id,
                status=detail.status,
                progress_status=prog,
                to_location_code=detail.to_location_code,
                to_location_name=detail.to_location_name,
                vehicle_no=vehicle_no,
                quantity=detail_qty,
                unit_name=unit_name,
            )
        )
    return rows
