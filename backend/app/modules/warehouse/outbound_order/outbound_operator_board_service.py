from __future__ import annotations

from collections import defaultdict
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrder,
    OutboundOrderDetail,
)

VEHICLE_SENTINEL = "no_vehicle"
CUSTOMER_SENTINEL = "Unknown"
TRIP_PATH_EMPTY = "_empty"

# Khớp WMS/admin: chỉ detail completed mới coi là xong (in_progress vẫn đang thực hiện).
DONE_DETAIL_STATUSES = frozenset({"completed"})


def _meta_str(meta: dict[str, Any], *keys: str, default: str = "") -> str:
    for key in keys:
        raw = meta.get(key)
        if raw is None:
            continue
        cleaned = str(raw).strip()
        if cleaned:
            return cleaned
    return default


def normalize_vehicle(meta: dict[str, Any]) -> str:
    value = _meta_str(meta, "vehicle_no", "vehicle_number", default="")
    return value or VEHICLE_SENTINEL


def normalize_customer(meta: dict[str, Any]) -> str:
    value = _meta_str(meta, "customer_name", default="")
    return value or CUSTOMER_SENTINEL


def normalize_trip(meta: dict[str, Any]) -> str:
    return _meta_str(meta, "trip", "trip_code", default="")


def trip_from_path_key(trip_key: str) -> str:
    if trip_key == TRIP_PATH_EMPTY:
        return ""
    return trip_key


def trip_to_path_key(trip: str) -> str:
    return TRIP_PATH_EMPTY if not trip.strip() else trip.strip()


def is_detail_done(status: str) -> bool:
    return status in DONE_DETAIL_STATUSES


def is_detail_pending(status: str) -> bool:
    return not is_detail_done(status)


def done_coverage(total: int, done: int, pending: int) -> str:
    if total <= 0:
        return "none"
    if pending <= 0:
        return "full"
    if done <= 0:
        return "none"
    return "partial"


def _detail_meta(detail: OutboundOrderDetail) -> dict[str, Any]:
    raw = detail.details
    return raw if isinstance(raw, dict) else {}


def _detail_dimensions(
    detail: OutboundOrderDetail,
) -> tuple[str, str, str]:
    meta = _detail_meta(detail)
    return (
        normalize_vehicle(meta),
        normalize_customer(meta),
        normalize_trip(meta),
    )


def _new_progress_bucket() -> dict[str, Any]:
    return {
        "total_detail_count": 0,
        "done_detail_count": 0,
        "pending_detail_count": 0,
        "total_quantity": 0,
        "pending_quantity": 0,
        "statuses": set(),
    }


def _accumulate_progress(bucket: dict[str, Any], detail: OutboundOrderDetail) -> None:
    qty = int(detail.quantity or 0)
    bucket["total_detail_count"] += 1
    bucket["total_quantity"] += qty
    if is_detail_done(detail.status):
        bucket["done_detail_count"] += 1
    else:
        bucket["pending_detail_count"] += 1
        bucket["pending_quantity"] += qty
        bucket["statuses"].add(detail.status)


def _progress_row_fields(bucket: dict[str, Any]) -> dict[str, Any]:
    total = bucket["total_detail_count"]
    done = bucket["done_detail_count"]
    pending = bucket["pending_detail_count"]
    return {
        "detail_count": total,
        "total_detail_count": total,
        "done_detail_count": done,
        "pending_detail_count": pending,
        "total_quantity": bucket["total_quantity"],
        "pending_quantity": bucket["pending_quantity"],
        "is_fully_done": total > 0 and pending == 0,
        "done_coverage": done_coverage(total, done, pending),
    }


def _get_order_or_raise(db: Session, order_id: int) -> OutboundOrder:
    order = db.query(OutboundOrder).filter(OutboundOrder.id == order_id).first()
    if not order:
        raise ValueError(f"Outbound order {order_id} not found")
    return order


def _all_details_for_order(db: Session, order_id: int) -> list[OutboundOrderDetail]:
    return (
        db.query(OutboundOrderDetail)
        .options(joinedload(OutboundOrderDetail.item))
        .filter(OutboundOrderDetail.outbound_order_id == order_id)
        .order_by(OutboundOrderDetail.id)
        .all()
    )


def detail_to_board_line(detail: OutboundOrderDetail) -> dict[str, Any]:
    meta = _detail_meta(detail)
    item = detail.item
    sku = meta.get("sku")
    if (sku is None or str(sku).strip() == "") and item is not None:
        sku = item.sku
    return {
        "detail_id": detail.id,
        "item_id": detail.item_id,
        "sku": sku,
        "quantity": detail.quantity,
        "unit": detail.unit,
        "status": detail.status,
        "vehicle_no": normalize_vehicle(meta),
        "customer_name": normalize_customer(meta),
        "trip": normalize_trip(meta),
        "lot_number": meta.get("lot_number"),
        "pallet_count": meta.get("pallet_count"),
    }


