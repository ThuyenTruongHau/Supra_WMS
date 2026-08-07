"""Location service."""

from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.warehouse.location_map.location_model import Location, WarehouseMap
from decimal import Decimal

from app.modules.warehouse.location_map.location_schema import (
    LocationCreate,
    LocationDetailResponse,
    LocationDetailStockItem,
    LocationDetailSummary,
    LocationListResponse,
    LocationResponse,
    LocationUpdate,
    LocationsForMapResponse,
    MapCreate,
    MapDataResponse,
    MapLocationItem,
    MapLocationStockItem,
)
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse, Zone
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.transaction_history.history_model import Transaction
from pathlib import Path
from uuid import uuid4
from fastapi import UploadFile
import re
import zipfile
from dataclasses import dataclass
from typing import Optional
import io
import json

BACKEND_ROOT = Path(__file__).resolve().parents[3]  # → backend/
STATIC_MAP_DIR = BACKEND_ROOT / "static" / "warehouse_maps"
SHELF_NODE_NAME_PATTERN = re.compile(
    r"^R(?P<row>\d+)[_-]C(?P<column>\d+)[_-]L(?P<level>\d+)[_-]B(?P<bin>.+)$",
    re.IGNORECASE,
)

@dataclass
class ParsedShelfNode:
    location_code: str      # node.content
    row: str
    column: str
    level: str
    location_name: str           # phần B (BKH1.10)
    map_x: int
    map_y: int


def _location_query(db: Session, *, include_inactive: bool = False):
    q = db.query(Location)
    if not include_inactive:
        q = q.filter(Location.is_active.is_(True))
    return q


def _ensure_warehouse_and_zone(
    db: Session,
    warehouse_id: int,
    zone_id: Optional[int] = None,
) -> None:
    if not db.query(Warehouse).filter(Warehouse.id == warehouse_id).first():
        raise ValueError(f"Warehouse id not found: {warehouse_id}")

    if zone_id is None:
        return  # ✅ optional zone — dừng ở đây

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


def list_locations_for_map(db: Session, warehouse_id: int) -> LocationsForMapResponse:
    if not db.query(Warehouse).filter(Warehouse.id == warehouse_id).first():
        raise ValueError(f"Warehouse id not found: {warehouse_id}")

    locations = (
        _location_query(db, include_inactive=False)
        .filter(Location.warehouse_id == warehouse_id)
        .order_by(Location.id)
        .all()
    )

    items: list[MapLocationItem] = []
    location_codes: list[str] = []

    for loc in locations:
        stocks = [
            MapLocationStockItem(
                sku=stock.item.sku if stock.item else "",
                lot_number=stock.lot_number,
                quantity=str(stock.quantity),
            )
            for stock in (loc.stocks or [])
            if stock.is_active and stock.quantity is not None and stock.quantity > 0
        ]
        status = loc.status or ("has_stock" if stocks else "empty")
        if status == "has_stock" or stocks:
            location_codes.append(loc.location_code)
            status = "has_stock"
        else:
            status = "empty"

        items.append(
            MapLocationItem(
                id=loc.id,
                location_code=loc.location_code,
                location_name=loc.location_name,
                row=loc.row,
                column=loc.column,
                level=loc.level,
                status=status,
                item_stock=stocks,
            )
        )

    return LocationsForMapResponse(
        warehouse_id=warehouse_id,
        location_codes=location_codes,
        locations=items,
    )


def get_location_detail(db: Session, location_id: int) -> LocationDetailResponse:
    location = get_location_by_id(db, location_id, include_inactive=True)
    if not location:
        raise ValueError("Location not found")

    item_stock: list[LocationDetailStockItem] = []
    total_qty = Decimal("0")

    for stock in location.stocks or []:
        if not stock.is_active:
            continue
        qty = stock.quantity if stock.quantity is not None else Decimal("0")
        total_qty += qty
        item_stock.append(
            LocationDetailStockItem(
                id=stock.id,
                item_id=stock.item_id,
                sku=stock.item.sku if stock.item else "",
                lot_number=stock.lot_number,
                expiry_date=stock.expiry_date,
                quantity=str(qty),
                status=stock.status,
            )
        )

    return LocationDetailResponse(
        location=LocationResponse.model_validate(location),
        item_stock=item_stock,
        summary=LocationDetailSummary(
            item_stock_count=len(item_stock),
            total_quantity=str(total_qty),
        ),
    )


