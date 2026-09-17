"""Warehouse operation mode helpers (manual vs auto)."""

from app.core.config import settings


def is_manual_warehouse(warehouse_id: int | None) -> bool:
    """Manual warehouses use compact QR-only labels; auto warehouses use full Bacviet forms."""
    if warehouse_id is None:
        return True
    return warehouse_id in settings.manual_warehouse_ids
