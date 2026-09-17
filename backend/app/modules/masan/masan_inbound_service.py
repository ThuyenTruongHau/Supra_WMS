from __future__ import annotations

from io import BytesIO
from typing import Any, Optional

from openpyxl import Workbook, load_workbook
from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import settings

from app.modules.masan.masan_inbound_excel import (
    COLUMN_ALIASES,
    DATA_START_ROW,
    EXPORT_HEADERS,
    EXPORT_TITLE,
    HEADER_ROW,
)
from app.modules.masan.masan_schema import (
    MasanInboundParseResponse,
    MasanInboundPreviewRow,
)
from app.modules.warehouse.inbound_order.inbound_order_model import (
    InboundOrder,
    InboundOrderAllocation,
    InboundOrderDetail,
)
from app.modules.warehouse.inbound_order.inbound_order_schema import (
    InboundOrderDetailResponse,
    InboundSuggestAdditionalDetail,
    InboundSuggestAllocation,
    InboundSuggestAllocationDetail,
    format_lot_number_display,
)
from app.modules.warehouse.inbound_order.inbound_order_service import (
    _build_detail_response,
)
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.warehouse_zone.warehouse_model import Zone
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists

DELIVERY_PLACEHOLDERS = frozenset({"…", "...", ".", "-", "—"})


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


def _normalize_delivery(value: Optional[str], carry: Optional[str]) -> Optional[str]:
    if value is None:
        return carry
    cleaned = value.strip()
    if not cleaned or cleaned in DELIVERY_PLACEHOLDERS:
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
    if field == "delivery":
        normalized = _normalize_delivery(value, carry.get(field))
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


def parse_masan_inbound_rows(content: bytes) -> list[dict[str, Any]]:
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
                "inbound_datetime": _cell_value(row, col_map, "inbound_datetime", carry),
                "vehicle_no": _cell_value(row, col_map, "vehicle_no", carry),
                "from_warehouse": _cell_value(row, col_map, "from_warehouse", carry),
                "to_warehouse": _cell_value(row, col_map, "to_warehouse", carry),
                "delivery": _cell_value(row, col_map, "delivery", carry),
                "nvt": _cell_value(row, col_map, "nvt", carry),
                "sku": str(sku_raw).strip(),
                "item_name": _direct(row, col_map, "item_name"),
                "lot": _direct(row, col_map, "lot"),
                "lot_status": _direct(row, col_map, "lot_status"),
                "quantity": quantity,
                "quantity_error": qty_error,
                "pallet_count": _direct(row, col_map, "pallet_count"),
                "storage_location": _direct(row, col_map, "storage_location"),
                "locator": _direct(row, col_map, "locator"),
            }
        )

    if not rows:
        raise ValueError("Không có dòng hợp lệ trong file Excel")

    return rows


def _build_line_item_details(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "row_no": row.get("row_no"),
        "inbound_datetime": row.get("inbound_datetime"),
        "vehicle_no": row.get("vehicle_no"),
        "from_warehouse": row.get("from_warehouse"),
        "to_warehouse": row.get("to_warehouse"),
        "delivery": row.get("delivery"),
        "nvt": row.get("nvt"),
        "sku": row.get("sku"),
        "item_name": row.get("item_name"),
        "lot": row.get("lot"),
        "lot_status": row.get("lot_status"),
        "pallet_count": row.get("pallet_count"),
        "storage_location": row.get("storage_location"),
        "from_location_id": row.get("from_location_id"),
        "from_location_name": row.get("from_location_name"),
        "locator": row.get("locator"),
        "source": "masan_import",
    }


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


def _lookup_inbound_from_location(
    db: Session,
    warehouse_id: int,
    location_name: Optional[str],
) -> tuple[Optional[Location], Optional[str]]:
    if not location_name or not str(location_name).strip():
        return None, "Thiếu vị trí để"

    name = str(location_name).strip()
    zone_filter = or_(
        Zone.name.in_(settings.zone_inbound),
        Zone.code.in_(settings.zone_inbound),
    )

    matches = (
        db.query(Location)
        .join(Zone, Location.zone_id == Zone.id)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.is_active.is_(True),
            Location.location_name == name,
            zone_filter,
        )
        .all()
    )

    if not matches:
        exists_elsewhere = (
            db.query(Location)
            .filter(
                Location.warehouse_id == warehouse_id,
                Location.is_active.is_(True),
                Location.location_name == name,
            )
            .first()
        )
        if exists_elsewhere:
            return None, f"Vị trí '{name}' không thuộc zone nhập"
        return None, f"Không tìm thấy vị trí '{name}' trong kho"

    if len(matches) > 1:
        return None, f"Vị trí '{name}' không xác định (trùng tên trong zone nhập)"

    return matches[0], None


