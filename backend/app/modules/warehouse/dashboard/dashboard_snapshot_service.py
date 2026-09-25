"""Daily inventory snapshots for dashboard trends (isolated from item_service)."""

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import Numeric, cast, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.warehouse.dashboard.dashboard_model import InventoryDailySnapshot
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.item_stock.item_stock_model import (
    ItemStock,
    countable_stock_level_criterion,
    positive_stock_quantity_criterion,
)
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse, Zone

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def vn_today() -> date:
    return datetime.now(VN_TZ).date()


def _storage_stock_filters(warehouse_id: int):
    return (
        Item.warehouse_id == warehouse_id,
        Item.is_active.is_(True),
        ItemStock.is_active.is_(True),
        countable_stock_level_criterion(),
        positive_stock_quantity_criterion(),
        Location.is_active.is_(True),
        Zone.code.in_(settings.zone_storage),
    )


def compute_live_total_quantity(db: Session, warehouse_id: int) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(ItemStock.quantity), 0))
        .join(Item, Item.id == ItemStock.item_id)
        .join(Location, Location.id == ItemStock.location_id)
        .join(Zone, Zone.id == Location.zone_id)
        .filter(*_storage_stock_filters(warehouse_id))
        .scalar()
    )
    if total is None:
        return Decimal("0")
    return Decimal(str(total))


def compute_live_total_inventory_value(db: Session, warehouse_id: int) -> Decimal:
    price_text = func.nullif(Item.details.op("->>")("price"), "")
    price_expr = cast(
        func.nullif(func.replace(price_text, ",", ""), ""),
        Numeric(18, 2),
    )
    total = (
        db.query(
            func.coalesce(
                func.sum(ItemStock.quantity * func.coalesce(price_expr, 0)),
                0,
            )
        )
        .join(Item, Item.id == ItemStock.item_id)
        .join(Location, Location.id == ItemStock.location_id)
        .join(Zone, Zone.id == Location.zone_id)
        .filter(*_storage_stock_filters(warehouse_id))
        .scalar()
    )
    if total is None:
        return Decimal("0")
    return Decimal(str(total))


def upsert_daily_snapshot(
    db: Session,
    *,
    warehouse_id: int,
    snapshot_date: date,
    total_quantity: Decimal,
    total_inventory_value: Decimal,
) -> InventoryDailySnapshot:
    existing = (
        db.query(InventoryDailySnapshot)
        .filter(
            InventoryDailySnapshot.warehouse_id == warehouse_id,
            InventoryDailySnapshot.snapshot_date == snapshot_date,
        )
        .first()
    )
    if existing:
        existing.total_quantity = total_quantity
        existing.total_inventory_value = total_inventory_value
        db.commit()
        db.refresh(existing)
        return existing

    row = InventoryDailySnapshot(
        warehouse_id=warehouse_id,
        snapshot_date=snapshot_date,
        total_quantity=total_quantity,
        total_inventory_value=total_inventory_value,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def run_daily_snapshots_for_all_warehouses(db: Session) -> dict:
    snapshot_date = vn_today()
    warehouse_ids = [row[0] for row in db.query(Warehouse.id).all()]
    upserted = 0
    for warehouse_id in warehouse_ids:
        qty = compute_live_total_quantity(db, warehouse_id)
        value = compute_live_total_inventory_value(db, warehouse_id)
        upsert_daily_snapshot(
            db,
            warehouse_id=warehouse_id,
            snapshot_date=snapshot_date,
            total_quantity=qty,
            total_inventory_value=value,
        )
        upserted += 1
    return {"snapshot_date": snapshot_date.isoformat(), "warehouses": upserted}
