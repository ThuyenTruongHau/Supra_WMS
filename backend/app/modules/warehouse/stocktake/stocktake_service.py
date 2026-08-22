"""Stocktake header CRUD service."""

from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import case, func, or_, and_
from datetime import datetime

from app.modules.warehouse.lot_number_utils import parse_legacy_lot_number
from app.modules.warehouse.stocktake.stocktake_model import Stocktake, StocktakeItemStock
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.stocktake.stocktake_schema import (
    StocktakeCreate,
    StocktakeDetailResponse,
    StocktakeItemStockListResponse,
    StocktakeItemStockResponse,
    StocktakeListResponse,
    StocktakeResponse,
    StocktakeUpdate,
)
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse


def stocktake_to_response(stocktake: Stocktake) -> StocktakeResponse:
    return StocktakeResponse(
        id=stocktake.id,
        warehouse_id=stocktake.warehouse_id,
        created_by_id=stocktake.created_by_id,
        description=stocktake.description,
        created_by_username=stocktake.created_by.username if stocktake.created_by else None,
        warehouse_name=stocktake.warehouse.name if stocktake.warehouse else None,
        status=stocktake.status,
        created_at=stocktake.created_at,
        updated_at=stocktake.updated_at,
    )


def _ensure_warehouse_exists(db: Session, warehouse_id: int) -> None:
    if not db.query(Warehouse).filter(Warehouse.id == warehouse_id).first():
        raise ValueError("Warehouse not found")


def get_stocktake_by_id(db: Session, stocktake_id: int) -> Optional[Stocktake]:
    return (
        db.query(Stocktake)
        .options(
            joinedload(Stocktake.warehouse),
            joinedload(Stocktake.created_by),
        )
        .filter(Stocktake.id == stocktake_id)
        .first()
    )


def get_stocktake_detail(db: Session, stocktake_id: int) -> Optional[StocktakeDetailResponse]:
    stocktake = get_stocktake_by_id(db, stocktake_id)
    if not stocktake:
        return None

    item_rows = (
        db.query(StocktakeItemStock)
        .options(
            joinedload(StocktakeItemStock.location),
            joinedload(StocktakeItemStock.item_stock).joinedload(ItemStock.item),
        )
        .filter(StocktakeItemStock.stocktake_id == stocktake_id)
        .order_by(StocktakeItemStock.id.asc())
        .all()
    )
    base = stocktake_to_response(stocktake)
    return StocktakeDetailResponse(
        **base.model_dump(),
        items=[stocktake_item_to_response(row) for row in item_rows],
    )


