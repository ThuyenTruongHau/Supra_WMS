"""Report stock aging: holding time buckets, bucket detail, longest holding top 8."""

from decimal import Decimal

from sqlalchemy import Integer, and_, case, func, literal
from sqlalchemy.orm import Session

from app.modules.warehouse.dashboard.dashboard_schema import (
    ReportStockAgingBucketResponse,
    ReportStockAgingOverviewResponse,
    StockAgingBucketKey,
    StockAgingBucketSummary,
    StockAgingRow,
)
from app.modules.warehouse.dashboard.dashboard_snapshot_service import vn_today
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.item_stock.item_stock_model import (
    ItemStock,
    countable_stock_level_criterion,
    positive_stock_quantity_criterion,
)
from app.modules.warehouse.lot_number_utils import format_lot_number_display
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists

VN_TIMEZONE = "Asia/Ho_Chi_Minh"
BUCKET_KEYS: tuple[StockAgingBucketKey, ...] = (
    "lte_90", "days_91_180", "days_181_360", "gt_360",
)
BUCKET_LABELS: dict[StockAgingBucketKey, str] = {
    "lte_90": "0–90 ngày",
    "days_91_180": "91–180 ngày",
    "days_181_360": "181–360 ngày",
    "gt_360": "Trên 360 ngày",
}
LONGEST_LIMIT = 8
BUCKET_ITEMS_LIMIT = 500


def _holding_days_expr(today=None):
    ref = today if today is not None else vn_today()
    return func.cast(
        literal(ref) - func.date(func.timezone(VN_TIMEZONE, ItemStock.created_at)),
        Integer,
    )


def _bucket_key_expr(holding_days):
    return case(
        (holding_days <= 90, literal("lte_90")),
        (holding_days <= 180, literal("days_91_180")),
        (holding_days <= 360, literal("days_181_360")),
        else_=literal("gt_360"),
    )


def _base_filters(warehouse_id: int):
    return (
        Item.warehouse_id == warehouse_id,
        Item.is_active.is_(True),
        ItemStock.is_active.is_(True),
        ItemStock.status.in_(("available", "split")),
        positive_stock_quantity_criterion(),
        countable_stock_level_criterion(),
    )


def _sku_label(item: Item) -> str:
    label = (item.sku or "").strip() or (item.name or "").strip()
    return label or str(item.id)


def _to_row(stock: ItemStock, item: Item, holding_days: int) -> StockAgingRow:
    qty = stock.quantity
    if not isinstance(qty, Decimal):
        qty = Decimal(str(qty))
    return StockAgingRow(
        item_stock_id=stock.id,
        sku=_sku_label(item),
        quantity=qty,
        lot=format_lot_number_display(stock.lot_number_from, stock.lot_number_to),
        created_at=stock.created_at,
        holding_days=int(holding_days),
    )


def _summaries_from_totals(totals: dict[StockAgingBucketKey, Decimal]) -> list[StockAgingBucketSummary]:
    grand = sum(totals.values(), Decimal("0"))
    buckets: list[StockAgingBucketSummary] = []
    for key in BUCKET_KEYS:
        qty = totals.get(key, Decimal("0"))
        percent = float((qty / grand * 100) if grand > 0 else Decimal("0"))
        buckets.append(
            StockAgingBucketSummary(
                key=key,
                label=BUCKET_LABELS[key],
                total_quantity=qty,
                percent=round(percent, 2),
            )
        )
    return buckets


def get_report_stock_aging_overview(
    db: Session,
    *,
    warehouse_id: int,
) -> ReportStockAgingOverviewResponse:
    _ensure_warehouse_exists(db, warehouse_id)
    today = vn_today()
    holding_days = _holding_days_expr(today)
    bucket_key = _bucket_key_expr(holding_days)

    agg_rows = (
        db.query(
            bucket_key.label("bucket"),
            func.coalesce(func.sum(ItemStock.quantity), 0).label("total_qty"),
        )
        .join(Item, Item.id == ItemStock.item_id)
        .filter(*_base_filters(warehouse_id))
        .group_by(bucket_key)
        .all()
    )
    totals: dict[StockAgingBucketKey, Decimal] = {k: Decimal("0") for k in BUCKET_KEYS}
    for row in agg_rows:
        key = row.bucket
        if key in totals:
            totals[key] = Decimal(str(row.total_qty))

    longest_rows = (
        db.query(ItemStock, Item, holding_days.label("holding_days"))
        .join(Item, Item.id == ItemStock.item_id)
        .filter(*_base_filters(warehouse_id))
        .order_by(
            holding_days.desc(),
            ItemStock.quantity.desc(),
            ItemStock.id.desc(),
        )
        .limit(LONGEST_LIMIT)
        .all()
    )
    longest_holding = [
        _to_row(stock, item, int(hd)) for stock, item, hd in longest_rows
    ]

    return ReportStockAgingOverviewResponse(
        buckets=_summaries_from_totals(totals),
        longest_holding=longest_holding,
    )


def _bucket_holding_filter(
    bucket: StockAgingBucketKey,
    holding_days,
):
    if bucket == "lte_90":
        return holding_days <= 90
    if bucket == "days_91_180":
        return and_(holding_days >= 91, holding_days <= 180)
    if bucket == "days_181_360":
        return and_(holding_days >= 181, holding_days <= 360)
    if bucket == "gt_360":
        return holding_days > 360
    raise ValueError(f"Unsupported stock aging bucket: {bucket}")


def get_report_stock_aging_bucket(
    db: Session,
    *,
    warehouse_id: int,
    bucket: StockAgingBucketKey,
) -> ReportStockAgingBucketResponse:
    _ensure_warehouse_exists(db, warehouse_id)
    holding_days = _holding_days_expr()

    rows = (
        db.query(ItemStock, Item, holding_days.label("holding_days"))
        .join(Item, Item.id == ItemStock.item_id)
        .filter(
            *_base_filters(warehouse_id),
            _bucket_holding_filter(bucket, holding_days),
        )
        .order_by(
            holding_days.desc(),
            ItemStock.quantity.desc(),
            ItemStock.id.desc(),
        )
        .limit(BUCKET_ITEMS_LIMIT)
        .all()
    )
    items = [_to_row(stock, item, int(hd)) for stock, item, hd in rows]
    return ReportStockAgingBucketResponse(bucket=bucket, items=items)
