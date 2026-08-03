"""Location service."""

from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.location_map.location_schema import (
    LocationCreate,
    LocationListResponse,
    LocationResponse,
    LocationUpdate,
)
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse, Zone
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.transaction_history.history_model import Transaction


def _location_query(db: Session, *, include_inactive: bool = False):
    q = db.query(Location)
    if not include_inactive:
        q = q.filter(Location.is_active.is_(True))
    return q


def _ensure_warehouse_and_zone(
    db: Session, warehouse_id: int, zone_id: int
) -> None:
    if not db.query(Warehouse).filter(Warehouse.id == warehouse_id).first():
        raise ValueError(f"Warehouse id not found: {warehouse_id}")
    zone = db.query(Zone).filter(Zone.id == zone_id).first()
    if not zone:
        raise ValueError(f"Zone id not found: {zone_id}")
    if zone.warehouse_id != warehouse_id:
        raise ValueError("Zone does not belong to the given warehouse")


def list_locations(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    warehouse_id: Optional[int] = None,
    zone_id: Optional[int] = None,
    q: Optional[str] = None,
    include_inactive: bool = False,
) -> LocationListResponse:
    query = _location_query(db, include_inactive=include_inactive)
    if warehouse_id is not None:
        query = query.filter(Location.warehouse_id == warehouse_id)
    if zone_id is not None:
        query = query.filter(Location.zone_id == zone_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (Location.location_code.ilike(like))
            | (Location.location_name.ilike(like))
        )
    total = query.count()
    items = (
        query.order_by(Location.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return LocationListResponse(
        items=[LocationResponse.model_validate(loc) for loc in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def get_location_by_id(
    db: Session, location_id: int, *, include_inactive: bool = False
) -> Optional[Location]:
    return (
        _location_query(db, include_inactive=include_inactive)
        .filter(Location.id == location_id)
        .first()
    )


def create_location(db: Session, body: LocationCreate) -> Location:
    _ensure_warehouse_and_zone(db, body.warehouse_id, body.zone_id)
    if (
        db.query(Location)
        .filter(Location.location_code == body.location_code)
        .first()
    ):
        raise ValueError("Location code already exists")
    if (
        db.query(Location)
        .filter(Location.location_name == body.location_name)
        .first()
    ):
        raise ValueError("Location name already exists")
    location = Location(
        location_code=body.location_code.strip(),
        location_name=body.location_name.strip(),
        row=body.row,
        column=body.column,
        level=body.level,
        node_name=body.node_name,
        warehouse_id=body.warehouse_id,
        zone_id=body.zone_id,
        is_active=True,
    )
    try:
        db.add(location)
        db.commit()
        db.refresh(location)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return location


def update_location(
    db: Session, location_id: int, body: LocationUpdate
) -> Optional[Location]:
    location = get_location_by_id(db, location_id, include_inactive=True)
    if not location:
        return None
    data = body.model_dump(exclude_unset=True)
    warehouse_id = data.get("warehouse_id", location.warehouse_id)
    zone_id = data.get("zone_id", location.zone_id)
    if "warehouse_id" in data or "zone_id" in data:
        _ensure_warehouse_and_zone(db, warehouse_id, zone_id)
        location.warehouse_id = warehouse_id
        location.zone_id = zone_id
    if "location_code" in data:
        existing = (
            db.query(Location)
            .filter(
                Location.location_code == data["location_code"],
                Location.id != location_id,
            )
            .first()
        )
        if existing:
            raise ValueError("Location code already exists")
        location.location_code = data["location_code"].strip()
    if "location_name" in data:
        existing = (
            db.query(Location)
            .filter(
                Location.location_name == data["location_name"],
                Location.id != location_id,
            )
            .first()
        )
        if existing:
            raise ValueError("Location name already exists")
        location.location_name = data["location_name"].strip()
    for field in ("row", "column", "level", "node_name", "is_active"):
        if field in data:
            setattr(location, field, data[field])
    try:
        db.commit()
        db.refresh(location)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return location


def delete_location(db: Session, location_id: int) -> bool:
    location = get_location_by_id(db, location_id)
    if not location:
        return False
    if (
        db.query(ItemStock)
        .filter(
            ItemStock.location_id == location_id,
            ItemStock.is_active.is_(True),
        )
        .first()
    ):
        raise ValueError("Cannot delete location: item stocks still exist")
    if (
        db.query(Transaction)
        .filter(
            (Transaction.from_location_id == location_id)
            | (Transaction.to_location_id == location_id)
        )
        .first()
    ):
        raise ValueError("Cannot delete location: transactions still exist")
    location.is_active = False
    db.commit()
    return True
