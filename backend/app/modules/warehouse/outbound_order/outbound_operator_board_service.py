from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, load_only, noload

from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.outbound_order import outbound_order_service
from app.modules.warehouse.lot_number_utils import format_lot_value_for_display
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrder,
    OutboundOrderDetail,
    _outbound_detail_status_expr,
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


def sample_vehicle_from_set(vehicles: set[str]) -> tuple[Optional[str], bool]:
    """First plate for list UI; True when more than one distinct plate."""
    if not vehicles:
        return None, False
    ordered = sorted(v for v in vehicles if v != VEHICLE_SENTINEL)
    if ordered:
        return ordered[0], len(ordered) > 1
    if VEHICLE_SENTINEL in vehicles:
        return VEHICLE_SENTINEL, False
    return None, False


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
    return _detail_dimensions_from_meta(_detail_meta(detail))


def _detail_dimensions_from_meta(meta: dict[str, Any]) -> tuple[str, str, str]:
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
        "all_detail_statuses": set(),
    }


def _accumulate_progress_values(
    bucket: dict[str, Any],
    *,
    quantity: int,
    detail_status: str,
) -> None:
    bucket["total_detail_count"] += 1
    bucket["total_quantity"] += quantity
    bucket["all_detail_statuses"].add(detail_status)
    if is_detail_done(detail_status):
        bucket["done_detail_count"] += 1
    else:
        bucket["pending_detail_count"] += 1
        bucket["pending_quantity"] += quantity
        bucket["statuses"].add(detail_status)


def _accumulate_progress(bucket: dict[str, Any], detail: OutboundOrderDetail) -> None:
    _accumulate_progress_values(
        bucket,
        quantity=int(detail.quantity or 0),
        detail_status=detail.status,
    )


def _derive_order_list_status(bucket: dict[str, Any]) -> str:
    """Trạng thái đơn từ aggregate detail — tránh column_property order.status (N+1 subquery)."""
    total = bucket["total_detail_count"]
    if total <= 0:
        return "initialize"
    done = bucket["done_detail_count"]
    pending = bucket["pending_detail_count"]
    all_st = bucket.get("all_detail_statuses") or set()
    if pending == 0 and done == total:
        return "completed"
    if "in_progress" in all_st or 0 < done < total:
        return "in_progress"
    if all_st == {"reserved"}:
        return "reserved"
    if pending == total:
        return "initialize"
    return "in_progress"


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


def _board_line_payload(
    *,
    detail_id: int,
    item_id: int,
    quantity: int,
    unit: str,
    detail_status: str,
    meta: dict[str, Any],
    item_sku: str | None = None,
) -> dict[str, Any]:
    sku = meta.get("sku")
    if (sku is None or str(sku).strip() == "") and item_sku:
        sku = item_sku
    raw_lot = meta.get("lot_number")
    lot_display = None
    if raw_lot is not None and str(raw_lot).strip() != "":
        lot_display = format_lot_value_for_display(str(raw_lot).strip())
    return {
        "detail_id": detail_id,
        "item_id": item_id,
        "sku": sku,
        "quantity": quantity,
        "unit": unit,
        "status": detail_status,
        "vehicle_no": normalize_vehicle(meta),
        "customer_name": normalize_customer(meta),
        "trip": normalize_trip(meta),
        "lot_number": lot_display,
        "pallet_count": meta.get("pallet_count"),
    }


def detail_to_board_line(
    detail: OutboundOrderDetail,
    *,
    item_sku: str | None = None,
) -> dict[str, Any]:
    meta = _detail_meta(detail)
    item = detail.item
    sku = meta.get("sku")
    if (sku is None or str(sku).strip() == "") and item is not None:
        item_sku = item_sku or item.sku
    return _board_line_payload(
        detail_id=detail.id,
        item_id=detail.item_id,
        quantity=detail.quantity,
        unit=detail.unit,
        detail_status=detail.status,
        meta=meta,
        item_sku=item_sku,
    )


