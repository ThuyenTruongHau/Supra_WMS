"""Compute base-unit quantities for order detail API responses (read-only, no DB writes)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.modules.warehouse.unit import unit_service

BaseUnitQuantityTriple = tuple[int, int | None, str | None]


class BaseUnitQuantityResolver:
    def __init__(self, db: Session) -> None:
        self.db = db
        self._cache: dict[tuple[int, int, int], BaseUnitQuantityTriple] = {}

    def resolve(
        self,
        *,
        item_id: int | None,
        unit_id: int | None,
        quantity: int | None,
    ) -> BaseUnitQuantityTriple:
        if item_id is None or unit_id is None or quantity is None or quantity <= 0:
            return 0, None, None

        key = (item_id, unit_id, int(quantity))
        if key not in self._cache:
            try:
                converted = unit_service.convert_quantity(
                    self.db,
                    item_id=item_id,
                    unit_id=unit_id,
                    quantity=int(quantity),
                )
                self._cache[key] = (
                    int(converted.converted_quantity),
                    converted.base_unit_id,
                    converted.base_unit_name,
                )
            except ValueError:
                self._cache[key] = (0, None, None)
        return self._cache[key]


def resolve_base_unit_quantity(
    db: Session,
    *,
    item_id: int | None,
    unit_id: int | None,
    quantity: int | None,
) -> BaseUnitQuantityTriple:
    return BaseUnitQuantityResolver(db).resolve(
        item_id=item_id,
        unit_id=unit_id,
        quantity=quantity,
    )
