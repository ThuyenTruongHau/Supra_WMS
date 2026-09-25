"""Report trend aggregation (12 days / 12 weeks)."""

from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.warehouse.dashboard.dashboard_model import InventoryDailySnapshot
from app.modules.warehouse.dashboard.dashboard_schema import (
    ReportTrendPoint,
    ReportTrendResponse,
)
from app.modules.warehouse.dashboard.dashboard_snapshot_service import (
    compute_live_total_inventory_value,
    compute_live_total_quantity,
    vn_today,
)
from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrder
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrder
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists

VN_TIMEZONE = "Asia/Ho_Chi_Minh"


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _last_12_day_periods(today: date) -> list[tuple[date, date, str]]:
    periods: list[tuple[date, date, str]] = []
    for offset in range(11, -1, -1):
        d = today - timedelta(days=offset)
        periods.append((d, d, d.strftime("%d/%m")))
    return periods


def _last_12_week_periods(today: date) -> list[tuple[date, date, str]]:
    current_week_start = _week_start(today)
    periods: list[tuple[date, date, str]] = []
    for weeks_ago in range(11, -1, -1):
        start = current_week_start - timedelta(weeks=weeks_ago)
        end = today if weeks_ago == 0 else start + timedelta(days=6)
        periods.append((start, end, f"Tuần {start.strftime('%d/%m')}"))
    return periods


def _order_local_date(column):
    return func.date(func.timezone(VN_TIMEZONE, column))


def _count_orders_by_day(
    db: Session,
    *,
    warehouse_id: int,
    model,
    range_start: date,
    range_end: date,
) -> dict[date, int]:
    day_expr = _order_local_date(model.created_at)
    rows = (
        db.query(day_expr.label("day"), func.count(model.id))
        .filter(
            model.warehouse_id == warehouse_id,
            day_expr >= range_start,
            day_expr <= range_end,
        )
        .group_by(day_expr)
        .all()
    )
    return {row[0]: int(row[1]) for row in rows}


def _load_snapshot_map(
    db: Session,
    *,
    warehouse_id: int,
    range_start: date,
    range_end: date,
) -> dict[date, tuple[Decimal, Decimal]]:
    rows = (
        db.query(
            InventoryDailySnapshot.snapshot_date,
            InventoryDailySnapshot.total_quantity,
            InventoryDailySnapshot.total_inventory_value,
        )
        .filter(
            InventoryDailySnapshot.warehouse_id == warehouse_id,
            InventoryDailySnapshot.snapshot_date >= range_start,
            InventoryDailySnapshot.snapshot_date <= range_end,
        )
        .all()
    )
    return {
        row[0]: (Decimal(str(row[1])), Decimal(str(row[2])))
        for row in rows
    }


def _daily_inventory_totals(
    db: Session,
    *,
    warehouse_id: int,
    day: date,
    today: date,
    snapshot_map: dict[date, tuple[Decimal, Decimal]],
) -> tuple[Decimal, Decimal]:
    if day in snapshot_map:
        return snapshot_map[day]
    if day == today:
        return (
            compute_live_total_quantity(db, warehouse_id),
            compute_live_total_inventory_value(db, warehouse_id),
        )
    return Decimal("0"), Decimal("0")


def _sum_inventory_for_range(
    db: Session,
    *,
    warehouse_id: int,
    period_start: date,
    period_end: date,
    today: date,
    snapshot_map: dict[date, tuple[Decimal, Decimal]],
) -> tuple[Decimal, Decimal]:
    qty_sum = Decimal("0")
    value_sum = Decimal("0")
    cursor = period_start
    while cursor <= period_end:
        qty, value = _daily_inventory_totals(
            db,
            warehouse_id=warehouse_id,
            day=cursor,
            today=today,
            snapshot_map=snapshot_map,
        )
        qty_sum += qty
        value_sum += value
        cursor += timedelta(days=1)
    return qty_sum, value_sum


def _count_orders_in_range(
    day_counts: dict[date, int],
    period_start: date,
    period_end: date,
) -> int:
    total = 0
    cursor = period_start
    while cursor <= period_end:
        total += day_counts.get(cursor, 0)
        cursor += timedelta(days=1)
    return total


def get_report_trends(
    db: Session,
    *,
    warehouse_id: int,
    granularity: Literal["day", "week"],
) -> ReportTrendResponse:
    _ensure_warehouse_exists(db, warehouse_id)
    today = vn_today()

    if granularity == "day":
        periods = _last_12_day_periods(today)
    else:
        periods = _last_12_week_periods(today)

    range_start = periods[0][0]
    range_end = periods[-1][1]

    inbound_by_day = _count_orders_by_day(
        db,
        warehouse_id=warehouse_id,
        model=InboundOrder,
        range_start=range_start,
        range_end=range_end,
    )
    outbound_by_day = _count_orders_by_day(
        db,
        warehouse_id=warehouse_id,
        model=OutboundOrder,
        range_start=range_start,
        range_end=range_end,
    )
    snapshot_map = _load_snapshot_map(
        db,
        warehouse_id=warehouse_id,
        range_start=range_start,
        range_end=range_end,
    )

    points: list[ReportTrendPoint] = []
    for period_start, period_end, label in periods:
        if granularity == "day":
            inv_qty, inv_value = _daily_inventory_totals(
                db,
                warehouse_id=warehouse_id,
                day=period_start,
                today=today,
                snapshot_map=snapshot_map,
            )
        else:
            inv_qty, inv_value = _sum_inventory_for_range(
                db,
                warehouse_id=warehouse_id,
                period_start=period_start,
                period_end=period_end,
                today=today,
                snapshot_map=snapshot_map,
            )

        points.append(
            ReportTrendPoint(
                label=label,
                period_start=period_start,
                period_end=period_end,
                inbound_orders=_count_orders_in_range(
                    inbound_by_day, period_start, period_end
                ),
                outbound_orders=_count_orders_in_range(
                    outbound_by_day, period_start, period_end
                ),
                inventory_quantity=inv_qty,
                inventory_value=inv_value,
            )
        )

    return ReportTrendResponse(granularity=granularity, points=points)
