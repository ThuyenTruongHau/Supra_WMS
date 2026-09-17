"""Shared Excel layout for Masan outbound import (BM.04)."""

from __future__ import annotations

EXPORT_TITLE = (
    "BIỂU MẪU LIST XE XUẤT HÀNG\n( Cung cấp danh sách lấy hàng theo xe )"
)

EXPORT_HEADERS: tuple[str, ...] = (
    "Số xe",
    "Tên khách hàng",
    "Trip",
    "NVT",
    "Mã Item",
    "Tên Item",
    "LOT",
    "Lot status",
    "Số lượng",
    "Số pallet",
    "Locator",
)

HEADER_ROW = 2
DATA_START_ROW = 3

TRIP_PLACEHOLDERS = frozenset({"…", "...", ".", "-", "—"})

COLUMN_ALIASES: dict[str, list[str]] = {
    "vehicle_no": ["số xe"],
    "customer_name": ["tên khách hàng"],
    "trip": ["trip"],
    "nvt": ["nvt"],
    "sku": ["mã item"],
    "item_name": ["tên item"],
    "lot": ["lot"],
    "lot_status": ["lot status"],
    "quantity": ["số lượng"],
    "pallet_count": ["số pallet"],
    "locator": ["locator"],
}