def parse_masan_inbound_preview(
    db: Session,
    *,
    warehouse_id: int,
    content: bytes,
    inbound_type: str,
) -> MasanInboundParseResponse:
    _ensure_warehouse_exists(db, warehouse_id)

    parsed_rows = parse_masan_inbound_rows(content)
    sku_cache: dict[str, Optional[Item]] = {}

    preview_rows: list[MasanInboundPreviewRow] = []
    line_items: list[InboundSuggestAdditionalDetail] = []
    suggest_index_by_row_no: dict[int, int] = {}
    warnings: list[str] = []
    invalid_count = 0

    for row in parsed_rows:
        sku = row["sku"]
        if sku not in sku_cache:
            sku_cache[sku] = _lookup_item(db, warehouse_id, sku)

        item = sku_cache[sku]
        from_location, from_location_error = _lookup_inbound_from_location(
            db,
            warehouse_id,
            row.get("storage_location"),
        )

        errors: list[str] = []
        if row.get("quantity_error"):
            errors.append(row["quantity_error"])
        if item is None:
            errors.append(f"Không tìm thấy sản phẩm SKU '{sku}' trong kho")
        if from_location_error:
            errors.append(from_location_error)

        preview = MasanInboundPreviewRow(
            row_no=row["row_no"],
            inbound_datetime=row.get("inbound_datetime"),
            vehicle_no=row.get("vehicle_no"),
            from_warehouse=row.get("from_warehouse"),
            to_warehouse=row.get("to_warehouse"),
            delivery=row.get("delivery"),
            nvt=row.get("nvt"),
            sku=sku,
            item_name=row.get("item_name"),
            lot=row.get("lot"),
            lot_status=row.get("lot_status"),
            quantity=row.get("quantity") or 0,
            pallet_count=row.get("pallet_count"),
            storage_location=row.get("storage_location"),
            from_location_id=from_location.id if from_location else None,
            from_location_name=from_location.location_name if from_location else None,
            locator=row.get("locator"),
            item_id=item.id if item else None,
            unit_id=item.base_unit_id if item else None,
            error="; ".join(errors) if errors else None,
        )
        preview_rows.append(preview)

        if errors or item is None or from_location is None:
            invalid_count += 1
            continue

        row_with_from_location = {
            **row,
            "from_location_id": from_location.id,
            "from_location_name": from_location.location_name,
        }
        suggest_index_by_row_no[row["row_no"]] = len(line_items)
        line_items.append(
            InboundSuggestAdditionalDetail(
                items=[
                    InboundSuggestAllocationDetail(
                        item_id=item.id,
                        quantity=row["quantity"],
                        unit_id=item.base_unit_id,
                        lot_number=row.get("lot"),
                    )
                ],
                details=_build_line_item_details(row_with_from_location),
            )
        )

    if not line_items:
        raise ValueError(
            "Không có dòng hợp lệ để tạo payload gợi ý vị trí. "
            "Kiểm tra SKU và số lượng trong file."
        )

    for idx, preview in enumerate(preview_rows):
        group_idx = suggest_index_by_row_no.get(preview.row_no)
        if group_idx is None:
            continue
        preview_rows[idx] = preview.model_copy(update={"suggest_group_index": group_idx})

    if invalid_count:
        warnings.append(f"{invalid_count} dòng bị bỏ qua khỏi payload gợi ý vị trí")

    suggest_allocation = InboundSuggestAllocation(
        warehouse_id=warehouse_id,
        detail_type=inbound_type,
        line_items=line_items,
    )

    return MasanInboundParseResponse(
        preview_rows=preview_rows,
        suggest_allocation=suggest_allocation,
        total_rows=len(preview_rows),
        valid_rows=len(preview_rows) - invalid_count,
        invalid_rows=invalid_count,
        group_count=len(line_items),
        warnings=warnings,
    )


def _meta_value(meta: dict[str, Any], key: str, default: Any = "") -> Any:
    value = meta.get(key)
    if value is None or value == "":
        return default
    return value


def _format_inbound_datetime(order: InboundOrder, meta: dict[str, Any]) -> str:
    raw = _meta_value(meta, "inbound_datetime", default=None)
    if raw:
        return str(raw)
    if order.created_at:
        return order.created_at.strftime("%d/%m/%Y\n%H:%M")
    return ""


