"""Nhãn vị trí hiển thị — luôn ưu tiên `location.location_name` trên DB."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.modules.warehouse.location_map.location_model import Location


def location_display_label(location: Location | None) -> str | None:
    if location is None:
        return None
    name = (location.location_name or "").strip()
    if name:
        return name
    code = (location.location_code or "").strip()
    if code:
        return code
    legacy = (location.bin_code or "").strip()
    return legacy or None