def _board_detail_status_expr_labeled():
    return _outbound_detail_status_expr(
        OutboundOrderDetail.id,
        OutboundOrderDetail.quantity,
    ).label("detail_status")


def _fetch_board_detail_rows(
    db: Session,
    order_id: int,
    *,
    with_item_sku: bool = False,
) -> list[Any]:
    status_expr = _board_detail_status_expr_labeled()
    cols: list[Any] = [
        OutboundOrderDetail.id,
        OutboundOrderDetail.item_id,
        OutboundOrderDetail.quantity,
        OutboundOrderDetail.unit,
        OutboundOrderDetail.details,
        status_expr,
    ]
    stmt = (
        select(*cols)
        .where(OutboundOrderDetail.outbound_order_id == order_id)
        .order_by(OutboundOrderDetail.id)
    )
    if with_item_sku:
        stmt = stmt.add_columns(Item.sku).join(
            Item,
            OutboundOrderDetail.item_id == Item.id,
        )
    return list(db.execute(stmt).all())


def _aggregate_board_stats_for_orders(
    db: Session,
    order_ids: list[int],
) -> tuple[
    dict[int, dict[str, Any]],
    dict[int, set[str]],
    dict[int, set[str]],
]:
    """Một SELECT nhẹ (id, qty, details, status) — không hydrate ORM / allocations."""
    if not order_ids:
        return {}, {}, {}

    status_expr = _board_detail_status_expr_labeled()
    detail_rows = db.execute(
        select(
            OutboundOrderDetail.outbound_order_id,
            OutboundOrderDetail.quantity,
            OutboundOrderDetail.details,
            status_expr,
        ).where(OutboundOrderDetail.outbound_order_id.in_(order_ids)),
    ).all()

    stats: dict[int, dict[str, Any]] = defaultdict(_new_progress_bucket)
    pending_vehicles: dict[int, set[str]] = defaultdict(set)
    all_vehicles: dict[int, set[str]] = defaultdict(set)

    for order_id, quantity, details_json, detail_status in detail_rows:
        bucket = stats[order_id]
        qty = int(quantity or 0)
        bucket["total_detail_count"] += 1
        bucket["total_quantity"] += qty
        bucket["all_detail_statuses"].add(detail_status)
        if is_detail_done(detail_status):
            bucket["done_detail_count"] += 1
        else:
            bucket["pending_detail_count"] += 1
            bucket["pending_quantity"] += qty
            bucket["statuses"].add(detail_status)

        meta = details_json if isinstance(details_json, dict) else {}
        vehicle = normalize_vehicle(meta)
        all_vehicles[order_id].add(vehicle)
        if is_detail_pending(detail_status):
            pending_vehicles[order_id].add(vehicle)

    return stats, pending_vehicles, all_vehicles


