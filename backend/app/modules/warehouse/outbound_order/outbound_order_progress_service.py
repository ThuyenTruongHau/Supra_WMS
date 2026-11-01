from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.cache import cache_get
from app.core.config import settings
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.outbound_order.outbound_operator_board_service import (
    CUSTOMER_SENTINEL,
    VEHICLE_SENTINEL,
    normalize_customer,
    normalize_trip,
    normalize_vehicle,
)
from app.modules.warehouse.outbound_order.outbound_order_model import (
    IGNORED_ALLOCATION_STATUSES,
    OutboundOrder,
    OutboundOrderAllocation,
    OutboundOrderDetail,
)
from app.modules.warehouse.outbound_order.outbound_order_schema import (
    OutboundOrderDetailResponse,
    OutboundOrderProgressResponse,
    OutboundProgressCounts,
    OutboundProgressGroupDetailRow,
    OutboundProgressGroupRow,
)

ProgressStatus = Literal["waiting", "running", "completed", "attention"]
OutboundProgressDimension = Literal[
    "vehicle", "sku", "split_position", "split_zone"
]

UNASSIGNED_SPLIT_POSITION_KEY = "__unassigned_split_position__"
UNASSIGNED_SPLIT_POSITION_LABEL = "Chưa gán vị trí"
UNASSIGNED_SPLIT_ZONE_KEY = "__unassigned_split_zone__"
UNASSIGNED_SPLIT_ZONE_LABEL = "Chưa gán zone"
VEHICLE_DISPLAY_NO = "Chưa có xe"


def _empty_counts() -> dict[ProgressStatus, float]:
    return {"waiting": 0.0, "running": 0.0, "completed": 0.0, "attention": 0.0}


def outbound_progress_status(raw: str) -> ProgressStatus:
    normalized = raw.strip().lower().replace("-", "_")
    if normalized == "initialize":
        return "waiting"
    if normalized in {"reserved", "in_progress"}:
        return "running"
    if normalized == "completed":
        return "completed"
    return "attention"


def _detail_quantity(detail: OutboundOrderDetail | OutboundOrderDetailResponse) -> float:
    try:
        amount = float(detail.quantity)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    return max(amount, 0.0)


def _meta_dict(detail: OutboundOrderDetail | OutboundOrderDetailResponse) -> dict:
    raw = detail.details
    return raw if isinstance(raw, dict) else {}


def _vehicle_key_label(meta: dict) -> tuple[str, str]:
    vehicle = normalize_vehicle(meta)
    if vehicle == VEHICLE_SENTINEL:
        return VEHICLE_SENTINEL, VEHICLE_DISPLAY_NO
    return vehicle, vehicle


def _customer_key(meta: dict) -> str:
    return normalize_customer(meta)


def _trip_key(meta: dict) -> str:
    return normalize_trip(meta)


def _sku_key_label(
    detail: OutboundOrderDetail | OutboundOrderDetailResponse,
) -> tuple[str, str]:
    item_id = detail.item_id
    sku = getattr(detail, "sku", None)
    if sku is None and hasattr(detail, "item") and detail.item is not None:
        sku = detail.item.sku
    sku_trim = (sku or "").strip() if isinstance(sku, str) else ""
    if item_id is not None:
        label = sku_trim or f"#{item_id}"
        return f"item:{item_id}", label
    if sku_trim:
        return f"sku:{sku_trim}", sku_trim
    return "item:unknown", "—"


def _split_position_location_name(loc: Location | None) -> str:
    if loc is None:
        return ""
    name = loc.location_name
    if name is not None and str(name).strip():
        return str(name).strip()
    return ""


def _split_position_name_from_code(
    db: Session, warehouse_id: int, code: object
) -> str:
    if code is None:
        return ""
    text = str(code).strip()
    if not text:
        return ""
    loc = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.location_code == text,
        )
        .first()
    )
    return _split_position_location_name(loc)


