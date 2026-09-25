"""Excel layout for Masan outbound SO export (multi-sheet by customer)."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from openpyxl.styles import Alignment, Border, Font, Side
from openpyxl.utils import get_column_letter

if TYPE_CHECKING:
    from openpyxl.worksheet.worksheet import Worksheet

SO_TITLE = "BIỂU MẪU LẤY HÀNG THEO SO"
SO_SUBTITLE = "(Cung cấp thông tin xuất hàng)"

SO_DATA_HEADERS: tuple[str, ...] = (
    "STT",
    "Mã Item",
    "Tên Item",
    "LOT",
    "Lot status",
    "Số lượng",
    "Số pallet",
    "Locator",
)

TITLE_ROW = 1
SUBTITLE_ROW = 2
CUSTOMER_ROW = 3
ADDRESS_ROW = 4
CARRIER_ROW = 5
HEADER_ROW = 6
DATA_START_ROW = 7

COL_COUNT = len(SO_DATA_HEADERS)

SO_COLUMN_WIDTHS: tuple[float, ...] = (
    7.8,
    14.8,
    52.8,
    11.8,
    13.8,
    11.8,
    11.8,
    14.8,
)

TITLE_ROW_HEIGHT = 30.0
SUBTITLE_ROW_HEIGHT = 22.0
META_ROW_HEIGHT = 28.0
HEADER_ROW_HEIGHT = 28.0
DATA_ROW_HEIGHT = 42.0

TEXT_FORMAT_COLUMNS = frozenset({4, 8})  # LOT, Locator
WRAP_TEXT_COLUMNS = frozenset({3, 8})  # Tên Item, Locator

_HEADER_FONT = Font(bold=True, size=10)
_TITLE_FONT = Font(bold=True, size=11)
_SUBTITLE_FONT = Font(size=10)
_META_FONT = Font(size=10)
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

_INVALID_SHEET_CHARS = re.compile(r"[\\/*?:\[\]]")


def sanitize_sheet_name(name: str, *, used: set[str] | None = None) -> str:
    cleaned = _INVALID_SHEET_CHARS.sub("", (name or "").strip()) or "Unknown"
    cleaned = cleaned[:31]
    if used is None:
        return cleaned
    base = cleaned
    candidate = base
    suffix = 2
    while candidate in used:
        tail = f"_{suffix}"
        candidate = f"{base[: 31 - len(tail)]}{tail}"
        suffix += 1
    used.add(candidate)
    return candidate


def normalize_so_cell_value(column_index: int, value: Any) -> Any:
    if value is None or value == "":
        return None
    if column_index in TEXT_FORMAT_COLUMNS:
        return str(value)
    return value


def _apply_data_cell_style(ws: Worksheet, row: int, column: int) -> None:
    cell = ws.cell(row=row, column=column)
    cell.font = _DATA_FONT
    cell.border = _THIN_BORDER
    if column in TEXT_FORMAT_COLUMNS:
        cell.number_format = "@"
    if column in WRAP_TEXT_COLUMNS:
        cell.alignment = _LEFT_TOP_WRAP
    elif column == 1:
        cell.alignment = Alignment(horizontal="center", vertical="center")
    elif column == 6:
        cell.alignment = Alignment(horizontal="right", vertical="center")
    else:
        cell.alignment = _LEFT_WRAP


def build_so_customer_sheet(
    ws: Worksheet,
    *,
    customer_name: str,
    trips: list[str],
    vehicles: list[str],
    nvts: list[str],
    data_rows: list[list[Any]],
) -> None:
    for col_idx, width in enumerate(SO_COLUMN_WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    ws.merge_cells(start_row=TITLE_ROW, start_column=1, end_row=TITLE_ROW, end_column=COL_COUNT)
    ws.cell(row=TITLE_ROW, column=1, value=SO_TITLE).font = _TITLE_FONT
    ws.cell(row=TITLE_ROW, column=1).alignment = _CENTER_WRAP
    ws.row_dimensions[TITLE_ROW].height = TITLE_ROW_HEIGHT

    ws.merge_cells(
        start_row=SUBTITLE_ROW, start_column=1, end_row=SUBTITLE_ROW, end_column=COL_COUNT
    )
    ws.cell(row=SUBTITLE_ROW, column=1, value=SO_SUBTITLE).font = _SUBTITLE_FONT
    ws.cell(row=SUBTITLE_ROW, column=1).alignment = _CENTER_WRAP
    ws.row_dimensions[SUBTITLE_ROW].height = SUBTITLE_ROW_HEIGHT

    ws.merge_cells(start_row=CUSTOMER_ROW, start_column=1, end_row=CUSTOMER_ROW, end_column=4)
    ws.cell(row=CUSTOMER_ROW, column=1, value=f"Khách hàng: {customer_name}").font = _META_FONT
    ws.merge_cells(start_row=CUSTOMER_ROW, start_column=5, end_row=CUSTOMER_ROW, end_column=COL_COUNT)
    trip_text = ", ".join(trips) if trips else "…"
    ws.cell(row=CUSTOMER_ROW, column=5, value=f"Số đơn hàng: {trip_text}").font = _META_FONT
    ws.row_dimensions[CUSTOMER_ROW].height = META_ROW_HEIGHT

    ws.merge_cells(start_row=ADDRESS_ROW, start_column=1, end_row=ADDRESS_ROW, end_column=4)
    ws.cell(row=ADDRESS_ROW, column=1, value="Địa chỉ giao hàng: —").font = _META_FONT
    ws.row_dimensions[ADDRESS_ROW].height = META_ROW_HEIGHT

    ws.merge_cells(start_row=CARRIER_ROW, start_column=1, end_row=CARRIER_ROW, end_column=4)
    nvt_text = ", ".join(nvts) if nvts else "—"
    ws.cell(row=CARRIER_ROW, column=1, value=f"Đơn vị vận chuyển: {nvt_text}").font = _META_FONT
    ws.merge_cells(start_row=CARRIER_ROW, start_column=5, end_row=CARRIER_ROW, end_column=COL_COUNT)
    vehicle_text = ", ".join(vehicles) if vehicles else "—"
    ws.cell(row=CARRIER_ROW, column=5, value=f"Số xe: {vehicle_text}").font = _META_FONT
    ws.row_dimensions[CARRIER_ROW].height = META_ROW_HEIGHT

    for col_idx, header in enumerate(SO_DATA_HEADERS, start=1):
        cell = ws.cell(row=HEADER_ROW, column=col_idx, value=header)
        cell.font = _HEADER_FONT
        cell.alignment = _CENTER_WRAP
        cell.border = _THIN_BORDER
    ws.row_dimensions[HEADER_ROW].height = HEADER_ROW_HEIGHT

    last_data_row = DATA_START_ROW - 1
    for offset, row_values in enumerate(data_rows):
        row_idx = DATA_START_ROW + offset
        last_data_row = row_idx
        ws.row_dimensions[row_idx].height = DATA_ROW_HEIGHT
        for col_idx, value in enumerate(row_values, start=1):
            ws.cell(
                row=row_idx,
                column=col_idx,
                value=normalize_so_cell_value(col_idx, value),
            )
            _apply_data_cell_style(ws, row_idx, col_idx)

    ws.freeze_panes = ws.cell(row=DATA_START_ROW, column=1)
