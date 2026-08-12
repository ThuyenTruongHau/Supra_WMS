"""Item service."""

from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, cast, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.item.item_schema import (
    ItemAnalyzeResponse,
    ItemCreate,
    ItemDetailResponse,
    ItemListResponse,
    ItemResponse,
    ItemStockInDetail,
    ItemUpdate,
)
from app.modules.warehouse.unit.unit_model import Unit
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse, Zone
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.location_map.location_model import Location

NEARLY_OUTDATED_DAYS = 30

def _validate_quantity_bounds(min_quantity: int, max_quantity: int) -> None:
    if min_quantity > max_quantity:
        raise ValueError("min_quantity must be less than or equal to max_quantity")


def _item_query(db: Session, *, include_inactive: bool = False):
    q = db.query(Item)
    if not include_inactive:
        q = q.filter(Item.is_active.is_(True))
    return q


def _ensure_warehouse_exists(db: Session, warehouse_id: int) -> None:
    if not db.query(Warehouse).filter(Warehouse.id == warehouse_id).first():
        raise ValueError(f"Warehouse id not found: {warehouse_id}")


def _ensure_unit_exists(db: Session, unit_id: int) -> None:
    if not db.query(Unit).filter(Unit.id == unit_id).first():
        raise ValueError(f"Unit id not found: {unit_id}")