def _build_export_row(
    order: InboundOrder,
    detail: InboundOrderDetail,
    allocation: InboundOrderAllocation,
) -> list[Any]:
    meta = detail.details or {}
    stock: ItemStock | None = allocation.item_stock
    item = stock.item if stock else None

    sku = item.sku if item else _meta_value(meta, "sku", default="")
    item_name = item.name if item else _meta_value(meta, "item_name", default="")
    lot = (
        format_lot_number_display(stock.lot_number_from, stock.lot_number_to)
        if stock
        else _meta_value(meta, "lot", default="")
    )

    warehouse_name = order.warehouse.name if order.warehouse else ""
    storage_location = (
        detail.from_location.location_name
        if detail.from_location
        else _meta_value(meta, "storage_location")
    )
    locator = detail.to_location.location_name if detail.to_location else ""

    return [
        _format_inbound_datetime(order, meta),
        _meta_value(meta, "vehicle_no"),
        _meta_value(meta, "from_warehouse"),
        _meta_value(meta, "to_warehouse", default=warehouse_name),
        _meta_value(meta, "delivery"),
        _meta_value(meta, "nvt"),
        sku,
        item_name,
        lot,
        _meta_value(meta, "lot_status", default="GOOD"),
        allocation.quantity,
        _meta_value(meta, "pallet_count"),
        storage_location,
        locator,
    ]


def _build_export_workbook(rows: list[list[Any]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Sheet1"

    ws.merge_cells(start_row=1, start_column=2, end_row=1, end_column=len(EXPORT_HEADERS))
    ws.cell(row=1, column=2, value=EXPORT_TITLE)

    for col_idx, header in enumerate(EXPORT_HEADERS, start=1):
        ws.cell(row=HEADER_ROW, column=col_idx, value=header)

    for row_idx, row_values in enumerate(rows, start=DATA_START_ROW):
        for col_idx, value in enumerate(row_values, start=1):
            ws.cell(row=row_idx, column=col_idx, value=value)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def export_inbound_order_masan(db: Session, order_id: int) -> tuple[bytes, str]:
    order = (
        db.query(InboundOrder)
        .options(joinedload(InboundOrder.warehouse))
        .filter(InboundOrder.id == order_id)
        .first()
    )
    if not order:
        raise ValueError(f"Inbound order {order_id} not found")

    details = (
        db.query(InboundOrderDetail)
        .options(
            selectinload(InboundOrderDetail.allocations)
            .joinedload(InboundOrderAllocation.item_stock)
            .joinedload(ItemStock.item),
            joinedload(InboundOrderDetail.to_location),
            joinedload(InboundOrderDetail.from_location),
        )
        .filter(InboundOrderDetail.inbound_order_id == order.id)
        .order_by(InboundOrderDetail.id)
        .all()
    )
    if not details:
        raise ValueError("Inbound order has no details to export")

    export_rows: list[list[Any]] = []
    for detail in details:
        allocations = sorted(detail.allocations, key=lambda a: a.id)
        if not allocations:
            continue
        for allocation in allocations:
            export_rows.append(_build_export_row(order, detail, allocation))

    if not export_rows:
        raise ValueError("Inbound order has no allocations to export")

    content = _build_export_workbook(export_rows)
    filename = f"{order.order_code}_BaoCaoNhap.xlsx"
    return content, filename


def _validate_masan_detail_filters(
    vehicle_no: Optional[str],
    item_id: Optional[int],
) -> None:
    has_vehicle = vehicle_no is not None and vehicle_no.strip() != ""
    has_item = item_id is not None

    if has_vehicle and has_item:
        raise ValueError(
            "Chỉ được truyền vehicle_no hoặc item_id, không truyền cả hai"
        )
    if not has_vehicle and not has_item:
        raise ValueError("Cần truyền vehicle_no hoặc item_id")


def _detail_query_options():
    return (
        selectinload(InboundOrderDetail.allocations)
        .joinedload(InboundOrderAllocation.item_stock)
        .joinedload(ItemStock.item),
        selectinload(InboundOrderDetail.allocations).joinedload(
            InboundOrderAllocation.unit
        ),
        joinedload(InboundOrderDetail.from_location),
        joinedload(InboundOrderDetail.to_location),
    )


def get_masan_inbound_order_details(
    db: Session,
    inbound_order_id: int,
    *,
    vehicle_no: Optional[str] = None,
    item_id: Optional[int] = None,
) -> list[InboundOrderDetailResponse]:
    _validate_masan_detail_filters(vehicle_no, item_id)

    order = (
        db.query(InboundOrder)
        .filter(InboundOrder.id == inbound_order_id)
        .first()
    )
    if not order:
        raise ValueError(f"Inbound order {inbound_order_id} not found")

    allocation_load, unit_load, from_loc, to_loc = _detail_query_options()
    query = (
        db.query(InboundOrderDetail)
        .options(allocation_load, unit_load, from_loc, to_loc)
        .filter(InboundOrderDetail.inbound_order_id == inbound_order_id)
    )

    if vehicle_no is not None and vehicle_no.strip():
        query = query.filter(
            cast(InboundOrderDetail.details["vehicle_no"], String)
            == vehicle_no.strip()
        )
    else:
        query = (
            query.join(InboundOrderAllocation)
            .join(ItemStock)
            .filter(ItemStock.item_id == item_id)
            .distinct()
        )

    details = query.order_by(InboundOrderDetail.id).all()
    return [_build_detail_response(d) for d in details]
