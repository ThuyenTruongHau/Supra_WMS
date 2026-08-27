import json
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.cache import cache_scan_keys, cache_set, get_redis
from app.modules.warehouse.item.item_service import get_qr_code_by_code
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.unit.unit_model import Unit
from app.modules.warehouse.item.item_model import Item


def _cavity_numbers_from_item(item) -> list[str]:
    if not item:
        return []
    raw = (item.details or {}).get("cavity_number", [])
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        parts: list[str] = []
        for item_value in raw:
            parts.extend(str(item_value).split(","))
        return [p.strip() for p in parts if p.strip()]
    return [p.strip() for p in str(raw).split(",") if p.strip()]


def _qr_preview_payload(qr_record) -> dict:
    item = qr_record.item
    unit = item.unit if item else None
    return {
        "qr_code_id": qr_record.id,
        "code": qr_record.code,
        "item_id": qr_record.item_id,
        "item_sku": item.sku if item else "",
        "item_name": item.name if item else "",
        "quantity": int(item.base_quantity) if item and item.base_quantity is not None else 1,
        "unit_id": item.base_unit_id if item else None,
        "unit_name": unit.name if unit else "",
        "lot_number": _default_lot_number(qr_record),
        "cavity_numbers": _cavity_numbers_from_item(item),
    }


def _resolve_location(
    db: Session,
    location_code: Optional[str] = None,
) -> Optional[Location]:
    if not location_code:
        return None
    code = location_code.strip()
    return db.query(Location).filter(Location.location_code == code).first()


def _normalize_assigned_stock(stock: dict) -> dict:
    if stock.get("lot_number") is None and stock.get("lot_number_to"):
        stock["lot_number"] = stock["lot_number_to"]
    return stock

def _default_lot_number(qr_record) -> str:
    VN = ZoneInfo("Asia/Ho_Chi_Minh")
    created = qr_record.created_at
    if created is None:
        return ""
    if created.tzinfo is None:
        return created.strftime("%d/%m/%y")
    return created.astimezone(VN).strftime("%d/%m/%y")


def assign_or_get_item_stock(
    db: Session,
    location_code: Optional[str] = None,
    qr_code: Optional[str] = None,
    quantity: Optional[int] = None,
    unit_id: Optional[int] = None,
    lot_number: Optional[str] = None,
    assigned_by: Optional[str] = None,
    cavity_number: Optional[str] = None,
) -> list[dict] | dict:
    qr_record = get_qr_code_by_code(db, qr_code)
    location = _resolve_location(db, location_code)

    if qr_record is not None and location is None:
        return _qr_preview_payload(qr_record)

    if qr_record is None:
        if location is None:
            location = _resolve_location(db, qr_code)
        if location is None:
            raise ValueError("Mã QR không hợp lệ hoặc không tìm thấy vị trí")
        return get_assigned_item_stock(db, location.id)

    if quantity is None or unit_id is None:
        raise ValueError("quantity and unit_id are required when assigning a QR code to a location")

    unit = db.query(Unit).filter(Unit.id == unit_id).first()
    if not unit:
        raise ValueError(f"Unit not found: {unit_id}")

    resolved_lot = lot_number
    item = qr_record.item
    allowed_cavities = _cavity_numbers_from_item(item)
    if allowed_cavities:
        selected_cavity = (cavity_number or "").strip()
        if not selected_cavity:
            raise ValueError("cavity_number is required for this item")
        if selected_cavity not in allowed_cavities:
            raise ValueError(f"Invalid cavity_number: {selected_cavity}")
    else:
        selected_cavity = (cavity_number or "").strip() or None

    _clear_previous_qr_assign(qr_record.id)

    cache_set(
        f"inbound:assign:location:{location.id}:{qr_record.id}",
        {
            "location_id": location.id,
            "location_name": location.location_name,
            "warehouse_id": location.warehouse_id,
            "assigned_by": assigned_by,
            "qr_code_id": qr_record.id,
            "code": qr_record.code,
            "lot_number": resolved_lot,
            "unit_id": unit_id,
            "unit_name": unit.name,
            "quantity": quantity,
            "item_id": qr_record.item_id,
            "item_sku": item.sku if item else "",
            "item_name": item.name if item else "",
            "cavity_number": selected_cavity,
        },
        ttl=-1,
    )
    return {
        "part_number": item.sku if item else "",
        "location": location.location_name,
    }

def _clear_previous_qr_assign(qr_id: int) -> None:
    r = get_redis()
    for key in cache_scan_keys(f"inbound:assign:location:*:{qr_id}"):
        r.delete(key)

def get_assigned_item_stock(db: Session, location_id: int) -> list[dict]:
    keys = cache_scan_keys(f"inbound:assign:location:{location_id}:*")
    if not keys:
        return []
    r = get_redis()
    values = r.mget(keys)
    location = db.query(Location).filter(Location.id == location_id).first()
    stocks = [_normalize_assigned_stock(json.loads(raw)) for raw in values if raw]
    if location:
        for stock in stocks:
            stock.setdefault("location_id", location.id)
            stock.setdefault("location_name", location.location_name)
            stock.setdefault("warehouse_id", location.warehouse_id)
    return stocks

def get_cavity_numbers(db: Session, item_id: int) -> list[str]:
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise ValueError(f"Item not found: {item_id}")
    return _cavity_numbers_from_item(item)