"""Top 5 products by inbound, outbound, and current stock."""

from datetime import date, timedelta
from typing import Literal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.warehouse.dashboard.dashboard_schema import (
    ReportTopProductsResponse,
    TopProductRow,
)
from app.modules.warehouse.dashboard.dashboard_snapshot_service import (
    _storage_stock_filters,
    vn_today,
)
from app.modules.warehouse.inbound_order.inbound_order_model import (
    InboundOrder,
    InboundOrderAllocation,
    InboundOrderDetail,
)
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrder,
    OutboundOrderDetail,
)
from app.modules.warehouse.warehouse_zone.warehouse_model import Zone
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists

VN_TIMEZONE = "Asia/Ho_Chi_Minh"
TOP_LIMIT = 5


def _period_start(period: Literal["week", "month"], today: date) -> date:
    if period == "week":
        return today - timedelta(days=6)
    return today - timedelta(days=29)


def _created_on_or_after(column, start_date: date):
    day_expr = func.date(func.timezone(VN_TIMEZONE, column))
    return day_expr >= start_date


def _item_display_label(sku: str | None, name: str | None, item_id: int) -> str:
    label = (sku or "").strip() or (name or "").strip()
    return label or str(item_id)


def _rows_to_top_product(rows) -> list[TopProductRow]:
    return [
        TopProductRow(
            item_id=int(row.item_id),
            label=_item_display_label(row.sku, row.name, int(row.item_id)),
            total_quantity=int(row.total_qty or 0),
        )
        for row in rows
    ]


def _top_inbound(db: Session, *, warehouse_id: int, start_date: date) -> list[TopProductRow]:
    total_qty = func.sum(InboundOrderAllocation.quantity).label("total_qty")
    rows = (
        db.query(
            Item.id.label("item_id"),
            Item.sku,
            Item.name,
            total_qty,
        )
        .select_from(InboundOrderAllocation)
        .join(
            InboundOrderDetail,
            InboundOrderDetail.id == InboundOrderAllocation.inbound_order_detail_id,
        )
        .join(
            InboundOrder,
            InboundOrder.id == InboundOrderDetail.inbound_order_id,
        )
        .join(ItemStock, ItemStock.id == InboundOrderAllocation.item_stock_id)
        .join(Item, Item.id == ItemStock.item_id)
        .filter(
            InboundOrder.warehouse_id == warehouse_id,
            _created_on_or_after(InboundOrderAllocation.created_at, start_date),
        )
        .group_by(Item.id, Item.sku, Item.name)
        .order_by(total_qty.desc())
        .limit(TOP_LIMIT)
        .all()
    )
    return _rows_to_top_product(rows)


def _top_outbound(db: Session, *, warehouse_id: int, start_date: date) -> list[TopProductRow]:
    total_qty = func.sum(OutboundOrderDetail.quantity).label("total_qty")
    rows = (
        db.query(
            Item.id.label("item_id"),
            Item.sku,
            Item.name,
            total_qty,
        )
        .select_from(OutboundOrderDetail)
        .join(
            OutboundOrder,
            OutboundOrder.id == OutboundOrderDetail.outbound_order_id,
        )
        .join(Item, Item.id == OutboundOrderDetail.item_id)
        .filter(
            OutboundOrder.warehouse_id == warehouse_id,
            _created_on_or_after(OutboundOrderDetail.created_at, start_date),
        )
        .group_by(Item.id, Item.sku, Item.name)
        .order_by(total_qty.desc())
        .limit(TOP_LIMIT)
        .all()
    )
    return _rows_to_top_product(rows)


def _top_stock(db: Session, *, warehouse_id: int) -> list[TopProductRow]:
    total_qty = func.sum(ItemStock.quantity).label("total_qty")
    rows = (
        db.query(
            Item.id.label("item_id"),
            Item.sku,
            Item.name,
            total_qty,
        )
        .join(ItemStock, ItemStock.item_id == Item.id)
        .join(Location, Location.id == ItemStock.location_id)
        .join(Zone, Zone.id == Location.zone_id)
        .filter(*_storage_stock_filters(warehouse_id))
        .group_by(Item.id, Item.sku, Item.name)
        .order_by(total_qty.desc())
        .limit(TOP_LIMIT)
        .all()
    )
    return _rows_to_top_product(rows)


def get_report_top_products(
    db: Session,
    *,
    warehouse_id: int,
    period: Literal["week", "month"],
) -> ReportTopProductsResponse:
    _ensure_warehouse_exists(db, warehouse_id)
    start_date = _period_start(period, vn_today())
    return ReportTopProductsResponse(
        period=period,
        inbound_top=_top_inbound(db, warehouse_id=warehouse_id, start_date=start_date),
        outbound_top=_top_outbound(db, warehouse_id=warehouse_id, start_date=start_date),
        stock_top=_top_stock(db, warehouse_id=warehouse_id),
    )