def list_operator_board_orders(
    db: Session,
    *,
    warehouse_id: int,
    page: int = 1,
    page_size: int = 20,
    q: Optional[str] = None,
) -> tuple[list[dict[str, Any]], int]:
    base = db.query(OutboundOrder).filter(
        OutboundOrder.warehouse_id == warehouse_id,
    )
    if q:
        base = base.filter(OutboundOrder.order_code.ilike(f"%{q.strip()}%"))

    total = base.count()
    orders = (
        base.order_by(OutboundOrder.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    if not orders:
        return [], total

    order_ids = [o.id for o in orders]
    all_details = (
        db.query(OutboundOrderDetail)
        .filter(OutboundOrderDetail.outbound_order_id.in_(order_ids))
        .all()
    )

    stats: dict[int, dict[str, Any]] = defaultdict(_new_progress_bucket)
    pending_vehicles: dict[int, set[str]] = defaultdict(set)
    all_vehicles: dict[int, set[str]] = defaultdict(set)

    for detail in all_details:
        bucket = stats[detail.outbound_order_id]
        _accumulate_progress(bucket, detail)
        vehicle, _, _ = _detail_dimensions(detail)
        all_vehicles[detail.outbound_order_id].add(vehicle)
        if is_detail_pending(detail.status):
            pending_vehicles[detail.outbound_order_id].add(vehicle)

    rows: list[dict[str, Any]] = []
    for order in orders:
        agg = stats.get(order.id, _new_progress_bucket())
        progress = _progress_row_fields(agg)
        rows.append(
            {
                "id": order.id,
                "order_code": order.order_code,
                "status": order.status,
                "created_at": order.created_at,
                "open_detail_count": progress["pending_detail_count"],
                "open_line_quantity": progress["pending_quantity"],
                "vehicle_count": len(pending_vehicles.get(order.id, set())),
                **progress,
                "total_vehicle_count": len(all_vehicles.get(order.id, set())),
            }
        )
    return rows, total


def list_operator_board_vehicles(
    db: Session,
    order_id: int,
) -> list[dict[str, Any]]:
    _get_order_or_raise(db, order_id)
    details = _all_details_for_order(db, order_id)

    buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            **_new_progress_bucket(),
            "customer_names": set(),
            "pending_customer_names": set(),
        }
    )
    for detail in details:
        vehicle, customer, _ = _detail_dimensions(detail)
        bucket = buckets[vehicle]
        _accumulate_progress(bucket, detail)
        bucket["customer_names"].add(customer)
        if is_detail_pending(detail.status):
            bucket["pending_customer_names"].add(customer)

    rows: list[dict[str, Any]] = []
    for vehicle_number in sorted(buckets.keys()):
        bucket = buckets[vehicle_number]
        progress = _progress_row_fields(bucket)
        rows.append(
            {
                "vehicle_number": vehicle_number,
                "customer_count": len(bucket["customer_names"]),
                "pending_customer_count": len(bucket["pending_customer_names"]),
                "statuses": sorted(bucket["statuses"]),
                **progress,
            }
        )
    return rows


def list_operator_board_customers(
    db: Session,
    order_id: int,
    vehicle_number: str,
) -> list[dict[str, Any]]:
    _get_order_or_raise(db, order_id)
    details = _all_details_for_order(db, order_id)

    buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            **_new_progress_bucket(),
            "trips": set(),
            "pending_trips": set(),
        }
    )
    for detail in details:
        vehicle, customer, trip = _detail_dimensions(detail)
        if vehicle != vehicle_number:
            continue
        bucket = buckets[customer]
        _accumulate_progress(bucket, detail)
        bucket["trips"].add(trip)
        if is_detail_pending(detail.status):
            bucket["pending_trips"].add(trip)

    rows: list[dict[str, Any]] = []
    for customer_name in sorted(buckets.keys()):
        bucket = buckets[customer_name]
        progress = _progress_row_fields(bucket)
        rows.append(
            {
                "customer_name": customer_name,
                "trip_count": len(bucket["trips"]),
                "pending_trip_count": len(bucket["pending_trips"]),
                **progress,
            }
        )
    return rows


def list_operator_board_trips(
    db: Session,
    order_id: int,
    vehicle_number: str,
    customer_name: str,
) -> list[dict[str, Any]]:
    _get_order_or_raise(db, order_id)
    details = _all_details_for_order(db, order_id)

    buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {**_new_progress_bucket(), "nvts": set()}
    )
    for detail in details:
        vehicle, customer, trip = _detail_dimensions(detail)
        if vehicle != vehicle_number or customer != customer_name:
            continue
        meta = _detail_meta(detail)
        bucket = buckets[trip]
        _accumulate_progress(bucket, detail)
        nvt = _meta_str(meta, "nvt", default="")
        if nvt:
            bucket["nvts"].add(nvt)

    rows: list[dict[str, Any]] = []
    for trip in sorted(buckets.keys(), key=lambda t: (t == "", t)):
        bucket = buckets[trip]
        progress = _progress_row_fields(bucket)
        rows.append(
            {
                "trip": trip,
                "nvts": sorted(bucket["nvts"]),
                **progress,
            }
        )
    return rows


def list_operator_board_lines(
    db: Session,
    order_id: int,
    vehicle_number: str,
    customer_name: str,
    trip: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    _get_order_or_raise(db, order_id)
    details = _all_details_for_order(db, order_id)

    bucket = _new_progress_bucket()
    lines: list[dict[str, Any]] = []
    for detail in details:
        vehicle, customer, detail_trip = _detail_dimensions(detail)
        if (
            vehicle != vehicle_number
            or customer != customer_name
            or detail_trip != trip
        ):
            continue
        _accumulate_progress(bucket, detail)
        if is_detail_pending(detail.status):
            lines.append(detail_to_board_line(detail))

    summary = _progress_row_fields(bucket)
    return lines, summary