def upsert_location(db: Session, body: LocationCreate) -> Location:
    _ensure_warehouse_and_zone(db, body.warehouse_id, body.zone_id)

    exist_location_name = (
        db.query(Location)
        .filter(
            Location.warehouse_id == body.warehouse_id,
            Location.location_name == body.location_name,
        )
        .first()
    )
    exist_location_code = (
        db.query(Location)
        .filter(
            Location.warehouse_id == body.warehouse_id,
            Location.location_code == body.location_code,
        )
        .first()
    )
    if exist_location_name or exist_location_code:
        return update_location(db, exist_location_name.id if exist_location_name else exist_location_code.id, LocationUpdate(
            location_code=body.location_code.strip(),
            location_name=body.location_name.strip(),
            row=body.row,
            column=body.column,
            level=body.level,
            node_name=body.node_name,
            warehouse_id=body.warehouse_id,
            zone_id=body.zone_id,
            is_active=True,
        ))
    else:
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
        db.add(location)
        db.flush()
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
                Location.warehouse_id == warehouse_id,
                Location.location_code == data["location_code"],
                Location.id != location_id,
            )
            .first()
        )
        if existing:
            raise ValueError("Location code already exists in this warehouse")
        location.location_code = data["location_code"].strip()
    if "location_name" in data:
        existing = (
            db.query(Location)
            .filter(
                Location.warehouse_id == warehouse_id,
                Location.location_name == data["location_name"],
                Location.id != location_id,
            )
            .first()
        )
        if existing:
            raise ValueError("Location name already exists in this warehouse")
        location.location_name = data["location_name"].strip()
    for field in ("row", "column", "level", "node_name", "is_active"):
        if field in data:
            setattr(location, field, data[field])
    db.flush()
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

def create_map_metadata(
    db: Session,
    body: MapCreate,
) -> WarehouseMap:
    _ensure_warehouse_and_zone(db, body.warehouse_id, body.zone_id)

    db.query(WarehouseMap).filter(
        WarehouseMap.warehouse_id == body.warehouse_id,
        WarehouseMap.is_active.is_(True),
    ).update({"is_active": False})

    map = WarehouseMap(
        warehouse_id=body.warehouse_id,
        zone_id=body.zone_id,
        source=body.source,
        is_active=body.is_active,
    )
    db.add(map)
    db.flush()
    return map

async def _save_uploaded_zip(content: bytes, warehouse_id: int) -> Path:
    STATIC_MAP_DIR.mkdir(parents=True, exist_ok=True)
    save_dir = STATIC_MAP_DIR / f"warehouse_{warehouse_id}"
    save_dir.mkdir(parents=True, exist_ok=True)

    destination = save_dir / f"{warehouse_id}_{uuid4().hex}"

    if not content:
        raise ValueError("Uploaded file is empty")

    destination.write_bytes(content)
    return destination

async def import_warehouse_map(
    db: Session,
    warehouse_id: int,
    upload: UploadFile,
    zone_id: Optional[int] = None,
) -> WarehouseMap:

    content = await upload.read()
    if not content:
        raise ValueError("Uploaded file is empty")

    shelves = extract_shelf_nodes_from_zip(content)
    if not shelves:
        raise ValueError("ZIP không có shelf node hợp lệ")

    source_path: Path | None = None

    try:
        source_path = await _save_uploaded_zip(content, warehouse_id)

        sync_locations_from_map(
            db, content, warehouse_id, shelves, zone_id
        )
        warehouse_map = create_map_metadata(
            db,
            MapCreate(
                warehouse_id=warehouse_id,
                zone_id=zone_id,
                source=str(source_path.relative_to(BACKEND_ROOT)),
                is_active=True,
            ),
        )

        db.commit()
        db.refresh(warehouse_map)
        return warehouse_map

    except IntegrityError as exc:
        db.rollback()
        if source_path and source_path.exists():
            source_path.unlink(missing_ok=True)
        raise ValueError(
            "Mã hoặc tên location bị trùng trong kho này. Vui lòng kiểm tra lại bản đồ."
        ) from exc
    except Exception:
        db.rollback()
        if source_path and source_path.exists():
            source_path.unlink(missing_ok=True)
        raise

def _hard_delete_locations_for_warehouse(db: Session, warehouse_id: int) -> int:
    location_ids = [
        row[0]
        for row in db.query(Location.id)
        .filter(Location.warehouse_id == warehouse_id)
        .all()
    ]
    if not location_ids:
        return 0

    db.query(ItemStock).filter(ItemStock.location_id.in_(location_ids)).delete(
        synchronize_session=False
    )
    deleted = (
        db.query(Location)
        .filter(Location.warehouse_id == warehouse_id)
        .delete(synchronize_session=False)
    )
    db.flush()
    return deleted


def _dedupe_shelves(shelves: list[dict]) -> list[dict]:
    """Keep one shelf per location_code (last wins), then drop duplicate location_name."""
    by_code: dict[str, dict] = {}
    for shelf in shelves:
        code = str(shelf["location_code"]).strip()
        by_code[code] = {
            **shelf,
            "location_code": code,
            "location_name": str(shelf["location_name"]).strip(),
        }

    used_names: set[str] = set()
    unique: list[dict] = []
    for shelf in by_code.values():
        name = shelf["location_name"]
        if name in used_names:
            continue
        used_names.add(name)
        unique.append(shelf)
    return unique


