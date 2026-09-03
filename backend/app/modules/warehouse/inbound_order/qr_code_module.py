import json
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.cache import cache_scan_keys, cache_set, get_redis, cache_delete_pattern
from app.modules.warehouse.item.item_service import get_qr_code_by_code
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.unit.unit_model import Unit
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.lot_number_utils import parse_legacy_lot_number


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


def _get_cached_assign_for_qr(qr_id: int) -> Optional[dict]:
    keys = cache_scan_keys(f"inbound:assign:location:*:{qr_id}")
    if not keys:
        return None
    raw = get_redis().get(keys[0])
    if not raw:
        return None
    return json.loads(raw)


def _apply_cached_preview_fields(payload: dict, cached: dict) -> None:
    if cached.get("quantity") is not None:
        payload["quantity"] = int(cached["quantity"])
    if cached.get("unit_id") is not None:
        payload["unit_id"] = cached["unit_id"]
    if cached.get("unit_name"):
        payload["unit_name"] = cached["unit_name"]
    if cached.get("lot_number") is not None:
        payload["lot_number"] = cached["lot_number"] or ""
    if cached.get("cavity_number"):
        payload["cavity_number"] = cached["cavity_number"]
    if cached.get("manufacturing_user"):
        payload["manufacturing_user"] = cached["manufacturing_user"]
    if "qc_user" in payload and cached.get("qc_user"):
        payload["qc_user"] = cached["qc_user"]
    if "packing_user" in payload and cached.get("packing_user"):
        payload["packing_user"] = cached["packing_user"]


def _qr_preview_payload(qr_record) -> dict:
    item = qr_record.item
    unit = item.unit if item else None
    payload = {
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
        "manufacturing_user": "",
    }

    if getattr(qr_record, "qr_type", None) == "transit":
        payload["qc_user"] = ""
        payload["packing_user"] = ""

    cached = _get_cached_assign_for_qr(qr_record.id)
    if cached:
        _apply_cached_preview_fields(payload, cached)

    return payload


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
    cavity_number: Optional[str] = None,
    manufacturing_user: Optional[str] = None,
    qc_user: Optional[str] = None,
    packing_user: Optional[str] = None,
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

    lot_raw = (lot_number or "").strip()
    if not lot_raw:
        raise ValueError("lot_number is required when assigning a QR code to a location")
    parse_legacy_lot_number(lot_raw)
    resolved_lot = lot_raw
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

    is_transit = getattr(qr_record, "qr_type", None) == "transit"
    resolved_manufacturing = (manufacturing_user or "").strip() or None
    resolved_qc = (qc_user or "").strip() or None
    resolved_packing = (packing_user or "").strip() or None
    if not resolved_manufacturing:
        raise ValueError("manufacturing_user is required when assigning a QR code to a location")
    # if is_transit:
    #     if not resolved_qc:
    #         raise ValueError("qc_user is required for transit QR")
    #     if not resolved_packing:
    #         raise ValueError("packing_user is required for transit QR")

    _check_qr_in_location(location.id, qr_record.qr_type)
    _clear_previous_qr_assign(qr_record.id)

    cache_payload = {
        "location_id": location.id,
        "location_name": location.location_name,
        "warehouse_id": location.warehouse_id,
        "qr_code_id": qr_record.id,
        "code": qr_record.code,
        "lot_number": resolved_lot,
        "unit_id": unit_id,
        "unit_name": unit.name,
        "qr_type": qr_record.qr_type,
        "quantity": quantity,
        "item_id": qr_record.item_id,
        "item_sku": item.sku if item else "",
        "item_name": item.name if item else "",
        "cavity_number": selected_cavity,
        "manufacturing_user": resolved_manufacturing,
    }
    if is_transit:
        cache_payload["qc_user"] = resolved_qc
        cache_payload["packing_user"] = resolved_packing

    cache_set(
        f"inbound:assign:location:{location.id}:{qr_record.id}",
        cache_payload,
        ttl=-1,
    )
    return {
        "part_number": item.sku if item else "",
        "location": location.location_name,
    }

def _check_qr_in_location(location_id: int, qr_type: str) -> None:
    keys = cache_scan_keys(f"inbound:assign:location:{location_id}:*")
    if not keys:
        return
    raw = get_redis().get(keys[0])
    if not raw:
        return
    cached = json.loads(raw)
    existing_type = (cached.get("qr_type") or "item").strip().lower()
    incoming_type = (qr_type or "item").strip().lower()
    if existing_type != incoming_type:
        raise ValueError(
            f"Vị trí đã có QR loại '{existing_type}', "
            f"không thể gán QR loại '{incoming_type}'"
        )

def _clear_previous_qr_assign(qr_id: int) -> None:
    r = get_redis()
    
    for key in cache_scan_keys(f"inbound:assign:location:*:{qr_id}"):
        r.delete(key)


def get_assigned_item_stock(db: Session, location_id: int) -> list[dict]:
    location = db.query(Location).filter(Location.id == location_id).first()
    zone = location.zone
    
    if zone.code == "Zone_1.1":
        keys = cache_scan_keys(f"inbound:assign:location:{location_id}:*")
        if not keys:
            return []
        r = get_redis()
        values = r.mget(keys)
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

def relocate_cached_item_stock(db: Session, from_location_code: int, to_location_code: int) -> int:
    from_location = db.query(Location).filter(Location.location_code == from_location_code).first()
    to_location = db.query(Location).filter(Location.location_code == to_location_code).first()
    if not from_location or not to_location:
        raise ValueError("From or to location not found")

    keys = cache_scan_keys(f"inbound:assign:location:{from_location.id}:*")
    if not keys:
        return 0
    r = get_redis()
    values = r.mget(keys)

    cache_delete_pattern(f"inbound:assign:location:{to_location.id}:*")

    moved = 0
    for key, raw in zip(keys, values):
        if not raw:
            continue
        cached = json.loads(raw)
        cached["location_id"] = to_location.id
        cached["location_name"] = to_location.location_name
        cached["warehouse_id"] = to_location.warehouse_id
        cache_set(
            f"inbound:assign:location:{to_location.id}:{cached['qr_code_id']}",
            cached,
            ttl=-1,
        )
        r.delete(key)
        moved += 1

    return moved