from __future__ import annotations

from collections import defaultdict
from io import BytesIO
from typing import Any, Optional
from sqlalchemy import func, Integer, cast

from app.core.config import settings
from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.cache import cache_set, cache_get, cache_scan_keys, cache_delete
from app.modules.masan.masan_outbound_excel import (
    COLUMN_ALIASES,
    DATA_START_ROW,
    HEADER_ROW,
    TRIP_PLACEHOLDERS,
)
from app.modules.robot.robot_model import RobotTask
from app.modules.warehouse.outbound_order.outbound_order_schema import (
     AllocationOutboundTaskExecute,
    CalculateOutboundDetail,
    DetailForCalculate,
    OutboundRobotTaskCreate,
)
from app.modules.warehouse.outbound_order.outbound_order_service import (
    calculate_outbound_order,
    execute_outbound_task,
    _settle_outbound_stock,
)
from app.modules.masan.masan_outbound_so_excel import (
    build_so_customer_sheet,
    sanitize_sheet_name,
)
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrder,
    OutboundOrderAllocation,
    OutboundOrderDetail,
)
from app.modules.masan.masan_schema import (
    MasanOutboundLineItem,
    MasanOutboundParseResponse,
    MasanOutboundPreviewRow,
)
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.lot_number_utils import parse_legacy_lot_number
from app.modules.warehouse.warehouse_zone.warehouse_model import Zone
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists
from app.core.logger import get_logger
from app.socket.ws_events import (
    EVENT_MASAN_SORTING_STOCK_READY,
    publish_masan_sorting_zone,
)

logger = get_logger("main")