def _collect_split_position_parts(
    meta: dict,
    *,
    detail: OutboundOrderDetail | None = None,
    db: Session | None = None,
    warehouse_id: int | None = None,
) -> list[str]:
    parts: list[str] = []
    seen: set[str] = set()

    def add_name(text: str) -> None:
        cleaned = text.strip()
        if not cleaned or cleaned in seen:
            return
        seen.add(cleaned)
        parts.append(cleaned)

    def add(raw: object) -> None:
        if raw is None:
            return
        add_name(str(raw))

    if detail is not None:
        add_name(_split_position_location_name(detail.sorting_location))
        if db is not None and detail.sorting_location_id is not None and detail.sorting_location is None:
            add_name(_split_position_location_name(db.get(Location, detail.sorting_location_id)))

    if detail is not None and db is not None and warehouse_id is not None:
        bucket = cache_get(f"outbound:assigned_cc_details:{warehouse_id}:{detail.id}")
        if isinstance(bucket, dict) and bucket.get("location_id") is not None:
            loc = db.get(Location, int(bucket["location_id"]))
            add_name(_split_position_location_name(loc))
        add_name(
            _split_position_name_from_code(db, warehouse_id, meta.get("sorting_position"))
        )
    else:
        add(meta.get("sorting_location_name"))

    return parts


def _collect_from_location_names(
    detail: OutboundOrderDetail | OutboundOrderDetailResponse,
) -> Optional[str]:
    parts: list[str] = []
    seen: set[str] = set()
    for allocation in detail.allocations or []:
        if getattr(allocation, "allocation_type", "outbound") != "outbound":
            continue
        status = (getattr(allocation, "status", "") or "").strip().lower()
        if status in IGNORED_ALLOCATION_STATUSES:
            continue
        name_raw = getattr(allocation, "from_location_name", None)
        if name_raw is not None and str(name_raw).strip():
            name = str(name_raw).strip()
        else:
            loc = getattr(allocation, "from_location", None)
            name = _split_position_location_name(loc)
        if not name or name in seen:
            continue
        seen.add(name)
        parts.append(name)
    return ", ".join(parts) if parts else None


def _split_position_fields(
    meta: dict,
    *,
    detail: OutboundOrderDetail | None = None,
    db: Session | None = None,
    warehouse_id: int | None = None,
) -> tuple[str, str, Optional[str]]:
    parts = _collect_split_position_parts(
        meta, detail=detail, db=db, warehouse_id=warehouse_id
    )
    if not parts:
        return UNASSIGNED_SPLIT_POSITION_KEY, UNASSIGNED_SPLIT_POSITION_LABEL, None
    display = ", ".join(parts)
    key = display if len(parts) > 1 else parts[0]
    return key, display, display


def _zone_code_from_location(loc: Location | None, cc_codes: set[str]) -> Optional[str]:
    if loc is None or loc.zone is None:
        return None
    code = (loc.zone.code or "").strip()
    if code and code in cc_codes:
        return code
    return None


def _split_zone_key_label_orm(
    db: Session,
    detail: OutboundOrderDetail,
    warehouse_id: int,
    cc_codes: set[str],
    meta: dict,
) -> tuple[str, str]:
    code = _zone_code_from_location(detail.sorting_location, cc_codes)
    if code:
        return code, code

    for allocation in detail.allocations or []:
        if getattr(allocation, "allocation_type", "outbound") != "outbound":
            continue
        code = _zone_code_from_location(allocation.to_location, cc_codes)
        if code:
            return code, code

    bucket = cache_get(f"outbound:assigned_cc_details:{warehouse_id}:{detail.id}")
    if isinstance(bucket, dict) and bucket.get("location_id") is not None:
        loc = db.get(Location, int(bucket["location_id"]))
        code = _zone_code_from_location(loc, cc_codes)
        if code:
            return code, code

    override = meta.get("split_zone_code")
    if override is not None and str(override).strip():
        label = str(override).strip()
        return label, label

    return UNASSIGNED_SPLIT_ZONE_KEY, UNASSIGNED_SPLIT_ZONE_LABEL


def _split_zone_key_label_response(meta: dict) -> tuple[str, str]:
    override = meta.get("split_zone_code")
    if override is not None and str(override).strip():
        label = str(override).strip()
        return label, label
    return UNASSIGNED_SPLIT_ZONE_KEY, UNASSIGNED_SPLIT_ZONE_LABEL


@dataclass
class _GroupBucket:
    key: str
    label: str
    waiting: float = 0.0
    running: float = 0.0
    completed: float = 0.0
    attention: float = 0.0

    def add(self, bucket: ProgressStatus, amount: float) -> None:
        setattr(self, bucket, getattr(self, bucket) + amount)

    @property
    def total_quantity(self) -> float:
        return self.waiting + self.running + self.completed + self.attention

    def to_row(self) -> OutboundProgressGroupRow:
        total = self.total_quantity
        percent = round(self.completed / total * 100) if total > 0 else 0
        return OutboundProgressGroupRow(
            key=self.key,
            label=self.label,
            total_quantity=total,
            waiting_quantity=self.waiting,
            running_quantity=self.running,
            completed_quantity=self.completed,
            attention_quantity=self.attention,
            completion_percent=percent,
        )


