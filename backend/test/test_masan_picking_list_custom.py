"""Unit tests for custom (detail_ids) picking list selection — no DB."""

import os
import unittest
from types import SimpleNamespace

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
    build_picking_list_payload,
)


def _detail(detail_id: int, extracted: int = 0, **details_fields):
    return SimpleNamespace(
        id=detail_id,
        quantity=5,
        unit="Thùng",
        extracted=extracted,
        sorting_location=None,
        item=SimpleNamespace(name="Hàng A", sku="SKU-A"),
        allocations=[],
        outbound_order=SimpleNamespace(warehouse_id=1),
        details=dict(details_fields),
    )


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


if __name__ == "__main__":
    unittest.main()
