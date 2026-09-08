"""Shared Excel layout for Masan inbound import/export (BM.06)."""

from __future__ import annotations

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
