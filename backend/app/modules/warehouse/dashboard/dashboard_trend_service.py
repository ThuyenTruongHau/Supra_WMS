"""Report trends for the current week, month, quarter or year through today."""

from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.warehouse.dashboard.dashboard_model import InventoryDailySnapshot
from app.modules.warehouse.dashboard.dashboard_trend_periods import (
    TrendGranularity,
    build_trend_periods,
)
from app.modules.warehouse.dashboard.dashboard_schema import (
    ReportTrendPoint,
    ReportTrendResponse,
)
from app.modules.warehouse.dashboard.dashboard_snapshot_service import vn_today
from app.modules.warehouse.inbound_order.inbound_order_model import (
    InboundOrder,
    InboundOrderAllocation,
    InboundOrderDetail,
)
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrder,
    OutboundOrderDetail,
)
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists

VN_TIMEZONE = "Asia/Ho_Chi_Minh"


def _order_local_date(column):
    return func.date(func.timezone(VN_TIMEZONE, column))


def _sum_inbound_quantity_by_day(
    db: Session,
    *,
    warehouse_id: int,
    range_start: date,
    range_end: date,
) -> dict[date, int]:
    day_expr = _order_local_date(InboundOrder.created_at)
    rows = (
        db.query(
            day_expr.label("day"),
            func.coalesce(func.sum(InboundOrderAllocation.quantity), 0),
        )
        .select_from(InboundOrder)
        .join(
            InboundOrderDetail,
            InboundOrderDetail.inbound_order_id == InboundOrder.id,
        )
        .join(
            InboundOrderAllocation,
            InboundOrderAllocation.inbound_order_detail_id == InboundOrderDetail.id,
        )
        .filter(
            InboundOrder.warehouse_id == warehouse_id,
            day_expr >= range_start,
            day_expr <= range_end,
        )
        .group_by(day_expr)
        .all()
    )
    return {row[0]: int(row[1]) for row in rows}


def _sum_outbound_quantity_by_day(
    db: Session,
    *,
    warehouse_id: int,
    range_start: date,
    range_end: date,
) -> dict[date, int]:
    day_expr = _order_local_date(OutboundOrder.created_at)
    rows = (
        db.query(
            day_expr.label("day"),
            func.coalesce(func.sum(OutboundOrderDetail.quantity), 0),
        )
        .select_from(OutboundOrder)
        .join(
            OutboundOrderDetail,
            OutboundOrderDetail.outbound_order_id == OutboundOrder.id,
        )
        .filter(
            OutboundOrder.warehouse_id == warehouse_id,
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
        .order_by(InventoryDailySnapshot.snapshot_date)
        .all()
    )
    return {
        row[0]: (Decimal(str(row[1])), Decimal(str(row[2])))
        for row in rows
    }


def build_daily_inventory_from_snapshots(
    *,
    range_start: date,
    range_end: date,
    today: date,
    snapshot_map: dict[date, tuple[Decimal, Decimal]],
) -> dict[date, tuple[Decimal, Decimal]]:
    """
    Tồn cuối ngày: chỉ từ inventory_daily_snapshot (Celery 23:00).
    Ngày không có bản ghi → (0, 0).
    """
    last_day = min(range_end, today)
    if range_start > last_day:
        return {}

    zero = (Decimal("0"), Decimal("0"))
    series: dict[date, tuple[Decimal, Decimal]] = {}
    cursor = range_start
    while cursor <= last_day:
        series[cursor] = snapshot_map.get(cursor, zero)
        cursor += timedelta(days=1)
    return series


def _closing_inventory_for_period(
    *,
    period_end: date,
    daily_series: dict[date, tuple[Decimal, Decimal]],
) -> tuple[Decimal, Decimal]:
    return daily_series.get(period_end, (Decimal("0"), Decimal("0")))


def _sum_quantities_in_range(
    day_totals: dict[date, int],
    period_start: date,
    period_end: date,
) -> int:
    total = 0
    cursor = period_start
    while cursor <= period_end:
        total += day_totals.get(cursor, 0)
        cursor += timedelta(days=1)
    return total


def get_report_trends(
    db: Session,
    *,
    warehouse_id: int,
    granularity: TrendGranularity,
) -> ReportTrendResponse:
    _ensure_warehouse_exists(db, warehouse_id)
    today = vn_today()

    periods = build_trend_periods(today, granularity)

    range_start = periods[0][0]
    range_end = periods[-1][1]

    inbound_by_day = _sum_inbound_quantity_by_day(
        db,
        warehouse_id=warehouse_id,
        range_start=range_start,
        range_end=range_end,
    )
    outbound_by_day = _sum_outbound_quantity_by_day(
        db,
        warehouse_id=warehouse_id,
        range_start=range_start,
        range_end=range_end,
    )
    snapshot_map = _load_snapshot_map(
        db,
        warehouse_id=warehouse_id,
        range_start=range_start,
        range_end=range_end,
    )

    daily_inventory = build_daily_inventory_from_snapshots(
        range_start=range_start,
        range_end=range_end,
        today=today,
        snapshot_map=snapshot_map,
    )

    points: list[ReportTrendPoint] = []
    for period_start, period_end, label in periods:
        lookup_day = period_start if granularity in ("week", "month") else period_end
        inv_qty, inv_value = _closing_inventory_for_period(
            period_end=lookup_day,
            daily_series=daily_inventory,
        )

        points.append(
            ReportTrendPoint(
                label=label,
                period_start=period_start,
                period_end=period_end,
                inbound_quantity=_sum_quantities_in_range(
                    inbound_by_day, period_start, period_end
                ),
                outbound_quantity=_sum_quantities_in_range(
                    outbound_by_day, period_start, period_end
                ),
                inventory_quantity=inv_qty,
                inventory_value=inv_value,
            )
        )

    return ReportTrendResponse(granularity=granularity, points=points)
