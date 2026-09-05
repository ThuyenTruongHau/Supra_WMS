import json
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.core.cache import cache_scan_keys, cache_set, get_redis, cache_delete_pattern, cache_get
from app.modules.warehouse.item.item_service import get_qr_code_by_code
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.unit.unit_model import Unit
from app.modules.warehouse.item.item_model import Item, QR_Code
from app.modules.warehouse.lot_number_utils import parse_legacy_lot_number
from app.core.logger import get_logger
from app.modules.warehouse.inbound_order.inbound_order_schema import AssignOrGetItemStockAction

logger = get_logger("main")

_QC_PACKING_QR_TYPES = frozenset({"item", "pack"})


def _qr_type_needs_qc_packing(qr_type: Optional[str]) -> bool:
    return (qr_type or "item").strip().lower() in _QC_PACKING_QR_TYPES


def _stock_level_for_qr_type(qr_type: Optional[str]) -> int:
    return 1 if (qr_type or "item").strip().lower() == "item" else 2


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

def _get_cached_pending_for_qr(qr_id: int) -> Optional[dict]:
    return cache_get(f"inbound:pending:qr:{qr_id}")


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
    qr_type = (getattr(qr_record, "qr_type", None) or "item").strip().lower()
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
        "qr_type": qr_type,
        "manufacturing_user": "",
    }

    if _qr_type_needs_qc_packing(qr_type):
        payload["qc_user"] = ""
        payload["packing_user"] = ""

    cached_assign = _get_cached_assign_for_qr(qr_record.id)
    if cached_assign:
        _apply_cached_preview_fields(payload, cached_assign)
    else:
        cached_pending = _get_cached_pending_for_qr(qr_record.id)
        if cached_pending:
            _apply_cached_preview_fields(payload, cached_pending)
    # logger.info(f"Preview payload for QR {qr_record.id}: {payload}")
    return payload


def _preview_result(qr_record) -> dict:
    return {
        "action": AssignOrGetItemStockAction.PREVIEW,
        "preview": _qr_preview_payload(qr_record),
    }


def _assigned_result(part_number: str, location: str) -> dict:
    return {
        "action": AssignOrGetItemStockAction.ASSIGNED,
        "assigned": {
            "part_number": part_number,
            "location": location,
        },
    }


def _location_stocks_result(stocks: list[dict]) -> dict:
    return {
        "action": AssignOrGetItemStockAction.LOCATION_STOCKS,
        "location_stocks": stocks,
    }


def _resolve_location(
    db: Session,
    location_code: Optional[str] = None,
    warehouse_id: Optional[int] = None,
) -> Optional[Location]:
    if not location_code and not warehouse_id:
        return None
    if location_code:
        code = location_code.strip()
        return db.query(Location).filter(Location.location_code == code, Location.warehouse_id == warehouse_id).first()


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


def preview_qr_code(
    db: Session,
    qr_code: Optional[str] = None,
    warehouse_id: Optional[int] = None,
) -> dict:
    del warehouse_id
    qr_record = get_qr_code_by_code(db, qr_code)
    if qr_record is None or not _qr_type_needs_qc_packing(qr_record.qr_type):
        raise ValueError("Only item or pack QR codes can be cached for packing")
    if qr_record is None:
        raise ValueError("Invalid QR code")

    return _qr_preview_payload(qr_record)


def _is_linked_pack_pending(stock: dict) -> bool:
    level = stock.get("stock_level")
    if level is not None:
        if int(level) != 2:
            return False
    elif (stock.get("qr_type") or "item").strip().lower() != "pack":
        return False

    relation = stock.get("relation")
    if relation is None:
        return False
    if isinstance(relation, str) and not relation.strip():
        return False
    return True


def _validate_pack_relation(
    *,
    pack_qr_id: int,
    relation: int,
    packing_user: str,
) -> None:
    if relation == pack_qr_id:
        raise ValueError("relation cannot reference the same QR code")

    parent = _get_cached_pending_for_qr(relation)
    if not parent:
        raise ValueError("relation must point to a cached item QR")
    parent_type = (parent.get("qr_type") or "item").strip().lower()
    if parent_type != "item":
        raise ValueError("relation must point to an item QR")
    parent_packing = (parent.get("packing_user") or "").strip()
    if parent_packing != packing_user:
        raise ValueError("relation item belongs to a different packing user")


def get_pending_by_packing_user(packing_user: str) -> list[dict]:
    username = (packing_user or "").strip()
    if not username:
        raise ValueError("packing_user is required")
    keys = cache_scan_keys(f"inbound:pending:user:{username}:*")
    if not keys:
        return []
    values = get_redis().mget(keys)
    stocks = [
        _normalize_assigned_stock(json.loads(raw))
        for raw in values if raw
    ]
    return [stock for stock in stocks if _is_linked_pack_pending(stock)]