@dataclass
class _DetailSlice:
    detail_id: int
    status: str
    quantity: float
    unit: str
    sku: Optional[str]
    vehicle_key: str
    vehicle_label: str
    sku_key: str
    sku_label: str
    split_position_key: str
    split_position_label: str
    split_zone_key: str
    split_zone_label: str
    split_position_display: Optional[str]
    from_location_display: Optional[str]
    customer_key: str
    trip_key: str


def _accumulate_group(
    groups: dict[str, _GroupBucket],
    key: str,
    label: str,
    prog: ProgressStatus,
    amount: float,
) -> None:
    bucket = groups.get(key)
    if bucket is None:
        bucket = _GroupBucket(key=key, label=label)
        groups[key] = bucket
    bucket.add(prog, amount)


def _sorted_group_rows(groups: dict[str, _GroupBucket]) -> list[OutboundProgressGroupRow]:
    rows = [b.to_row() for b in groups.values()]
    return sorted(rows, key=lambda r: (r.label.casefold(), r.key))


def _build_from_slices(slices: list[_DetailSlice]) -> OutboundOrderProgressResponse:
    commands = _empty_counts()
    quantity = _empty_counts()
    vehicle_keys: set[str] = set()
    trip_keys: set[str] = set()
    customer_keys: set[str] = set()
    by_vehicle: dict[str, _GroupBucket] = {}
    by_sku: dict[str, _GroupBucket] = {}
    by_split_position: dict[str, _GroupBucket] = {}
    by_split_zone: dict[str, _GroupBucket] = {}

    for row in slices:
        prog = outbound_progress_status(row.status)
        commands[prog] += 1
        qty = row.quantity
        quantity[prog] += qty

        if row.vehicle_key != VEHICLE_SENTINEL:
            vehicle_keys.add(row.vehicle_key)
        if row.trip_key:
            trip_keys.add(row.trip_key)
        if row.customer_key != CUSTOMER_SENTINEL:
            customer_keys.add(row.customer_key)

        _accumulate_group(by_vehicle, row.vehicle_key, row.vehicle_label, prog, qty)
        _accumulate_group(by_sku, row.sku_key, row.sku_label, prog, qty)
        _accumulate_group(
            by_split_position,
            row.split_position_key,
            row.split_position_label,
            prog,
            qty,
        )
        _accumulate_group(
            by_split_zone, row.split_zone_key, row.split_zone_label, prog, qty
        )

    return OutboundOrderProgressResponse(
        commands=OutboundProgressCounts(**commands),
        quantity=OutboundProgressCounts(**quantity),
        vehicle_count=len(vehicle_keys),
        trip_count=len(trip_keys),
        customer_count=len(customer_keys),
        by_vehicle=_sorted_group_rows(by_vehicle),
        by_sku=_sorted_group_rows(by_sku),
        by_split_position=_sorted_group_rows(by_split_position),
        by_split_zone=_sorted_group_rows(by_split_zone),
    )


def _slice_from_response(detail: OutboundOrderDetailResponse) -> _DetailSlice:
    meta = _meta_dict(detail)
    vehicle_key, vehicle_label = _vehicle_key_label(meta)
    sku_key, sku_label = _sku_key_label(detail)
    split_position_key, split_position_label, split_position_display = _split_position_fields(meta)
    split_zone_key, split_zone_label = _split_zone_key_label_response(meta)
    sku = (detail.sku or "").strip() or None
    return _DetailSlice(
        detail_id=detail.id,
        status=detail.status,
        quantity=_detail_quantity(detail),
        unit=detail.unit,
        sku=sku,
        vehicle_key=vehicle_key,
        vehicle_label=vehicle_label,
        sku_key=sku_key,
        sku_label=sku_label,
        split_position_key=split_position_key,
        split_position_label=split_position_label,
        split_zone_key=split_zone_key,
        split_zone_label=split_zone_label,
        split_position_display=split_position_display,
        from_location_display=_collect_from_location_names(detail),
        customer_key=_customer_key(meta),
        trip_key=_trip_key(meta),
    )


def build_outbound_progress_from_details(
    details: list[OutboundOrderDetailResponse],
) -> OutboundOrderProgressResponse:
    return _build_from_slices([_slice_from_response(d) for d in details])