def list_items(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    warehouse_id: Optional[int] = None,
    q: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> ItemListResponse:
    # Default: only active. If is_active explicitly passed, filter by it.
    if is_active is None:
        query = _item_query(db, include_inactive=False)
    else:
        query = db.query(Item).filter(Item.is_active.is_(is_active))
    if warehouse_id is not None:
        query = query.filter(Item.warehouse_id == warehouse_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter((Item.sku.ilike(like)) | (Item.name.ilike(like)))
    total = query.count()
    items = (
        query.order_by(Item.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return ItemListResponse(
        items=[ItemResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def get_item_by_id(
    db: Session, item_id: int, *, include_inactive: bool = False
) -> Optional[Item]:
    return (
        _item_query(db, include_inactive=include_inactive)
        .filter(Item.id == item_id)
        .first()
    )


def analyze_items(db: Session, warehouse_id: int) -> ItemAnalyzeResponse:
    _ensure_warehouse_exists(db, warehouse_id)

    total_items = (
        db.query(func.count(Item.id))
        .filter(Item.warehouse_id == warehouse_id, Item.is_active.is_(True))
        .scalar()
        or 0
    )

    total_quantity = (
        db.query(func.coalesce(func.sum(ItemStock.quantity), 0))
        .join(Item, Item.id == ItemStock.item_id)
        .join(Location, Location.id == ItemStock.location_id)
        .join(Zone, Zone.id == Location.zone_id)
        .filter(
            Item.warehouse_id == warehouse_id,
            Item.is_active.is_(True),
            ItemStock.is_active.is_(True),
            Location.is_active.is_(True),
            Zone.code.in_(settings.zone_storage),
        )
        .scalar()
    )
    if total_quantity is None:
        total_quantity = Decimal("0")

    today = date.today()
    nearly_end = today + timedelta(days=NEARLY_OUTDATED_DAYS)
    total_nearly_outdated = (
        db.query(func.count(func.distinct(ItemStock.item_id)))
        .join(Item, Item.id == ItemStock.item_id)
        .join(Location, Location.id == ItemStock.location_id)
        .join(Zone, Zone.id == Location.zone_id)
        .filter(
            Item.warehouse_id == warehouse_id,
            Item.is_active.is_(True),
            ItemStock.is_active.is_(True),
            Location.is_active.is_(True),
            Zone.code.in_(settings.zone_storage),
            ItemStock.expiry_date.isnot(None),
            cast(ItemStock.expiry_date, Date) >= today,
            cast(ItemStock.expiry_date, Date) <= nearly_end,
        )
        .scalar()
        or 0
    )

    # Low stock: active items whose storage-zone stock qty < threshold
    stock_sum = (
        db.query(
            ItemStock.item_id.label("item_id"),
            func.coalesce(func.sum(ItemStock.quantity), 0).label("qty"),
        )
        .join(Location, Location.id == ItemStock.location_id)
        .join(Zone, Zone.id == Location.zone_id)
        .filter(
            ItemStock.is_active.is_(True),
            Location.warehouse_id == warehouse_id,
            Location.is_active.is_(True),
            Zone.code.in_(settings.zone_storage),
        )
        .group_by(ItemStock.item_id)
        .subquery()
    )
    total_low_stock = (
        db.query(func.count(Item.id))
        .outerjoin(stock_sum, stock_sum.c.item_id == Item.id)
        .filter(
            Item.warehouse_id == warehouse_id,
            Item.is_active.is_(True),
            func.coalesce(stock_sum.c.qty, 0) < Item.min_quantity,
        )
        .scalar()
        or 0
    )

    return ItemAnalyzeResponse(
        total_items=int(total_items),
        total_quantity=Decimal(str(total_quantity)),
        total_nearly_outdated=int(total_nearly_outdated),
        total_low_stock=int(total_low_stock),
    )


def get_item_detail(db: Session, item_id: int) -> ItemDetailResponse:
    item = get_item_by_id(db, item_id, include_inactive=True)
    if not item:
        raise ValueError("Item not found")

    stocks = (
        db.query(ItemStock, Location.location_code)
        .outerjoin(Location, Location.id == ItemStock.location_id)
        .filter(ItemStock.item_id == item.id, ItemStock.is_active.is_(True))
        .order_by(ItemStock.id)
        .all()
    )

    stock_items: list[ItemStockInDetail] = []
    for stock, location_code in stocks:
        stock_items.append(
            ItemStockInDetail(
                id=stock.id,
                item_id=stock.item_id,
                location_id=stock.location_id,
                location_code=location_code,
                lot_number=stock.lot_number,
                expiry_date=stock.expiry_date,
                quantity=stock.quantity,
                status=stock.status,
            )
        )

    return ItemDetailResponse(
        item=ItemResponse.model_validate(item),
        stocks=stock_items,
    )


def create_item(db: Session, body: ItemCreate) -> Item:
    _ensure_warehouse_exists(db, body.warehouse_id)
    _ensure_unit_exists(db, body.base_unit)
    if db.query(Item).filter(Item.sku == body.sku).first():
        raise ValueError("SKU already exists")
    item = Item(
        sku=body.sku.strip(),
        name=body.name.strip(),
        description=body.description,
        base_unit_id=body.base_unit,
        max_quantity=body.max_quantity,
        min_quantity=body.min_quantity,
        warehouse_id=body.warehouse_id,
        supplier=(body.supplier or "").strip(),
        details=body.details or {},
        is_active=True,
    )
    try:
        db.add(item)
        db.commit()
        db.refresh(item)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return item


def update_item(db: Session, item_id: int, body: ItemUpdate) -> Optional[Item]:
    item = get_item_by_id(db, item_id, include_inactive=True)
    if not item:
        return None
    data = body.model_dump(exclude_unset=True)
    if "warehouse_id" in data:
        _ensure_warehouse_exists(db, data["warehouse_id"])
        item.warehouse_id = data["warehouse_id"]
    if "sku" in data:
        existing = (
            db.query(Item)
            .filter(Item.sku == data["sku"], Item.id != item_id)
            .first()
        )
        if existing:
            raise ValueError("SKU already exists")
        item.sku = data["sku"].strip()

    next_min = data.get("min_quantity", item.min_quantity)
    next_max = data.get("max_quantity", item.max_quantity)
    if "min_quantity" in data or "max_quantity" in data:
        _validate_quantity_bounds(next_min, next_max)

    if "base_unit" in data:
        _ensure_unit_exists(db, data["base_unit"])
        item.base_unit_id = data["base_unit"]

    for field in (
        "name",
        "description",
        "max_quantity",
        "min_quantity",
        "supplier",
        "details",
        "is_active",
    ):
        if field in data:
            value = data[field]
            if field in ("name", "supplier") and isinstance(value, str):
                value = value.strip()
            setattr(item, field, value)
    try:
        db.commit()
        db.refresh(item)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return item


def delete_item(db: Session, item_id: int) -> bool:
    item = get_item_by_id(db, item_id)
    if not item:
        return False
    if (
        db.query(ItemStock)
        .filter(ItemStock.item_id == item_id, ItemStock.is_active.is_(True))
        .first()
    ):
        raise ValueError("Cannot delete item: item stocks still exist")
    item.is_active = False
    db.commit()
    return True