def sync_locations_from_map(
    db: Session,
    content: bytes,
    warehouse_id: int,
    shelves: list[dict],
    zone_id: Optional[int] = None,
) -> dict:
    _ensure_warehouse_and_zone(db, warehouse_id, zone_id)
    deleted = _hard_delete_locations_for_warehouse(db, warehouse_id)
    unique_shelves = _dedupe_shelves(shelves)

    for shelf in unique_shelves:
        db.add(
            Location(
                location_code=shelf["location_code"].strip(),
                location_name=shelf["location_name"].strip(),
                row=shelf["row"],
                column=shelf["column"],
                level=shelf["level"],
                warehouse_id=warehouse_id,
                zone_id=zone_id,
                is_active=True,
            )
        )

    db.flush()
    return {
        "deleted": deleted,
        "created": len(unique_shelves),
        "total": len(unique_shelves),
    }

def parse_shelf_node_from_map_node(node: list) -> Optional[ParsedShelfNode]:
    if len(node) < 5 or node[2] != 1:
        return None

    name = str(node[4])

    text = name.strip()
    m = SHELF_NODE_NAME_PATTERN.match(text)
    if m:
        g = m.groupdict()
        row = g["row"]
        column = g["column"]
        level = g["level"]
        location_name = g["bin"]
    else:
        location_name = name
        row = None
        column = None
        level = None
    return ParsedShelfNode(
        location_code=str(node[3]),
        row=row,
        column=column,
        level=level,
        location_name=location_name,
        map_x=int(node[0]),
        map_y=int(node[1]),
    )

def extract_shelf_nodes_from_zip(raw: bytes) -> list[dict]:
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        compress_name = next(
            p for p in ("compress/compress.json", "compress.json")
            if p in zf.namelist()
        )
        data = json.loads(zf.read(compress_name))

    shelves = []
    for node in data.get("nodeArr", []):
        parsed = parse_shelf_node_from_map_node(node)
        if not parsed:
            continue
        shelves.append({
            "location_code": parsed.location_code,
            "location_name": parsed.location_name,
            "row": parsed.row,
            "column": parsed.column,
            "level": parsed.level,
        })
    return shelves

#Get map
    
def _resolve_map_zip_path(source: str) -> Path:
    path = Path(source)
    if not path.is_absolute():
        path = BACKEND_ROOT / path
    return path


def _load_compress_json(zip_path: Path) -> dict:
    if not zip_path.is_file():
        raise ValueError(f"Map file not found: {zip_path}")

    with zipfile.ZipFile(zip_path) as zf:
        compress_name = next(
            (p for p in ("compress/compress.json", "compress.json") if p in zf.namelist()),
            None,
        )
        if not compress_name:
            raise ValueError("compress.json not found in map ZIP")
        return json.loads(zf.read(compress_name))


def get_map_data(db: Session, warehouse_id: int) -> MapDataResponse:
    warehouse_map = (
        db.query(WarehouseMap)
        .filter(
            WarehouseMap.warehouse_id == warehouse_id,
            WarehouseMap.is_active.is_(True),
        )
        .first()
    )
    if warehouse_map is None:
        raise ValueError(f"No active map for warehouse_id={warehouse_id}")

    zip_path = _resolve_map_zip_path(warehouse_map.source)
    data = _load_compress_json(zip_path)

    # Chỉ trả field FE cần (MapData contract)
    try:
        return MapDataResponse(
            width=data["width"],
            height=data["height"],
            node_keys=data["nodeKeys"],
            line_keys=data["lineKeys"],
            node_arr=data["nodeArr"],
            line_arr=data["lineArr"],
            type=data.get("type"),
            x_attr_min=data.get("xAttrMin"),
            y_attr_min=data.get("yAttrMin"),
        )
    except KeyError as e:
        raise ValueError(f"Invalid compress.json: missing field {e.args[0]}") from e

def export_warehouse_map(db: Session, warehouse_id: int) -> tuple[bytes, str]:
    warehouse_map = db.query(WarehouseMap).filter(
        WarehouseMap.warehouse_id == warehouse_id,
        WarehouseMap.is_active.is_(True),
    ).first()
    if not warehouse_map:
        raise ValueError("Warehouse map not found")
    
    zip_path = _resolve_map_zip_path(warehouse_map.source)

    if not zip_path.is_file():
        raise ValueError(f"Map file not found: {zip_path}")

    content = zip_path.read_bytes()
    if not content:
        raise ValueError("Map file is empty")
    filename = f"warehouse-map-{warehouse_id}.zip"
    return content, filename