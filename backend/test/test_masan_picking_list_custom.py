"""Unit tests for custom (detail_ids) picking list selection — no DB."""

import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="masan-picking-list-custom-test",
)

from app.main import app  # noqa: F401 — register ORM mappers

from app.modules.masan.masan_picking_list_service import (
    _detail_to_picking_list_option,
    _resolve_details_by_ids,
    _scope_details_to_current_order,
    build_picking_list_payload,
)


def _detail(detail_id: int, extracted: int = 0, **details_fields):
    return SimpleNamespace(
        id=detail_id,
        quantity=5,
        unit="Thùng",
        extracted=extracted,
        sorting_location=None,
        sorting_location_id=None,
        outbound_order_id=1,
        item=SimpleNamespace(name="Hàng A", sku="SKU-A"),
        allocations=[],
        outbound_order=SimpleNamespace(warehouse_id=1, created_at=None),
        details=dict(details_fields),
    )


def _order_line(
    detail_id: int,
    *,
    order_id: int,
    created_at: datetime,
    sorting_location_id: int | None,
):
    row = _detail(detail_id)
    row.outbound_order_id = order_id
    row.sorting_location_id = sorting_location_id
    row.outbound_order = SimpleNamespace(warehouse_id=1, created_at=created_at)
    return row


class MasanPickingListCustomTests(unittest.TestCase):
    def test_resolve_details_by_ids_subset(self):
        pool = [
            _detail(10, customer_name="A"),
            _detail(20, customer_name="B"),
            _detail(30, customer_name="C"),
        ]
        resolved = _resolve_details_by_ids(pool, [30, 10])
        self.assertEqual([d.id for d in resolved], [30, 10])

    def test_resolve_details_rejects_missing_id(self):
        pool = [_detail(10)]
        with self.assertRaises(ValueError):
            _resolve_details_by_ids(pool, [99])

    def test_picking_list_option_includes_extracted(self):
        row = _detail_to_picking_list_option(
            _detail(1, extracted=2, customer_name="KH1", sku="X1"),
        )
        self.assertEqual(row["detail_id"], 1)
        self.assertEqual(row["extracted"], 2)
        self.assertEqual(row["customer_name"], "KH1")

    def test_custom_payload_form_code(self):
        payload = build_picking_list_payload(
            None,
            "51F-1",
            [_detail(1, customer_name="KH")],
            extracted=0,
            form_code="In chọn lọc",
        )
        self.assertEqual(payload["form_code"], "In chọn lọc")
        self.assertEqual(payload["extracted"], 0)
        self.assertEqual(len(payload["sheets"]), 1)


_TZ = timezone(timedelta(hours=7))


class CurrentOrderScopeTests(unittest.TestCase):
    def _rows(self):
        return [
            _order_line(
                1148,
                order_id=45,
                created_at=datetime(2026, 10, 27, 7, 6, tzinfo=_TZ),
                sorting_location_id=3505,
            ),
            _order_line(
                1316,
                order_id=49,
                created_at=datetime(2026, 10, 28, 8, 27, tzinfo=_TZ),
                sorting_location_id=3502,
            ),
            _order_line(
                1318,
                order_id=49,
                created_at=datetime(2026, 10, 28, 8, 27, tzinfo=_TZ),
                sorting_location_id=3502,
            ),
            _order_line(
                1322,
                order_id=49,
                created_at=datetime(2026, 10, 28, 8, 27, tzinfo=_TZ),
                sorting_location_id=None,
            ),
        ]

    def test_cell_without_redis_keeps_latest_order_only(self):
        scoped = _scope_details_to_current_order(
            self._rows(),
            vehicle_no="29C41460",
            location_id=3502,
        )
        self.assertEqual([d.id for d in scoped], [1316, 1318, 1322])

    def test_assigned_cell_order_ignores_older_order(self):
        bucket = {"vehicle_number": "29C41460", "outbound_order_id": 49}
        with patch(
            "app.modules.masan.masan_picking_list_service.cache_get",
            return_value=bucket,
        ):
            scoped = _scope_details_to_current_order(
                self._rows(),
                vehicle_no="29C41460",
                warehouse_id=1,
                location_id=3502,
            )
        self.assertEqual({d.outbound_order_id for d in scoped}, {49})
        self.assertNotIn(1148, [d.id for d in scoped])

    def test_other_vehicle_on_cell_does_not_steal_order(self):
        bucket = {"vehicle_number": "89h01832", "outbound_order_id": 49}
        with patch(
            "app.modules.masan.masan_picking_list_service.cache_get",
            return_value=bucket,
        ):
            scoped = _scope_details_to_current_order(
                self._rows(),
                vehicle_no="29C41460",
                warehouse_id=1,
                location_id=3505,
            )
        self.assertEqual([d.id for d in scoped], [1148])


if __name__ == "__main__":
    unittest.main()
