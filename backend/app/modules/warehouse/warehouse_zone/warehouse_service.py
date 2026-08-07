"""Warehouse and Zone service."""

from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse, Zone
from app.modules.warehouse.warehouse_zone.warehouse_schema import (
    WarehouseCreate,
    WarehouseListResponse,
    WarehouseResponse,
    WarehouseUpdate,
    ZoneCreate,
    ZoneListResponse,
    ZoneResponse,
    ZoneUpdate,
)
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.item.item_model import Item
from app.core.logger import get_logger
logger = get_logger("main")


# --- Warehouse ---

def list_warehouses(
    db: Session, page: int = 1, page_size: int = 20
) -> WarehouseListResponse:
    query = db.query(Warehouse)
    total = query.count()
    items = (
        query.order_by(Warehouse.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return WarehouseListResponse(
        items=[WarehouseResponse.model_validate(w) for w in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def get_warehouse_by_id(db: Session, warehouse_id: int) -> Optional[Warehouse]:
    return db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()


def create_warehouse(db: Session, body: WarehouseCreate) -> Warehouse:
    if db.query(Warehouse).filter(Warehouse.code == body.code).first():
        raise ValueError("Warehouse code already exists")
    warehouse = Warehouse(
        code=body.code.strip(),
        name=body.name,
        description=body.description,
    )
    try:
        db.add(warehouse)
        db.commit()
        db.refresh(warehouse)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return warehouse


def update_warehouse(
    db: Session, warehouse_id: int, body: WarehouseUpdate
) -> Optional[Warehouse]:
    warehouse = get_warehouse_by_id(db, warehouse_id)
    if not warehouse:
        return None
    data = body.model_dump(exclude_unset=True)
    if "code" in data:
        existing = (
            db.query(Warehouse)
            .filter(Warehouse.code == data["code"], Warehouse.id != warehouse_id)
            .first()
        )
        if existing:
            raise ValueError("Warehouse code already exists")
        warehouse.code = data["code"].strip()
    if "name" in data:
        warehouse.name = data["name"]
    if "description" in data:
        warehouse.description = data["description"]
    try:
        db.commit()
        db.refresh(warehouse)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return warehouse


def delete_warehouse(db: Session, warehouse_id: int) -> bool:
    warehouse = get_warehouse_by_id(db, warehouse_id)
    if not warehouse:
        return False
    if db.query(Zone).filter(Zone.warehouse_id == warehouse_id).first():
        raise ValueError("Cannot delete warehouse: zones still exist")
    if (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.is_active.is_(True),
        )
        .first()
    ):
        raise ValueError("Cannot delete warehouse: locations still exist")
    if (
        db.query(Item)
        .filter(Item.warehouse_id == warehouse_id, Item.is_active.is_(True))
        .first()
    ):
        raise ValueError("Cannot delete warehouse: items still exist")
    try:
        db.delete(warehouse)
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise ValueError(
            "Cannot delete warehouse: related records still exist"
        ) from e
    return True


# --- Zone ---

def _ensure_warehouse_exists(db: Session, warehouse_id: int) -> None:
    if not get_warehouse_by_id(db, warehouse_id):
        raise ValueError(f"Warehouse id not found: {warehouse_id}")


def list_zones(
    db: Session,
    page: int = 1,
    page_size: int = 20,
    warehouse_id: Optional[int] = None,
) -> ZoneListResponse:
    query = db.query(Zone)
    if warehouse_id is not None:
        query = query.filter(Zone.warehouse_id == warehouse_id)
    total = query.count()
    items = (
        query.order_by(Zone.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return ZoneListResponse(
        items=[ZoneResponse.model_validate(z) for z in items],
        total=total,
        page=page,
        page_size=page_size,
    )


def get_zone_by_id(db: Session, zone_id: int) -> Optional[Zone]:
    return db.query(Zone).filter(Zone.id == zone_id).first()


def create_zone(db: Session, body: ZoneCreate) -> Zone:
    _ensure_warehouse_exists(db, body.warehouse_id)
    if db.query(Zone).filter(Zone.code == body.code).first():
        raise ValueError("Zone code already exists")
    zone = Zone(
        warehouse_id=body.warehouse_id,
        code=body.code.strip(),
        name=body.name,
        description=body.description,
    )
    try:
        db.add(zone)
        db.commit()
        db.refresh(zone)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return zone


def update_zone(db: Session, zone_id: int, body: ZoneUpdate) -> Optional[Zone]:
    zone = get_zone_by_id(db, zone_id)
    if not zone:
        return None
    data = body.model_dump(exclude_unset=True)
    if "warehouse_id" in data:
        _ensure_warehouse_exists(db, data["warehouse_id"])
        zone.warehouse_id = data["warehouse_id"]
    if "code" in data:
        existing = (
            db.query(Zone)
            .filter(Zone.code == data["code"], Zone.id != zone_id)
            .first()
        )
        if existing:
            raise ValueError("Zone code already exists")
        zone.code = data["code"].strip()
    if "name" in data:
        zone.name = data["name"]
    if "description" in data:
        zone.description = data["description"]
    try:
        db.commit()
        db.refresh(zone)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e
    return zone


def delete_zone(db: Session, zone_id: int) -> bool:
    zone = get_zone_by_id(db, zone_id)
    if not zone:
        return False
    if (
        db.query(Location)
        .filter(Location.zone_id == zone_id, Location.is_active.is_(True))
        .first()
    ):
        raise ValueError("Cannot delete zone: locations still exist")
    try:
        db.delete(zone)
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise ValueError("Cannot delete zone: related records still exist") from e
    return True


def assign_locations_to_zone(
    db: Session,
    zone_id: int,
    location_ids: list[int],
) -> dict:
    zone = get_zone_by_id(db, zone_id)
    if not zone:
        raise ValueError("Zone not found")

    logger.info(f"Assigning locations to zone: {location_ids}")

    unique_ids = list(dict.fromkeys(location_ids))
    if unique_ids:
        locations = (
            db.query(Location)
            .filter(Location.id.in_(unique_ids), Location.is_active.is_(True))
            .all()
        )
        if len(locations) != len(unique_ids):
            raise ValueError("One or more location ids not found")
        for location in locations:
            if location.warehouse_id != zone.warehouse_id:
                raise ValueError(
                    f"Location {location.location_code} does not belong to zone warehouse"
                )

    for location in db.query(Location).filter(Location.zone_id == zone_id).all():
        location.zone_id = None

    for location_id in unique_ids:
        location = db.query(Location).filter(Location.id == location_id).first()
        if location:
            location.zone_id = zone_id

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e

    return {"assigned": len(unique_ids)}