def list_operator_board_orders(
    db: Session,
    *,
    warehouse_id: int,
    page: int = 1,
    page_size: int = 20,
    q: Optional[str] = None,
    created_from: Optional[datetime] = None,
    created_to: Optional[datetime] = None,
    item_id: Optional[int] = None,
) -> tuple[list[dict[str, Any]], int]:
    base = db.query(OutboundOrder).filter(
        OutboundOrder.warehouse_id == warehouse_id,
    )
    base = outbound_order_service.apply_outbound_list_filters(
        base,
        db,
        q=q,
        created_from=created_from,
        created_to=created_to,
        item_id=item_id,
    )

    total = base.count()
    orders = (
        base.order_by(OutboundOrder.created_at.desc())
        .options(
            load_only(
                OutboundOrder.id,
                OutboundOrder.order_code,
                OutboundOrder.created_at,
            ),
            noload(OutboundOrder.created_by),
            noload(OutboundOrder.warehouse),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    if not orders:
        return [], total

    order_ids = [o.id for o in orders]
    stats, pending_vehicles, all_vehicles = _aggregate_board_stats_for_orders(
        db,
        order_ids,
    )

    rows: list[dict[str, Any]] = []
    for order in orders:
        agg = stats.get(order.id, _new_progress_bucket())
        progress = _progress_row_fields(agg)
        pending_set = pending_vehicles.get(order.id, set())
        sample_vehicle_no, has_more_vehicles = sample_vehicle_from_set(pending_set)
        rows.append(
            {
                "id": order.id,
                "order_code": order.order_code,
                "status": _derive_order_list_status(agg),
                "created_at": order.created_at,
                "open_detail_count": progress["pending_detail_count"],
                "open_line_quantity": progress["pending_quantity"],
                "vehicle_count": len(pending_set),
                **progress,
                "total_vehicle_count": len(all_vehicles.get(order.id, set())),
                "sample_vehicle_no": sample_vehicle_no,
                "has_more_vehicles": has_more_vehicles,
            }
        )
    return rows, total


def list_operator_board_vehicles(
    db: Session,
    order_id: int,
) -> list[dict[str, Any]]:
    _get_order_or_raise(db, order_id)
    detail_rows = _fetch_board_detail_rows(db, order_id)

    buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            **_new_progress_bucket(),
            "customer_names": set(),
            "pending_customer_names": set(),
        }
    )
    for _id, _item_id, quantity, _unit, details_json, detail_status in detail_rows:
        meta = details_json if isinstance(details_json, dict) else {}
        vehicle, customer, _ = _detail_dimensions_from_meta(meta)
        bucket = buckets[vehicle]
        _accumulate_progress_values(
            bucket,
            quantity=int(quantity or 0),
            detail_status=detail_status,
        )
        bucket["customer_names"].add(customer)
        if is_detail_pending(detail_status):
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
    detail_rows = _fetch_board_detail_rows(db, order_id)

    buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            **_new_progress_bucket(),
            "trips": set(),
            "pending_trips": set(),
        }
    )
    for _id, _item_id, quantity, _unit, details_json, detail_status in detail_rows:
        meta = details_json if isinstance(details_json, dict) else {}
        vehicle, customer, trip = _detail_dimensions_from_meta(meta)
        if vehicle != vehicle_number:
            continue
        bucket = buckets[customer]
        _accumulate_progress_values(
            bucket,
            quantity=int(quantity or 0),
            detail_status=detail_status,
        )
        bucket["trips"].add(trip)
        if is_detail_pending(detail_status):
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
    detail_rows = _fetch_board_detail_rows(db, order_id)

    buckets: dict[str, dict[str, Any]] = defaultdict(
        lambda: {**_new_progress_bucket(), "nvts": set()}
    )
    for _id, _item_id, quantity, _unit, details_json, detail_status in detail_rows:
        meta = details_json if isinstance(details_json, dict) else {}
        vehicle, customer, trip = _detail_dimensions_from_meta(meta)
        if vehicle != vehicle_number or customer != customer_name:
            continue
        bucket = buckets[trip]
        _accumulate_progress_values(
            bucket,
            quantity=int(quantity or 0),
            detail_status=detail_status,
        )
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
    detail_rows = _fetch_board_detail_rows(db, order_id, with_item_sku=True)

    bucket = _new_progress_bucket()
    lines: list[dict[str, Any]] = []
    for (
        detail_id,
        item_id,
        quantity,
        unit,
        details_json,
        detail_status,
        item_sku,
    ) in detail_rows:
        meta = details_json if isinstance(details_json, dict) else {}
        vehicle, customer, detail_trip = _detail_dimensions_from_meta(meta)
        if (
            vehicle != vehicle_number
            or customer != customer_name
            or detail_trip != trip
        ):
            continue
        _accumulate_progress_values(
            bucket,
            quantity=int(quantity or 0),
            detail_status=detail_status,
        )
        lines.append(
            _board_line_payload(
                detail_id=detail_id,
                item_id=item_id,
                quantity=int(quantity or 0),
                unit=unit,
                detail_status=detail_status,
                meta=meta,
                item_sku=item_sku,
            )
        )

    summary = _progress_row_fields(bucket)
    return lines, summary
