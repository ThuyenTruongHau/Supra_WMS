"""Pure lookup logic for item stock ↔ QR code mappings."""

from collections import defaultdict

from sqlalchemy.orm import Session

from app.modules.warehouse.item.item_model import QR_Code
from app.modules.warehouse.item_stock.item_stock_schema import (
    ItemStockQrCodeEntry,
    ItemStockQrLookupResponse,
    ItemStockQrMappingItem,
)

MAX_QR_LOOKUP_STOCK_IDS = 500


def _normalize_stock_ids(item_stock_ids: list[int]) -> list[int]:
    seen: set[int] = set()
    normalized: list[int] = []
    for raw in item_stock_ids:
        stock_id = int(raw)
        if stock_id <= 0 or stock_id in seen:
            continue
        seen.add(stock_id)
        normalized.append(stock_id)
    if len(normalized) > MAX_QR_LOOKUP_STOCK_IDS:
        raise ValueError(
            f"item_stock_ids must not exceed {MAX_QR_LOOKUP_STOCK_IDS} entries"
        )
    return normalized


def resolve_qr_codes_for_stocks(
    db: Session,
    item_stock_ids: list[int],
) -> ItemStockQrLookupResponse:
    ids = _normalize_stock_ids(item_stock_ids)
    if not ids:
        raise ValueError("item_stock_ids must contain at least one valid id")

    rows = (
        db.query(QR_Code)
        .filter(QR_Code.item_stock_id.in_(ids))
        .order_by(QR_Code.item_stock_id, QR_Code.id)
        .all()
    )

    grouped: dict[int, list[ItemStockQrCodeEntry]] = defaultdict(list)
    for row in rows:
        stock_id = row.item_stock_id
        if stock_id is None:
            continue
        grouped[int(stock_id)].append(
            ItemStockQrCodeEntry(
                id=row.id,
                code=row.code,
                qr_type=row.qr_type or "item",
            )
        )

    items = [
        ItemStockQrMappingItem(
            item_stock_id=stock_id,
            qr_codes=grouped.get(stock_id, []),
        )
        for stock_id in ids
    ]
    return ItemStockQrLookupResponse(items=items)