def assign_for_packing_user(
    db: Session,
    warehouse_id: Optional[int] = None,
    qr_code: Optional[str] = None,
    quantity: Optional[int] = None,
    unit_id: Optional[int] = None,
    lot_number: Optional[str] = None,
    cavity_number: Optional[str] = None,
    manufacturing_user: Optional[str] = None,
    qc_user: Optional[str] = None,
    packing_user: Optional[str] = None,
    relation: Optional[int] = None,
) -> dict:
    qr_record = get_qr_code_by_code(db, qr_code)
    if qr_record is None:
        raise ValueError("Invalid QR code")
    if not _qr_type_needs_qc_packing(qr_record.qr_type):
        raise ValueError("Only item or pack QR codes can be cached for packing")


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

    needs_qc_packing = _qr_type_needs_qc_packing(getattr(qr_record, "qr_type", None))
    resolved_manufacturing = (manufacturing_user or "").strip() or None
    resolved_qc = (qc_user or "").strip() or None
    resolved_packing = (packing_user or "").strip() or None
    if not resolved_manufacturing:
        raise ValueError("manufacturing_user is required when assigning a QR code to a location")
    if needs_qc_packing:
        if not resolved_qc:
            raise ValueError("qc_user is required for item or pack QR")
        if not resolved_packing:
            raise ValueError("packing_user is required for item or pack QR")
   
    cache_payload = {
        "warehouse_id": warehouse_id,
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
        "stock_level": _stock_level_for_qr_type(qr_record.qr_type),
    }
    if needs_qc_packing:
        cache_payload["qc_user"] = resolved_qc
        cache_payload["packing_user"] = resolved_packing

    qr_type = (qr_record.qr_type or "item").strip().lower()
    if qr_type == "item":
        cache_payload["relation"] = None
    elif qr_type == "pack":
        if relation is None:
            raise ValueError("relation is required for pack QR")
        resolved_relation = int(relation)
        _validate_pack_relation(
            pack_qr_id=qr_record.id,
            relation=resolved_relation,
            packing_user=resolved_packing or "",
        )
        cache_payload["relation"] = resolved_relation
    else:
        raise ValueError("Only item or pack QR codes can be cached for packing")

    # logger.info(f"Caching pending for QR {qr_record.id} with payload: {cache_payload}")

    cache_set(
        f"inbound:pending:qr:{qr_record.id}",
        cache_payload,
        ttl=-1,
    )
    
    cache_set(
        f"inbound:pending:user:{resolved_packing}:{qr_record.id}",
        cache_payload,
        ttl=-1,
    )
    return {
        "action": AssignOrGetItemStockAction.PENDING_CACHED,
        "pending": {
            "qr_code_id": qr_record.id,
            "code": qr_record.code,
            "part_number": item.sku if item else "",
            "item_name": item.name if item else "",
        },
    }

def assign_or_get_item_stock(
    db: Session,
    raw: Optional[str] = None,
    warehouse_id: Optional[int] = None,
    qr_code: Optional[str] = None,
    quantity: Optional[int] = None,
    unit_id: Optional[int] = None,
    lot_number: Optional[str] = None,
    cavity_number: Optional[str] = None,
    manufacturing_user: Optional[str] = None,
    qc_user: Optional[str] = None,
    packing_user: Optional[str] = None,
) -> dict:
    qr_record = get_qr_code_by_code(db, qr_code)
    location = _resolve_location(db, raw, warehouse_id)

    # Product QR only (first scan or anchor refresh)
    if qr_record is not None and location is None:
        return _preview_result(qr_record)

    # Location-only scan (no product context)
    if qr_record is None:
        if location is None:
            location = _resolve_location(db, qr_code, warehouse_id)
        if location is None:
            raise ValueError("Invalid QR code or location not found")
        return _location_stocks_result(get_assigned_item_stock(db, location.id))

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

    needs_qc_packing = _qr_type_needs_qc_packing(getattr(qr_record, "qr_type", None))
    resolved_manufacturing = (manufacturing_user or "").strip() or None
    resolved_qc = (qc_user or "").strip() or None
    resolved_packing = (packing_user or "").strip() or None
    if not resolved_manufacturing:
        raise ValueError("manufacturing_user is required when assigning a QR code to a location")
    if needs_qc_packing:
        if not resolved_qc:
            raise ValueError("qc_user is required for item or pack QR")
        if not resolved_packing:
            raise ValueError("packing_user is required for item or pack QR")

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
        "stock_level": _stock_level_for_qr_type(qr_record.qr_type),
    }
    if needs_qc_packing:
        cache_payload["qc_user"] = resolved_qc
        cache_payload["packing_user"] = resolved_packing

    cache_set(
        f"inbound:assign:location:{location.id}:{qr_record.id}",
        cache_payload,
        ttl=-1,
    )
    return _assigned_result(
        part_number=item.sku if item else "",
        location=location.location_name,
    )

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
            f"Location already has QR type '{existing_type}', "
            f"cannot assign QR type '{incoming_type}'"
        )

def _clear_previous_qr_assign(qr_id: int) -> None:
    r = get_redis()
    
    for key in cache_scan_keys(f"inbound:assign:location:*:{qr_id}"):
        r.delete(key)


def get_assigned_item_stock(db: Session, location_id: int) -> list[dict]:
    logger.info(f"Getting assigned item stock for location {location_id}")
    location = db.query(Location).filter(Location.id == location_id).first()
    if not location or not location.zone:
        return []

    if location.zone.code != "Zone_1.1":
        return []

    keys = cache_scan_keys(f"inbound:assign:location:{location_id}:*")
    if not keys:
        return []
    r = get_redis()
    values = r.mget(keys)
    stocks = [_normalize_assigned_stock(json.loads(raw)) for raw in values if raw]
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
    from_location = db.query(Location).filter(Location.location_code == from_location_code, Location.warehouse_id == 1).first()
    to_location = db.query(Location).filter(Location.location_code == to_location_code, Location.warehouse_id == 1).first()
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