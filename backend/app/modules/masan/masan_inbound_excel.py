"""Shared Excel layout for Masan inbound import/export (BM.06)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

if TYPE_CHECKING:
    from openpyxl.worksheet.worksheet import Worksheet

EXPORT_TITLE = (
    "BIỂU MẪU BÁO CÁO NHẬP THEO NGÀY\n(New System trả về để truy vết)"
)

EXPORT_HEADERS: tuple[str, ...] = (
    "Ngày/ Giờ chi tiết",
    "Số xe",
    "Kho xuất",
    "Kho nhập",
    "Delivery",
    "NVT",
    "Mã Item",
    "Tên Item",
    "LOT",
    "Lot status",
    "Số lượng",
    "Số pallet",
    "Vị trí để",
    "Locator",
)

HEADER_ROW = 2
DATA_START_ROW = 3

EXPORT_COLUMN_WIDTHS: tuple[float, ...] = (
    14.0,  # Ngày/ Giờ chi tiết
    12.0,  # Số xe
    30.0,  # Kho xuất
    30.0,  # Kho nhập
    14.0,  # Delivery
    14.0,  # NVT
    12.0,  # Mã Item
    45.0,  # Tên Item
    10.0,  # LOT
    12.0,  # Lot status
    10.0,  # Số lượng
    10.0,  # Số pallet
    14.0,  # Vị trí để
    14.0,  # Locator
)

TITLE_ROW_HEIGHT = 42.0
HEADER_ROW_HEIGHT = 28.0
DATA_ROW_HEIGHT = 20.0

# Columns that must stay text (avoid scientific notation / leading-zero loss).
TEXT_FORMAT_COLUMNS = frozenset({5, 9})  # Delivery, LOT
WRAP_TEXT_COLUMNS = frozenset({1, 8})  # Ngày/Giờ, Tên Item

_TITLE_FILL = PatternFill("solid", fgColor="FFFF00")
_HEADER_FONT = Font(bold=True, size=10)
_TITLE_FONT = Font(bold=True, size=11)
_DATA_FONT = Font(size=10)
_THIN_BORDER = Border(
    left=Side(style="thin", color="000000"),
    right=Side(style="thin", color="000000"),
    top=Side(style="thin", color="000000"),
    bottom=Side(style="thin", color="000000"),
)
_CENTER_WRAP = Alignment(horizontal="center", vertical="center", wrap_text=True)
_LEFT_WRAP = Alignment(horizontal="left", vertical="center", wrap_text=True)
_LEFT_TOP_WRAP = Alignment(horizontal="left", vertical="top", wrap_text=True)


def normalize_export_cell_value(column_index: int, value: Any) -> Any:
    """Coerce values for stable Excel display (text IDs, preserved blanks)."""
    if value is None or value == "":
        return None
    if column_index in TEXT_FORMAT_COLUMNS:
        return str(value)
    return value


def apply_export_cell_style(ws: Worksheet, row: int, column: int) -> None:
    cell = ws.cell(row=row, column=column)
    cell.font = _DATA_FONT
    cell.border = _THIN_BORDER
    if column in TEXT_FORMAT_COLUMNS:
        cell.number_format = "@"
    if column in WRAP_TEXT_COLUMNS:
        cell.alignment = _LEFT_TOP_WRAP
    elif column == 11:  # Số lượng
        cell.alignment = Alignment(horizontal="right", vertical="center")
    else:
        cell.alignment = _LEFT_WRAP


def style_masan_export_worksheet(ws: Worksheet, *, last_data_row: int) -> None:
    """Apply BM.06-like layout: yellow title row, spaced columns/rows, grid borders."""
    col_count = len(EXPORT_HEADERS)

    for col_idx, width in enumerate(EXPORT_COLUMN_WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    for col_idx in range(1, col_count + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = _TITLE_FILL

    ws.merge_cells(start_row=1, start_column=2, end_row=1, end_column=col_count)
    title_cell = ws.cell(row=1, column=2)
    title_cell.value = EXPORT_TITLE
    title_cell.font = _TITLE_FONT
    title_cell.alignment = _CENTER_WRAP
    ws.row_dimensions[1].height = TITLE_ROW_HEIGHT

    for col_idx in range(1, col_count + 1):
        header_cell = ws.cell(row=HEADER_ROW, column=col_idx)
        header_cell.font = _HEADER_FONT
        header_cell.alignment = _CENTER_WRAP
        header_cell.border = _THIN_BORDER
    ws.row_dimensions[HEADER_ROW].height = HEADER_ROW_HEIGHT

    for row_idx in range(DATA_START_ROW, last_data_row + 1):
        ws.row_dimensions[row_idx].height = DATA_ROW_HEIGHT
        for col_idx in range(1, col_count + 1):
            apply_export_cell_style(ws, row_idx, col_idx)

    ws.freeze_panes = ws.cell(row=DATA_START_ROW, column=1)


COLUMN_ALIASES: dict[str, list[str]] = {
    "inbound_datetime": ["ngày/ giờ chi tiết", "ngày/giờ chi tiết"],
    "vehicle_no": ["số xe"],
    "from_warehouse": ["kho xuất"],
    "to_warehouse": ["kho nhập"],
    "delivery": ["delivery"],
    "nvt": ["nvt"],
    "sku": ["mã item"],
    "item_name": ["tên item"],
    "lot": ["lot"],
    "lot_status": ["lot status"],
    "quantity": ["số lượng"],
    "pallet_count": ["số pallet"],
    "storage_location": ["vị trí để"],
    "locator": ["locator"],
}
