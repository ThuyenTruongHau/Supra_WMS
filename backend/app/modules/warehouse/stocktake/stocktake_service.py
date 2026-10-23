"""Stocktake header CRUD service."""

from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import case, func, or_, and_
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.lot_number_utils import (
    format_lot_number_display,
    format_lot_value_for_display,
    lot_string_to_date,
    parse_legacy_lot_number,
)
from app.modules.warehouse.stocktake.stocktake_model import Stocktake, StocktakeItemStock
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.stocktake.stocktake_schema import (
    StocktakeCreate,
    StocktakeAddItemRequest,
    StocktakeDetailResponse,
    StocktakeItemStockFormData,
    StocktakeItemStockListResponse,
    StocktakeItemStockResponse,
    StocktakeListResponse,
    StocktakeRecordCountRequest,
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
        .join(Location, Location.id == StocktakeItemStock.location_id)
        .options(
            joinedload(StocktakeItemStock.location),
            joinedload(StocktakeItemStock.item_stock).joinedload(ItemStock.item),
        )
        .filter(StocktakeItemStock.stocktake_id == stocktake_id)
        .order_by(
            Location.location_name.asc().nulls_last(),
            Location.location_code.asc().nulls_last(),
            StocktakeItemStock.id.asc(),
        )
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
        lot_number=format_lot_value_for_display(row.lot_number) or row.lot_number,
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
    statuses: Optional[list[str]] = None,
) -> StocktakeItemStockListResponse:
    query = (
        db.query(StocktakeItemStock)
        .join(Stocktake, Stocktake.id == StocktakeItemStock.stocktake_id)
        .join(Location, Location.id == StocktakeItemStock.location_id)
        .options(
            joinedload(StocktakeItemStock.location),
            joinedload(StocktakeItemStock.item_stock).joinedload(ItemStock.item),
        )
        .filter(Stocktake.warehouse_id == warehouse_id)
    )
    if stocktake_id is not None:
        query = query.filter(StocktakeItemStock.stocktake_id == stocktake_id)
    if statuses:
        normalized = [s.strip() for s in statuses if s and s.strip()]
        if normalized:
            query = query.filter(StocktakeItemStock.status.in_(normalized))
    total = query.count()
    items = (
        query.order_by(
            Location.location_name.asc().nulls_last(),
            Location.location_code.asc().nulls_last(),
            StocktakeItemStock.id.asc(),
        )
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
    if location_ids:
        valid_ids = {
            loc_id for (loc_id,) in db.query(Location.id).filter(
                Location.id.in_(location_ids),
                Location.warehouse_id == body.warehouse_id,
                Location.is_active.is_(True),
            ).all()
        }
        if valid_ids != set(location_ids):
            raise ValueError("Vị trí không tồn tại, đã ngừng hoạt động hoặc không thuộc kho kiểm kê")
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
            ItemStock.quantity > 0,
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
                    start = lot_string_to_date(lot_from)
                    end = lot_string_to_date(lot_to)
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
    # An empty location is a valid counting scope. Newly found stock can be
    # added explicitly; never resurrect historical, inactive stock rows.
    if not item_stocks and not (location_ids and not item_ids and not lot_numbers):
        db.rollback()
        if lot_numbers:
            raise ValueError("No stock found for the selected lots")
        if item_ids:
            raise ValueError("No stock found for the selected product codes")
        raise ValueError("No stock found in this warehouse")
    
    for item_stock in item_stocks:
        stocktake_items.append(StocktakeItemStock(
            stocktake_id=stocktake.id,
            item_stock_id=item_stock.id,
            lot_number=format_lot_number_display(
                item_stock.lot_number_from,
                item_stock.lot_number_to,
            )
            or "",
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


def _lock_count_location(db: Session, location_id: int, warehouse_id: int) -> None:
    location = db.query(Location.id).filter(
        Location.id == location_id,
        Location.warehouse_id == warehouse_id,
        Location.is_active.is_(True),
    ).with_for_update().first()
    if not location:
        raise ValueError("Vị trí không tồn tại, đã ngừng hoạt động hoặc không thuộc kho kiểm kê")


def _matching_stock(db: Session, stock: ItemStock):
    return db.query(ItemStock.id).filter(
        ItemStock.location_id == stock.location_id,
        ItemStock.item_id == stock.item_id,
        ItemStock.lot_number_from == stock.lot_number_from,
        ItemStock.lot_number_to == stock.lot_number_to,
        ItemStock.expiry_date == stock.expiry_date,
        ItemStock.id != stock.id if stock.id else True,
    )


def add_stocktake_item(
    db: Session, stocktake_id: int, body: StocktakeAddItemRequest,
) -> Optional[StocktakeItemStockResponse]:
    stocktake = get_stocktake_by_id(db, stocktake_id)
    if not stocktake:
        return None
    _lock_count_location(db, body.location_id, stocktake.warehouse_id)
    item = db.query(Item).filter(
        Item.id == body.item_id,
        Item.warehouse_id == stocktake.warehouse_id,
        Item.is_active.is_(True),
    ).first()
    if not item:
        raise ValueError("Sản phẩm không tồn tại, đã ngừng hoạt động hoặc không thuộc kho kiểm kê")
    stock = ItemStock(
        item_id=item.id, location_id=body.location_id, unit_id=item.base_unit_id,
        quantity=0, is_active=False, status=body.status,
        lot_number_from=body.lot_number_from, lot_number_to=body.lot_number_to,
        expiry_date=body.expiry_date,
    )
    matching = _matching_stock(db, stock)
    if matching.filter(ItemStock.is_active.is_(True), ItemStock.quantity > 0).first():
        raise ValueError("SKU/lô này đã có tồn tại vị trí; hãy kiểm kê dòng tồn hiện có")
    if db.query(StocktakeItemStock.id).filter(
        StocktakeItemStock.item_stock_id.in_(matching.filter(ItemStock.quantity == 0)),
        StocktakeItemStock.desired_quantity == 0,
        StocktakeItemStock.status.in_(["initialize", "in_progress"]),
    ).first():
        raise ValueError("SKU/lô tại vị trí này đang có dòng kiểm kê chưa xác nhận")
    try:
        db.add(stock)
        db.flush()
        row = StocktakeItemStock(
            stocktake_id=stocktake_id, item_stock_id=stock.id,
            location_id=body.location_id, desired_quantity=0,
            actual_quantity=body.actual_quantity, status="in_progress",
            lot_number=format_lot_number_display(stock.lot_number_from, stock.lot_number_to) or "",
        )
        db.add(row)
        db.commit()
        row = _get_stocktake_item_row(db, stocktake_id, row.id)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return stocktake_item_to_response(row)


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


def _stocktake_item_query(db: Session):
    return (
        db.query(StocktakeItemStock)
        .options(
            joinedload(StocktakeItemStock.location),
            joinedload(StocktakeItemStock.item_stock).joinedload(ItemStock.item),
        )
    )


def _get_stocktake_item_row(
    db: Session,
    stocktake_id: int,
    stocktake_item_id: int,
) -> Optional[StocktakeItemStock]:
    return (
        _stocktake_item_query(db)
        .filter(
            StocktakeItemStock.id == stocktake_item_id,
            StocktakeItemStock.stocktake_id == stocktake_id,
        )
        .first()
    )


def _ensure_item_and_location(db: Session, item_id: int, location_id: int) -> None:
    item = (
        db.query(Item)
        .filter(Item.id == item_id, Item.is_active.is_(True))
        .first()
    )
    if not item:
        raise ValueError(f"Item id not found: {item_id}")
    location = (
        db.query(Location)
        .filter(Location.id == location_id, Location.is_active.is_(True))
        .first()
    )
    if not location:
        raise ValueError(f"Location id not found: {location_id}")


def _apply_item_stock_metadata(
    db: Session,
    item_stock: ItemStock,
    body: StocktakeRecordCountRequest,
) -> None:
    data = body.model_dump(exclude_unset=True, exclude={"actual_quantity"})
    if "location_id" in data:
        _ensure_item_and_location(db, item_stock.item_id, data["location_id"])
        item_stock.location_id = data["location_id"]
    for field in ("lot_number_from", "lot_number_to", "expiry_date", "status"):
        if field in data:
            setattr(item_stock, field, data[field])


def get_stocktake_item_form_data(
    db: Session,
    stocktake_item_id: int,
) -> Optional[StocktakeItemStockFormData]:
    row = (
        _stocktake_item_query(db)
        .filter(StocktakeItemStock.id == stocktake_item_id)
        .first()
    )
    if not row or not row.item_stock:
        return None

    item_stock = row.item_stock
    item = item_stock.item
    location = row.location
    return StocktakeItemStockFormData(
        stocktake_item_id=row.id,
        stocktake_id=row.stocktake_id,
        item_stock_id=row.item_stock_id,
        desired_quantity=row.desired_quantity,
        item_sku=item.sku if item else None,
        item_name=item.name if item else None,
        location_id=item_stock.location_id,
        location_code=location.location_code if location else None,
        location_name=location.location_name if location else None,
        lot_number_from=item_stock.lot_number_from,
        lot_number_to=item_stock.lot_number_to,
        expiry_date=item_stock.expiry_date,
        status=item_stock.status,
        system_quantity=item_stock.quantity,
    )


def record_stocktake_item_count(
    db: Session,
    stocktake_id: int,
    stocktake_item_id: int,
    body: StocktakeRecordCountRequest,
) -> Optional[StocktakeItemStockResponse]:
    row = _get_stocktake_item_row(db, stocktake_id, stocktake_item_id)
    if not row:
        return None
    if row.status != "initialize":
        raise ValueError("Item already recorded")

    item_stock = row.item_stock
    if not item_stock:
        raise ValueError("Item stock not found")

    _lock_count_location(db, body.location_id or item_stock.location_id, row.stocktake.warehouse_id)
    _apply_item_stock_metadata(db, item_stock, body)
    row.actual_quantity = body.actual_quantity
    row.status = "in_progress"
    row.location_id = item_stock.location_id
    row.lot_number = format_lot_number_display(
        item_stock.lot_number_from,
        item_stock.lot_number_to,
    ) or row.lot_number

    try:
        db.commit()
        db.refresh(row)
        row = _get_stocktake_item_row(db, stocktake_id, stocktake_item_id)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return stocktake_item_to_response(row) if row else None


def confirm_quantity_for_stock(
    db: Session,
    stocktake_id: int,
    stocktake_item_id: int,
) -> Optional[StocktakeItemStockResponse]:
    row = _get_stocktake_item_row(db, stocktake_id, stocktake_item_id)
    if not row:
        return None
    if row.status != "in_progress":
        raise ValueError("Item is not pending admin confirmation")

    item_stock = row.item_stock
    if not item_stock:
        raise ValueError("Item stock not found")

    _lock_count_location(db, item_stock.location_id, row.stocktake.warehouse_id)
    # Serialize confirmations of this exact count, including repeated clicks.
    db.query(StocktakeItemStock.id).filter(StocktakeItemStock.id == row.id).with_for_update().one()
    db.refresh(row)
    db.refresh(item_stock)
    if row.status != "in_progress":
        raise ValueError("Item is not pending admin confirmation")
    if not item_stock.is_active and (row.desired_quantity != 0 or item_stock.quantity != 0):
        raise ValueError("Dòng tồn đã được clear hoặc ngừng hoạt động; hãy tạo dòng kiểm kê mới theo thực đếm")
    if not item_stock.is_active and row.actual_quantity > 0:
        if _matching_stock(db, item_stock).filter(
            ItemStock.is_active.is_(True), ItemStock.quantity > 0,
        ).first():
            raise ValueError("SKU/lô đã có tồn mới tại vị trí; vui lòng kiểm tra lại trước khi xác nhận")
    item_stock.quantity = row.actual_quantity
    item_stock.is_active = row.actual_quantity > 0
    row.status = (
        "completed"
        if row.actual_quantity == row.desired_quantity
        else "discrepancy"
    )

    try:
        db.commit()
        db.refresh(row)
        row = _get_stocktake_item_row(db, stocktake_id, stocktake_item_id)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return stocktake_item_to_response(row) if row else None