def _normalize_header(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _build_column_map(header_row: list[Any]) -> dict[str, int]:
    col_map: dict[str, int] = {}
    for idx, cell in enumerate(header_row):
        name = _normalize_header(cell)
        for field, aliases in COLUMN_ALIASES.items():
            if name in aliases:
                col_map[field] = idx
    return col_map


def _direct(row: list[Any], col_map: dict[str, int], field: str) -> Optional[str]:
    idx = col_map.get(field)
    if idx is None or idx >= len(row) or row[idx] in (None, ""):
        return None
    return str(row[idx]).strip()


def _normalize_trip(value: Optional[str], carry: Optional[str]) -> Optional[str]:
    if value is None:
        return carry
    cleaned = value.strip()
    if not cleaned or cleaned in TRIP_PLACEHOLDERS:
        return carry
    return cleaned


def _cell_value(
    row: list[Any],
    col_map: dict[str, int],
    field: str,
    carry: dict[str, str],
) -> Optional[str]:
    idx = col_map.get(field)
    if idx is None:
        return carry.get(field)

    raw = row[idx] if idx < len(row) else None
    if raw is None or str(raw).strip() == "":
        return carry.get(field)

    value = str(raw).strip()
    if field == "trip":
        normalized = _normalize_trip(value, carry.get(field))
        if normalized:
            carry[field] = normalized
        return normalized

    carry[field] = value
    return value


def _parse_quantity(raw: Any) -> tuple[int, Optional[str]]:
    if raw in (None, ""):
        return 0, "Số lượng trống"
    try:
        qty = int(float(str(raw).replace(",", "")))
    except (TypeError, ValueError):
        return 0, f"Số lượng không hợp lệ: {raw!r}"
    if qty <= 0:
        return qty, "Số lượng phải lớn hơn 0"
    return qty, None


def _validate_lot(raw: Optional[str], outbound_type: str) -> Optional[str]:
    if raw is None or str(raw).strip() == "":
        return None
    lot = str(raw).strip()
    if outbound_type == "auto":
        try:
            parse_legacy_lot_number(lot)
        except ValueError as exc:
            return str(exc)
    return None


def parse_masan_outbound_rows(content: bytes) -> list[dict[str, Any]]:
    wb = load_workbook(BytesIO(content), data_only=True)
    ws = wb.active

    header_row = [ws.cell(HEADER_ROW, c).value for c in range(1, ws.max_column + 1)]
    col_map = _build_column_map(header_row)

    if "sku" not in col_map:
        raise ValueError('Không tìm thấy cột "Mã Item" ở hàng 2')

    rows: list[dict[str, Any]] = []
    carry: dict[str, str] = {}

    for row_idx in range(DATA_START_ROW, ws.max_row + 1):
        row = [ws.cell(row_idx, c).value for c in range(1, ws.max_column + 1)]

        sku_raw = row[col_map["sku"]] if col_map["sku"] < len(row) else None
        if sku_raw is None or str(sku_raw).strip() == "":
            continue

        qty_idx = col_map.get("quantity")
        quantity_raw = row[qty_idx] if qty_idx is not None and qty_idx < len(row) else None
        quantity, qty_error = _parse_quantity(quantity_raw)

        rows.append(
            {
                "row_no": row_idx,
                "vehicle_no": _cell_value(row, col_map, "vehicle_no", carry),
                "customer_name": _cell_value(row, col_map, "customer_name", carry),
                "trip": _cell_value(row, col_map, "trip", carry),
                "nvt": _cell_value(row, col_map, "nvt", carry),
                "sku": str(sku_raw).strip(),
                "item_name": _direct(row, col_map, "item_name"),
                "lot": _direct(row, col_map, "lot"),
                "lot_status": _direct(row, col_map, "lot_status"),
                "quantity": quantity,
                "quantity_error": qty_error,
                "pallet_count": _direct(row, col_map, "pallet_count"),
                "locator": _direct(row, col_map, "locator"),
            }
        )

    if not rows:
        raise ValueError("Không có dòng hợp lệ trong file Excel")

    return rows


def _lookup_item(db: Session, warehouse_id: int, sku: str) -> Optional[Item]:
    return (
        db.query(Item)
        .filter(
            Item.warehouse_id == warehouse_id,
            Item.sku == sku,
            Item.is_active.is_(True),
        )
        .first()
    )


def _build_line_item_details(row: dict[str, Any]) -> dict[str, Any]:
    details: dict[str, Any] = {}
    for key in (
        "vehicle_no",
        "customer_name",
        "trip",
        "nvt",
        "lot_status",
        "pallet_count",
        "locator",
    ):
        value = row.get(key)
        if value is not None and str(value).strip() != "":
            details[key] = value
    lot = row.get("lot")
    if lot is not None and str(lot).strip() != "":
        details["lot_number"] = str(lot).strip()
    return details


def parse_masan_outbound_preview(
    db: Session,
    *,
    warehouse_id: int,
    content: bytes,
    outbound_type: str,
) -> MasanOutboundParseResponse:
    _ensure_warehouse_exists(db, warehouse_id)

    parsed_rows = parse_masan_outbound_rows(content)
    sku_cache: dict[str, Optional[Item]] = {}

    preview_rows: list[MasanOutboundPreviewRow] = []
    line_items: list[MasanOutboundLineItem] = []
    warnings: list[str] = []
    invalid_count = 0

    for row in parsed_rows:
        sku = row["sku"]
        if sku not in sku_cache:
            sku_cache[sku] = _lookup_item(db, warehouse_id, sku)

        item = sku_cache[sku]
        lot_raw = row.get("lot")

        errors: list[str] = []
        if row.get("quantity_error"):
            errors.append(row["quantity_error"])
        if item is None:
            errors.append(f"Không tìm thấy sản phẩm SKU '{sku}' trong kho")
        lot_error = _validate_lot(lot_raw, outbound_type)
        if lot_error:
            errors.append(lot_error)

        preview_rows.append(
            MasanOutboundPreviewRow(
                row_no=row["row_no"],
                vehicle_no=row.get("vehicle_no"),
                customer_name=row.get("customer_name"),
                trip=row.get("trip"),
                nvt=row.get("nvt"),
                sku=sku,
                item_name=row.get("item_name"),
                lot_number=str(lot_raw).strip() if lot_raw not in (None, "") else None,
                lot_status=row.get("lot_status"),
                quantity=row.get("quantity") or 0,
                pallet_count=row.get("pallet_count"),
                locator=row.get("locator"),
                item_id=item.id if item else None,
                unit_id=item.base_unit_id if item else None,
                error="; ".join(errors) if errors else None,
            )
        )

        if errors or item is None:
            invalid_count += 1
            continue

        line_items.append(
            MasanOutboundLineItem(
                item_id=item.id,
                quantity=row["quantity"],
                unit_id=item.base_unit_id,
                detail_type=outbound_type,
                details=_build_line_item_details(row),
            )
        )

    if not line_items:
        raise ValueError(
            "Không có dòng hợp lệ để tạo đơn xuất. "
            "Kiểm tra SKU, số lượng và LOT trong file."
        )

    if invalid_count:
        warnings.append(f"{invalid_count} dòng bị bỏ qua khỏi payload tạo đơn")

    return MasanOutboundParseResponse(
        preview_rows=preview_rows,
        line_items=line_items,
        total_rows=len(preview_rows),
        valid_rows=len(preview_rows) - invalid_count,
        invalid_rows=invalid_count,
        warnings=warnings,
    )


def _unique_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = value.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        result.append(cleaned)
    return result


def _resolve_locator(detail: OutboundOrderDetail) -> str:
    outbound_allocs = [
        alloc
        for alloc in detail.allocations
        if alloc.allocation_type == "outbound"
    ]
    if outbound_allocs:
        locations: list[str] = []
        seen: set[str] = set()
        for alloc in sorted(outbound_allocs, key=lambda a: a.id):
            loc = alloc.from_location
            label = (
                loc.location_name or loc.location_code
                if loc
                else None
            )
            if label and label not in seen:
                seen.add(label)
                locations.append(label)
        if locations:
            return ", ".join(locations)

    meta = detail.details or {}
    locator = meta.get("locator")
    if locator and str(locator).strip():
        return str(locator).strip()

    return "..."


def _customer_group_key(detail: OutboundOrderDetail) -> str:
    meta = detail.details or {}
    name = str(meta.get("customer_name") or "").strip()
    return name or "Unknown"


def _build_so_data_row(detail: OutboundOrderDetail, stt: int) -> list[Any]:
    meta = detail.details or {}
    lot_status = meta.get("lot_status")
    if not lot_status or str(lot_status).strip() == "":
        lot_status = "GOOD"
    pallet_count = meta.get("pallet_count")
    return [
        stt,
        detail.item.sku if detail.item else "",
        detail.item.name if detail.item else "",
        meta.get("lot_number"),
        lot_status,
        detail.quantity,
        pallet_count if pallet_count not in (None, "") else None,
        _resolve_locator(detail),
    ]


def export_outbound_order_so(db: Session, order_id: int) -> tuple[bytes, str]:
    order = (
        db.query(OutboundOrder)
        .filter(OutboundOrder.id == order_id)
        .first()
    )
    if not order:
        raise ValueError(f"Outbound order {order_id} not found")

    details = (
        db.query(OutboundOrderDetail)
        .options(
            joinedload(OutboundOrderDetail.item),
            selectinload(OutboundOrderDetail.allocations).joinedload(
                OutboundOrderAllocation.from_location
            ),
        )
        .filter(OutboundOrderDetail.outbound_order_id == order.id)
        .order_by(OutboundOrderDetail.id)
        .all()
    )
    if not details:
        raise ValueError("Outbound order has no details to export")

    grouped: dict[str, list[OutboundOrderDetail]] = defaultdict(list)
    for detail in details:
        grouped[_customer_group_key(detail)].append(detail)

    wb = Workbook()
    default_ws = wb.active
    wb.remove(default_ws)

    used_sheet_names: set[str] = set()
    for customer_name in sorted(grouped.keys(), key=lambda name: (name == "Unknown", name)):
        customer_details = grouped[customer_name]
        sheet_name = sanitize_sheet_name(customer_name, used=used_sheet_names)
        ws = wb.create_sheet(title=sheet_name)

        trips: list[str] = []
        vehicles: list[str] = []
        nvts: list[str] = []
        for detail in customer_details:
            meta = detail.details or {}
            for key, bucket in (
                ("trip", trips),
                ("vehicle_no", vehicles),
                ("nvt", nvts),
            ):
                value = meta.get(key)
                if value is not None and str(value).strip() != "":
                    bucket.append(str(value).strip())

        data_rows = [
            _build_so_data_row(detail, stt)
            for stt, detail in enumerate(
                sorted(customer_details, key=lambda d: d.id),
                start=1,
            )
        ]
        build_so_customer_sheet(
            ws,
            customer_name=customer_name,
            trips=_unique_keep_order(trips),
            vehicles=_unique_keep_order(vehicles),
            nvts=_unique_keep_order(nvts),
            data_rows=data_rows,
        )

    buffer = BytesIO()
    wb.save(buffer)
    filename = f"{order.order_code}_LayHangSO.xlsx"
    return buffer.getvalue(), filename

def _resolve_line_sku(detail: OutboundOrderDetail, meta: dict[str, Any]) -> str | None:
    raw = meta.get("sku")
    if raw is not None and str(raw).strip() != "":
        return str(raw).strip()
    item = detail.item
    if item is not None and item.sku:
        return item.sku
    return None


def _sku_from_allocation(allocation: OutboundOrderAllocation) -> str | None:
    detail = allocation.outbound_order_detail
    if detail is not None:
        meta = detail.details if isinstance(detail.details, dict) else {}
        resolved = _resolve_line_sku(detail, meta)
        if resolved:
            return resolved
    stock = allocation.item_stock
    if stock is not None and stock.item is not None and stock.item.sku:
        return str(stock.item.sku).strip() or None
    return None


def _enrich_stock_ready_payloads(
    db: Session,
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not rows:
        return rows
    missing_ids: list[int] = []
    for row in rows:
        sku = row.get("sku")
        if sku is not None and str(sku).strip() != "":
            continue
        raw_id = row.get("id")
        if raw_id is not None:
            missing_ids.append(int(raw_id))
    if not missing_ids:
        return rows
    allocations = (
        db.query(OutboundOrderAllocation)
        .options(
            joinedload(OutboundOrderAllocation.outbound_order_detail).joinedload(
                OutboundOrderDetail.item
            ),
            joinedload(OutboundOrderAllocation.item_stock).joinedload(ItemStock.item),
        )
        .filter(OutboundOrderAllocation.id.in_(missing_ids))
        .all()
    )
    sku_by_id = {a.id: _sku_from_allocation(a) for a in allocations}
    enriched: list[dict[str, Any]] = []
    for row in rows:
        copy = dict(row)
        if not (copy.get("sku") and str(copy.get("sku")).strip()):
            alloc_id = copy.get("id")
            if alloc_id is not None:
                sku = sku_by_id.get(int(alloc_id))
                if sku:
                    copy["sku"] = sku
        enriched.append(copy)
    return enriched


def _enrich_cc_cache_lines_skus(
    db: Session,
    warehouse_id: int,
    lines: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not lines:
        return lines

    missing_item_ids: list[int] = []
    for line in lines:
        sku = line.get("sku")
        if sku is not None and str(sku).strip() != "":
            continue
        raw_id = line.get("item_id")
        if raw_id is None:
            continue
        item_id = int(raw_id)
        if item_id not in missing_item_ids:
            missing_item_ids.append(item_id)

    sku_by_item_id: dict[int, str] = {}
    if missing_item_ids:
        rows = (
            db.query(Item.id, Item.sku)
            .filter(
                Item.id.in_(missing_item_ids),
                Item.warehouse_id == warehouse_id,
            )
            .all()
        )
        sku_by_item_id = {row.id: row.sku for row in rows if row.sku}

    enriched: list[dict[str, Any]] = []
    for line in lines:
        merged = dict(line)
        sku = merged.get("sku")
        if sku is None or str(sku).strip() == "":
            raw_id = merged.get("item_id")
            if raw_id is not None:
                resolved = sku_by_item_id.get(int(raw_id))
                if resolved:
                    merged["sku"] = resolved
        enriched.append(merged)
    return enriched


def _detail_to_cache_line(detail: OutboundOrderDetail) -> dict[str, Any]:
    meta = detail.details if isinstance(detail.details, dict) else {}
    return {
        "detail_id": detail.id,
        "outbound_order_id": detail.outbound_order_id,
        "item_id": detail.item_id,
        "quantity": detail.quantity,
        "unit": detail.unit,
        "detail_type": detail.detail_type,
        # BM.04 / Masan thường nằm trong JSON cột details
        "vehicle_no": meta.get("vehicle_no"),
        "customer_name": meta.get("customer_name"),
        "sku": _resolve_line_sku(detail, meta),
        "trip": meta.get("trip"),
        "nvt": meta.get("nvt"),
        "lot_number": meta.get("lot_number"),
        "pallet_count": meta.get("pallet_count"),
    }

def assign_cc_zone(db: Session, warehouse_id: int) -> None:                     
    keys = cache_scan_keys(f"outbound:assigned_cc_location:{warehouse_id}:*")
    existed_locations: list[str] = []
    for key in keys:
        suffix = key.rsplit(":", 1)[-1]
        if suffix.isdigit():
            existed_locations.append(int(suffix))

    logger.info(f"Existed locations: {existed_locations}")

    numeric_suffix = cast(func.right(Location.location_name, 3), Integer)
    available_locations = (
        db.query(Location)
        .join(Zone, Zone.id == Location.zone_id)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.is_active.is_(True),
            Zone.code.in_(settings.zone_cc),
            ~Location.id.in_(existed_locations),
        )
        .order_by(numeric_suffix.asc(), Location.location_name.asc())
        .all()
    )

    logger.info(f"Available locations: {available_locations}")

    if not available_locations:
        return
    
    _ensure_warehouse_exists(db, warehouse_id)
    available_orders = db.query(OutboundOrder).filter(
        OutboundOrder.status != "completed",
        OutboundOrder.warehouse_id == warehouse_id
    ).all()
    if not available_orders:
        return
    order_ids = [o.id for o in available_orders]

    keys = cache_scan_keys(f"outbound:assigned_cc_details:{warehouse_id}:*")
    assigned_ids: list[int] = []
    for key in keys:
        suffix = key.rsplit(":", 1)[-1]
        if suffix.isdigit():
            assigned_ids.append(int(suffix))

    list_details = (
        db.query(OutboundOrderDetail)
        .options(joinedload(OutboundOrderDetail.item))
        .filter(
            OutboundOrderDetail.outbound_order_id.in_(order_ids),
            OutboundOrderDetail.status == "initialize",
            ~OutboundOrderDetail.id.in_(assigned_ids),
        )
        .all()
    )

    details_by_vehicle: dict[str, list] = defaultdict(list)
    reversed_vehicles_list = []
    for detail in list_details:
        meta = detail.details if isinstance(detail.details, dict) else {}
        raw = meta.get("vehicle_no")
        vehicle_number = str(raw).strip() if raw is not None else ""
        if not vehicle_number:
            vehicle_number = "no_vehicle"
        line = _detail_to_cache_line(detail)
        details_by_vehicle[vehicle_number].append(line)
        if vehicle_number not in reversed_vehicles_list:
            reversed_vehicles_list.append(vehicle_number)

    i = 0
    while i < len(available_locations) and i < len(reversed_vehicles_list):
        key = f"outbound:assigned_cc_location:{warehouse_id}:{available_locations[i].id}"
        lines = details_by_vehicle[reversed_vehicles_list[i]]
        for line in lines:
            cache_data = {
                "zone": available_locations[i].zone.code,
                "location_id": available_locations[i].id,
            }
            cache_set(f"outbound:assigned_cc_details:{warehouse_id}:{line['detail_id']}", cache_data, -1)
        cache_set(key, {"zone": available_locations[i].zone.code, "vehicle_number": reversed_vehicles_list[i], "lines": lines}, -1)
        i += 1

    
def get_sorting_data_for_zone(
    db: Session,
    warehouse_id: int,
    location_id: int,
) -> Optional[dict[str, Any]]:
    bucket = cache_get(f"outbound:assigned_cc_location:{warehouse_id}:{location_id}")
    if not bucket:
        return None

    raw_lines = bucket.get("lines") or []
    detail_ids = [
        int(line["detail_id"])
        for line in raw_lines
        if line.get("detail_id") is not None
    ]

    status_by_id: dict[int, str] = {}
    if detail_ids:
        detail_rows = (
            db.query(OutboundOrderDetail)
            .filter(OutboundOrderDetail.id.in_(detail_ids))
            .all()
        )
        status_by_id = {row.id: row.status for row in detail_rows}

    enriched_lines: list[dict[str, Any]] = []
    for line in raw_lines:
        merged = dict(line)
        detail_id = merged.get("detail_id")
        if detail_id is not None:
            merged["status"] = status_by_id.get(int(detail_id), "initialize")
        else:
            merged["status"] = None
        enriched_lines.append(merged)

    enriched_lines = _enrich_cc_cache_lines_skus(
        db, warehouse_id, enriched_lines
    )

    return {
        "zone": bucket.get("zone"),
        "vehicle_number": bucket.get("vehicle_number"),
        "lines": enriched_lines,
    }

def get_item_needed_to_sorting(
    db: Session, warehouse_id: int, zone: str
) -> dict[str, Any]:
    keys = cache_scan_keys(f"outbound:assigned_cc_location:{warehouse_id}:*")
    list_lines_raw: list[dict[str, Any]] = []
    for key in keys:
        suffix = key.rsplit(":", 1)[-1]
        if suffix.isdigit():
            location_id = int(suffix)
            bucket = cache_get(f"outbound:assigned_cc_location:{warehouse_id}:{location_id}")
            if bucket and bucket.get("zone") == zone:
                lines = bucket.get("lines") or []
                list_item_ids = [line.get("detail_id") for line in lines]
                list_lines_raw.extend(list_item_ids)

    list_lines_raw = db.query(OutboundOrderDetail).filter(
        OutboundOrderDetail.id.in_(list_lines_raw),
    ).all()

    list_lines = [line for line in list_lines_raw if line.status == "initialize"]

    qty_by_item_id: dict[int, int] = defaultdict(int)
    item_ids: list[int] = []
    for line in list_lines:
        item_id = line.item_id
        qty_by_item_id[item_id] += int(line.quantity or 0)
        if item_id not in item_ids:
            item_ids.append(item_id)

    # logger.info(f"Item ids: {item_ids}")
    detail_ids = [d.id for d in list_lines_raw]
    if detail_ids:
        allocations = (
            db.query(OutboundOrderAllocation)
            .filter(
                OutboundOrderAllocation.outbound_order_detail_id.in_(detail_ids),
                OutboundOrderAllocation.robot_task_id.isnot(None),
            )
            .all()
        )
        by_task: dict[int, list[OutboundOrderAllocation]] = defaultdict(list)
        excluded_list = []
        for alloc in allocations:
            if alloc.robot_task_id in excluded_list:
                continue
            if alloc.allocation_type == "outbound" and alloc.status != "completed":
                excluded_list.append(alloc.robot_task_id)
                continue
            if alloc.allocation_type == "return":
                by_task[alloc.robot_task_id].append(alloc)
    else:
        by_task = {}

    if not item_ids:
        return {
            "warehouse_id": warehouse_id,
            "zone": zone,
            "items": [],
            "line_count": len(list_lines),
            "return_tasks": by_task,
        }

    item_rows = (
        db.query(Item)
        .filter(Item.id.in_(item_ids), Item.warehouse_id == warehouse_id)
        .all()
    )
    item_by_id = {row.id: row for row in item_rows}

    items_payload: list[dict[str, Any]] = []
    for item_id in item_ids:
        item = item_by_id.get(item_id)
        if not item:
            continue
        items_payload.append(
            {
                "item_id": item_id,
                "sku": item.sku,
                "item_name": item.name,
                "total_quantity": qty_by_item_id[item_id],
            }
        )

    logger.info(f"Items payload: {items_payload}")
    return {
        "warehouse_id": warehouse_id,
        "zone": zone,
        "items": items_payload,
        "line_count": len(list_lines),
        "return_tasks": by_task,
    }

def sending_masan_outbound_task(db: Session, warehouse_id: int, zone: str, item_id: int, to_location_id: int):
    
    # Need optimize
    keys = cache_scan_keys(f"outbound:assigned_cc_location:{warehouse_id}:*")
    list_lines: list[dict[str, Any]] = []
    for key in keys:
        suffix = key.rsplit(":", 1)[-1]
        if suffix.isdigit():
            location_id = int(suffix)
            bucket = cache_get(f"outbound:assigned_cc_location:{warehouse_id}:{location_id}")
            if bucket and bucket.get("zone") == zone:
                lines = bucket.get("lines") or []
                for line in lines:
                    if line.get("item_id") == item_id:
                        list_lines.append(line["detail_id"])

    list_lines_db = db.query(OutboundOrderDetail).filter(
        OutboundOrderDetail.id.in_(list_lines),
        OutboundOrderDetail.status == "initialize"
    ).all()

    
    if len(list_lines_db) > 0:
        details_by_order: dict[int, list[OutboundOrderDetail]] = defaultdict(list)
        for detail in list_lines_db:
            details_by_order[detail.outbound_order_id].append(detail)
        calculate_bodies: list[CalculateOutboundDetail] = []
        for order_id, details in details_by_order.items():
            line_items = [
                DetailForCalculate(
                    id=d.id,
                    item_id=d.item_id,
                    quantity=int(d.quantity),
                    detail_type=d.detail_type,
                    details=d.details if isinstance(d.details, dict) else {},
                )
                for d in details
            ]
            calculate_bodies.append(
                CalculateOutboundDetail(
                    warehouse_id=warehouse_id,
                    outbound_order_id=order_id,
                    line_items=line_items,
                )
            )
        
        results: list[dict[str, Any]] = []
        for body in calculate_bodies:
            response_caculate = calculate_outbound_order(db, body, strategy="fefo")
            results.append({
                "outbound_order_id": response_caculate.outbound_order_id,
                "is_fully_allocated": response_caculate.is_fully_allocated,
                "lacked": [x.model_dump() for x in response_caculate.lacked],
            })

    # logger.info(f"Results: {list_lines}")

    picked_allocation = (
        db.query(OutboundOrderAllocation)
        .options(joinedload(OutboundOrderAllocation.outbound_order_detail))
        .filter(
            OutboundOrderAllocation.outbound_order_detail_id.in_(list_lines),
            OutboundOrderAllocation.status == "initialize",
            OutboundOrderAllocation.allocation_type == "outbound",
            OutboundOrderAllocation.robot_task_id.isnot(None),
        )
        .first()
    )

    # logger.info(f"Picked allocation: {picked_allocation.model_dump()}")

    if not picked_allocation:
        return

    robot_task_id = picked_allocation.robot_task_id
    _pack_and_execute_robot_task(db, robot_task_id, picked_allocation, to_location_id)
    
    if results:
        all_lacked = [
            row
            for r in results
            for row in r["lacked"]
        ]
    else:
        all_lacked = []
    return {
        "warehouse_id": warehouse_id,
        "zone": zone,
        "item_id": item_id,
        "lacked": all_lacked,
    }

def _pack_and_execute_robot_task(db: Session, robot_task_id: int, picked_allocation: OutboundOrderAllocation, to_location_id: int) -> None: 
    robot_task = db.query(RobotTask).filter(RobotTask.id == robot_task_id).first()
    if not robot_task:
        return

    task_allocations = (
        db.query(OutboundOrderAllocation)
        .filter(
            OutboundOrderAllocation.robot_task_id == robot_task_id,
            OutboundOrderAllocation.status == "initialize",
            OutboundOrderAllocation.allocation_type == "outbound",
        )
        .order_by(OutboundOrderAllocation.id)
        .all()
    )
    if not task_allocations:
        return
    
    from_location_id = picked_allocation.from_location_id
    if from_location_id is None:
        stock = picked_allocation.item_stock
        from_location_id = stock.location_id if stock else None
    if not from_location_id or not to_location_id:
        raise ValueError("From location or to location is not set")

    execute_body = OutboundRobotTaskCreate(
        order_id=robot_task.order_id,
        from_location_id=from_location_id,
        to_location_id=to_location_id,
        allocations=[
            AllocationOutboundTaskExecute(allocation_id=a.id)
            for a in task_allocations
        ],
    )
    execute_outbound_task(db, execute_body, detail_type="auto")

def _apply_clear_outbound_masan_details(
    db: Session,
    warehouse_id: int,
    zone: str,
    location_id: int,
    detail_id: int,
) -> None:
    detail_id = int(detail_id)
    location_id = int(location_id)
    zone = (zone or "").strip()

    cache_delete(f"outbound:assigned_cc_details:{warehouse_id}:{detail_id}")

    loc_key = f"outbound:assigned_cc_location:{warehouse_id}:{location_id}"
    bucket = cache_get(loc_key)
    if not bucket:
        return

    if (bucket.get("zone") or "").strip() != zone:
        logger.warning(
            "CC cache zone mismatch warehouse_id=%s location_id=%s expected=%r got=%r",
            warehouse_id,
            location_id,
            zone,
            bucket.get("zone"),
        )

    lines = bucket.get("lines") or []
    new_lines = [
        line
        for line in lines
        if line.get("detail_id") is not None and int(line["detail_id"]) != detail_id
    ]
    if len(new_lines) == len(lines):
        return

    if not new_lines:
        cache_delete(loc_key)
    else:
        cache_set(loc_key, {**bucket, "lines": new_lines}, -1)

def get_sorting_zone_pending_stock(
    db: Session,
    warehouse_id: int,
    zone: str,
    *,
    republish: bool = False,
) -> dict[str, Any]:
    zone_norm = (zone or "").strip()
    if not zone_norm:
        raise ValueError("Zone is required")

    by_location: dict[int, list[dict[str, Any]]] = defaultdict(list)
    seen_keys: set[str] = set()
    pattern = f"outbound:masan:stock_ready:{warehouse_id}:{zone_norm}:*"

    for scanned in cache_scan_keys(pattern):
        parts = scanned.rsplit(":", 2)
        if len(parts) < 3:
            continue
        try:
            allocation_id = int(parts[-2])
            location_id = int(parts[-1])
        except ValueError:
            continue
        logical_key = (
            f"outbound:masan:stock_ready:{warehouse_id}:{zone_norm}:"
            f"{allocation_id}:{location_id}"
        )
        if logical_key in seen_keys:
            continue
        seen_keys.add(logical_key)
        payload = cache_get(logical_key)
        if not isinstance(payload, dict):
            continue
        by_location[location_id].append(payload)

    name_by_id: dict[int, str | None] = {}
    if by_location:
        for loc in (
            db.query(Location)
            .filter(
                Location.id.in_(list(by_location.keys())),
                Location.warehouse_id == warehouse_id,
            )
            .all()
        ):
            name_by_id[loc.id] = (loc.location_name or "").strip() or None

    locations_payload: list[dict[str, Any]] = []
    for loc_id in sorted(by_location.keys()):
        locations_payload.append(
            {
                "location_id": loc_id,
                "location_name": name_by_id.get(loc_id),
                "allocations": _enrich_stock_ready_payloads(db, by_location[loc_id]),
            }
        )

    published_events = 0
    if republish:
        detail_payloads: dict[int, list[dict[str, Any]]] = defaultdict(list)
        detail_location: dict[int, int] = {}
        for loc_id, rows in by_location.items():
            for row in rows:
                raw_detail = row.get("outbound_order_detail_id")
                if raw_detail is None:
                    continue
                detail_id = int(raw_detail)
                detail_payloads[detail_id].append(row)
                detail_location[detail_id] = loc_id
        for detail_id, payloads in detail_payloads.items():
            publish_masan_sorting_zone(
                warehouse_id,
                zone_norm,
                event_type=EVENT_MASAN_SORTING_STOCK_READY,
                data={
                    "location_id": detail_location[detail_id],
                    "detail_id": detail_id,
                    "details": payloads,
                },
            )
            published_events += 1

    return {
        "warehouse_id": warehouse_id,
        "zone": zone_norm,
        "locations": locations_payload,
        "published_events": published_events,
    }


def confirm_allocation_outbound(db: Session, warehouse_id: int, zone: str, location_id: int, allocation_id: int, quantity: int) -> None:

    target_allocation = db.query(OutboundOrderAllocation).filter(
        OutboundOrderAllocation.id == allocation_id,
    ).first()

    if not target_allocation:
        raise ValueError(f"Allocation {allocation_id} not found")
    
    target_allocation.quantity = quantity
    target_allocation.status = "confirmed"
    cache_delete(
        f"outbound:masan:stock_ready:{warehouse_id}:{zone}:{allocation_id}:{location_id}"
    )
    stock_id = target_allocation.item_stock_id

    allocations = db.query(OutboundOrderAllocation).filter(
        OutboundOrderAllocation.item_stock_id == stock_id,
        OutboundOrderAllocation.allocation_type == "outbound",
    ).all()

    for allocation in allocations:
        if allocation.status != "confirmed":
            return

    _settle_outbound_stock(db, allocations)

    detail = target_allocation.outbound_order_detail
    if not detail:
        raise ValueError(f"Detail {detail.id} not found")
    
    db.refresh(detail)
    
    if detail.status == "completed":
        _apply_clear_outbound_masan_details(db, warehouse_id, zone, location_id, detail.id)

    
def _send_taking_stock(db: Session, robot_task_id: int, allocations: list[OutboundOrderAllocation]) -> None:
    logger.info(f"Sending taking stock for robot task {robot_task_id}")
    
    sending_payloads: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for allocation in allocations:
        detail = allocation.outbound_order_detail
        if not detail:
            continue
        warehouse_id = detail.outbound_order.warehouse_id
        sending_payloads[detail.id].append({
            "id": allocation.id,
            "outbound_order_detail_id": allocation.outbound_order_detail_id,
            "item_stock_id": allocation.item_stock_id,
            "quantity": int(allocation.quantity),
            "status": allocation.status,
            "allocation_type": allocation.allocation_type,
            "robot_task_id": allocation.robot_task_id,
            "from_location_id": allocation.from_location_id,
            "to_location_id": allocation.to_location_id,
        })

    for detail_id, payloads in sending_payloads.items():
        payloads = _enrich_stock_ready_payloads(db, payloads)
        sending_payloads[detail_id] = payloads
        cache_data = cache_get(f"outbound:assigned_cc_details:{warehouse_id}:{detail_id}")
        if cache_data:
            location_id = cache_data.get("location_id")
            zone = cache_data.get("zone")

            publish_masan_sorting_zone(
                warehouse_id,
                zone,
                event_type=EVENT_MASAN_SORTING_STOCK_READY,
                data={
                    "location_id": location_id,
                    "details": payloads,
                },
            )

            logger.info(f"Publishing sorting stock ready for warehouse_id={warehouse_id}, zone={zone}, location_id={location_id}, details={len(payloads)}")

            for payload in payloads:
                key = (
                    f"outbound:masan:stock_ready:{warehouse_id}:{zone}:"
                    f"{payload['id']}:{location_id}"
                )
                cache_set(key, payload, -1)


def list_sorting_zone_cc_locations(
    db: Session,
    warehouse_id: int,
    zone: str,
) -> dict[str, Any]:
    """Trạng thái gán CC theo mã zone (Zone.code) — mọi location trong zone DB."""
    zone_norm = (zone or "").strip()
    if not zone_norm:
        raise ValueError("Zone is required")
    _ensure_warehouse_exists(db, warehouse_id)

    zone_row = (
        db.query(Zone)
        .filter(Zone.warehouse_id == warehouse_id, Zone.code == zone_norm)
        .first()
    )
    if not zone_row:
        return {
            "warehouse_id": warehouse_id,
            "zone": zone_norm,
            "locations": [],
        }

    location_rows = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.zone_id == zone_row.id,
        )
        .order_by(Location.location_code)
        .all()
    )

    items: list[dict[str, Any]] = []
    for loc in location_rows:
        location_name = (loc.location_name or "").strip() or None
        bucket_data = get_sorting_data_for_zone(db, warehouse_id, loc.id)
        if not bucket_data:
            items.append(
                {
                    "location_id": loc.id,
                    "location_code": loc.location_code,
                    "location_name": location_name,
                    "assigned": False,
                    "zone": zone_norm,
                    "vehicle_number": None,
                    "lines": [],
                }
            )
            continue
        items.append(
            {
                "location_id": loc.id,
                "location_code": loc.location_code,
                "location_name": location_name,
                "assigned": True,
                "zone": bucket_data.get("zone"),
                "vehicle_number": bucket_data.get("vehicle_number"),
                "lines": bucket_data.get("lines") or [],
            }
        )

    return {
        "warehouse_id": warehouse_id,
        "zone": zone_norm,
        "locations": items,
    }