def list_stocktakes(
    db: Session,
    *,
    warehouse_id: int,
    page: int = 1,
    page_size: int = 20,
    q: Optional[str] = None,
) -> StocktakeListResponse:
    query = (
        db.query(Stocktake)
        .options(
            joinedload(Stocktake.warehouse),
            joinedload(Stocktake.created_by),
        )
        .filter(Stocktake.warehouse_id == warehouse_id)
    )
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(Stocktake.description.ilike(like))

    total = query.count()
    items = (
        query.order_by(Stocktake.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return StocktakeListResponse(
        items=[stocktake_to_response(s) for s in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def stocktake_item_to_response(row: StocktakeItemStock) -> StocktakeItemStockResponse:
    item = row.item_stock.item if row.item_stock else None
    location = row.location
    return StocktakeItemStockResponse(
        id=row.id,
        stocktake_id=row.stocktake_id,
        item_stock_id=row.item_stock_id,
        lot_number=row.lot_number,
        location_id=row.location_id,
        desired_quantity=row.desired_quantity,
        actual_quantity=row.actual_quantity,
        location_code=location.location_code if location else None,
        location_name=location.location_name if location else None,
        item_sku=item.sku if item else None,
        item_name=item.name if item else None,
        status=row.status,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def list_stocktake_items(
    db: Session,
    *,
    warehouse_id: int,
    page: int = 1,
    page_size: int = 20,
    stocktake_id: Optional[int] = None,
) -> StocktakeItemStockListResponse:
    query = (
        db.query(StocktakeItemStock)
        .join(Stocktake, Stocktake.id == StocktakeItemStock.stocktake_id)
        .options(
            joinedload(StocktakeItemStock.location),
            joinedload(StocktakeItemStock.item_stock).joinedload(ItemStock.item),
        )
        .filter(Stocktake.warehouse_id == warehouse_id)
    )
    if stocktake_id is not None:
        query = query.filter(StocktakeItemStock.stocktake_id == stocktake_id)
    total = query.count()
    items = (
        query.order_by(StocktakeItemStock.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return StocktakeItemStockListResponse(
        items=[stocktake_item_to_response(row) for row in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def _lot_as_date(col):
    return case(
        (
            col.op("~")(r"^\d{2}/\d{2}/\d{2}$"),
            func.to_date(col, "DD/MM/YY"),
        ),
        else_=func.to_date(col, "DDMMYY"),
    )


def create_stocktake(
    db: Session,
    body: StocktakeCreate,
    *,
    location_ids: Optional[list[int]] = None,
    item_ids: Optional[list[int]] = None,
    lot_numbers: Optional[list[str]] = None,
    created_by_id: int,
) -> Stocktake:
    _ensure_warehouse_exists(db, body.warehouse_id)
    stocktake = Stocktake(
        warehouse_id=body.warehouse_id,
        created_by_id=created_by_id,
        description=body.description.strip() if body.description else None,
    )
    db.add(stocktake)
    db.flush()

    stocktake_items: list[StocktakeItemStock] = []
    query = (
        db.query(ItemStock)
        .join(Location, Location.id == ItemStock.location_id)
        .filter(
            Location.warehouse_id == body.warehouse_id,
            ItemStock.is_active.is_(True),
        )
    )

    if location_ids:
        query = query.filter(ItemStock.location_id.in_(location_ids))
        
    if item_ids:
        if lot_numbers:
            lot_conds = []
            for raw in lot_numbers:
                legacy = raw.replace(",", "-").replace(" ", "")
                try:
                    lot_from, lot_to = parse_legacy_lot_number(legacy)
                    start = datetime.strptime(lot_from, "%d/%m/%y").date()
                    end = datetime.strptime(lot_to, "%d/%m/%y").date()
                except ValueError as e:
                    raise ValueError("Invalid lot number format") from e
                stock_from = _lot_as_date(ItemStock.lot_number_from)
                stock_to = _lot_as_date(ItemStock.lot_number_to)
                lot_conds.append(
                    or_(
                        and_(stock_from >= start, stock_from <= end),
                        and_(stock_to >= start, stock_to <= end),
                    )
                )
            query = query.filter(or_(*lot_conds))
        else:
            query = query.filter(ItemStock.item_id.in_(item_ids))

    item_stocks = query.all()
    if not item_stocks:
        db.rollback()
        if lot_numbers:
            raise ValueError("No stock found for the selected lots")
        if item_ids:
            raise ValueError("No stock found for the selected product codes")
        if location_ids:
            raise ValueError("Selected locations have no stock")
        raise ValueError("No stock found in this warehouse")
    
    for item_stock in item_stocks:
        stocktake_items.append(StocktakeItemStock(
            stocktake_id=stocktake.id,
            item_stock_id=item_stock.id,
            lot_number=f"{item_stock.lot_number_from}-{item_stock.lot_number_to}",
            location_id=item_stock.location_id,
            desired_quantity=int(item_stock.quantity),
            actual_quantity=0,
            status="initialize",
        ))

            
    try:
        db.add(stocktake)
        db.add_all(stocktake_items)
        db.commit()
        db.refresh(stocktake)
        stocktake = get_stocktake_by_id(db, stocktake.id)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return stocktake


def update_stocktake(
    db: Session,
    stocktake_id: int,
    body: StocktakeUpdate,
) -> Optional[Stocktake]:
    stocktake = get_stocktake_by_id(db, stocktake_id)
    if not stocktake:
        return None

    data = body.model_dump(exclude_unset=True)
    if "description" in data:
        desc = data["description"]
        stocktake.description = desc.strip() if isinstance(desc, str) and desc else desc

    try:
        db.commit()
        db.refresh(stocktake)
        stocktake = get_stocktake_by_id(db, stocktake.id)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return stocktake


def delete_stocktake(db: Session, stocktake_id: int) -> bool:
    stocktake = get_stocktake_by_id(db, stocktake_id)
    if not stocktake:
        return False
    try:
        db.delete(stocktake)
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return True