def _load_detail_slices(db: Session, order_id: int) -> Optional[list[_DetailSlice]]:
    order = db.query(OutboundOrder).filter(OutboundOrder.id == order_id).first()
    if not order:
        return None

    cc_codes = set(settings.zone_cc)
    details = (
        db.query(OutboundOrderDetail)
        .options(
            joinedload(OutboundOrderDetail.item),
            joinedload(OutboundOrderDetail.sorting_location).joinedload(Location.zone),
            selectinload(OutboundOrderDetail.allocations).joinedload(
                OutboundOrderAllocation.from_location
            ),
            selectinload(OutboundOrderDetail.allocations)
            .joinedload(OutboundOrderAllocation.to_location)
            .joinedload(Location.zone),
        )
        .filter(OutboundOrderDetail.outbound_order_id == order_id)
        .order_by(OutboundOrderDetail.id)
        .all()
    )

    slices: list[_DetailSlice] = []
    warehouse_id = order.warehouse_id
    for detail in details:
        meta = _meta_dict(detail)
        vehicle_key, vehicle_label = _vehicle_key_label(meta)
        sku_key, sku_label = _sku_key_label(detail)
        split_position_key, split_position_label, split_position_display = _split_position_fields(
            meta, detail=detail, db=db, warehouse_id=warehouse_id
        )
        split_zone_key, split_zone_label = _split_zone_key_label_orm(
            db, detail, warehouse_id, cc_codes, meta
        )
        item = detail.item
        sku = item.sku if item else None
        slices.append(
            _DetailSlice(
                detail_id=detail.id,
                status=detail.status,
                quantity=_detail_quantity(detail),
                unit=detail.unit,
                sku=(sku or "").strip() or None,
                vehicle_key=vehicle_key,
                vehicle_label=vehicle_label,
                sku_key=sku_key,
                sku_label=sku_label,
                split_position_key=split_position_key,
                split_position_label=split_position_label,
                split_zone_key=split_zone_key,
                split_zone_label=split_zone_label,
                split_position_display=split_position_display,
                from_location_display=_collect_from_location_names(detail),
                customer_key=_customer_key(meta),
                trip_key=_trip_key(meta),
            )
        )
    return slices


def get_outbound_order_progress(
    db: Session, order_id: int
) -> Optional[OutboundOrderProgressResponse]:
    slices = _load_detail_slices(db, order_id)
    if slices is None:
        return None
    return _build_from_slices(slices)


def _slice_matches_dimension(
    row: _DetailSlice, dimension: OutboundProgressDimension, key: str
) -> bool:
    if dimension == "vehicle":
        return row.vehicle_key == key
    if dimension == "sku":
        return row.sku_key == key
    if dimension == "split_position":
        return row.split_position_key == key
    if dimension == "split_zone":
        return row.split_zone_key == key
    return False


def _vehicle_display(meta_vehicle: str) -> Optional[str]:
    if meta_vehicle == VEHICLE_SENTINEL:
        return None
    return meta_vehicle


def _detail_row_from_slice(row: _DetailSlice) -> OutboundProgressGroupDetailRow:
    prog = outbound_progress_status(row.status)
    vehicle_no = _vehicle_display(row.vehicle_label) or (
        None if row.vehicle_key == VEHICLE_SENTINEL else row.vehicle_label
    )
    return OutboundProgressGroupDetailRow(
        detail_id=row.detail_id,
        status=row.status,
        progress_status=prog,
        quantity=row.quantity,
        unit=row.unit,
        sku=row.sku,
        vehicle_no=vehicle_no,
        split_position=row.split_position_display,
        from_location_name=row.from_location_display,
    )


def list_outbound_progress_group_details(
    db: Session,
    order_id: int,
    *,
    dimension: OutboundProgressDimension,
    key: str,
) -> Optional[list[OutboundProgressGroupDetailRow]]:
    slices = _load_detail_slices(db, order_id)
    if slices is None:
        return None
    normalized_key = key.strip()
    rows = [
        _detail_row_from_slice(row)
        for row in slices
        if _slice_matches_dimension(row, dimension, normalized_key)
    ]
    return rows


def list_outbound_progress_group_details_from_details(
    details: list[OutboundOrderDetailResponse],
    *,
    dimension: OutboundProgressDimension,
    key: str,
) -> list[OutboundProgressGroupDetailRow]:
    normalized_key = key.strip()
    slices = [_slice_from_response(d) for d in details]
    return [
        _detail_row_from_slice(row)
        for row in slices
        if _slice_matches_dimension(row, dimension, normalized_key)
    ]
