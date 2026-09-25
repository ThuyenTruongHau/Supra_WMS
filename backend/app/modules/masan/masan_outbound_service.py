from __future__ import annotations

from collections import defaultdict
from io import BytesIO
from typing import Any, Optional

from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import Session, joinedload, selectinload

from app.modules.masan.masan_outbound_excel import (
    COLUMN_ALIASES,
    DATA_START_ROW,
    HEADER_ROW,
    TRIP_PLACEHOLDERS,
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
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.lot_number_utils import parse_legacy_lot_number
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists


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
