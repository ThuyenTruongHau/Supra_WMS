"""Unit tests for picking list line payload fields (no DB)."""

import os
import unittest
from types import SimpleNamespace

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="masan-picking-list-test",
)

from app.main import app  # noqa: F401 — register ORM mappers

from app.modules.masan.masan_picking_list_service import (
    _build_picking_sheets,
    _detail_to_picking_line,
)


def _detail(detail_id: int = 1, **details_fields):
    return SimpleNamespace(
        id=detail_id,
        quantity=10,
        unit="Thùng",
        item=SimpleNamespace(name="Hàng mẫu", sku="SKU001"),
        allocations=[],
        details=dict(details_fields),
    )


class MasanPickingListLineTests(unittest.TestCase):
    def test_line_maps_sku_and_lot(self):
        line = _detail_to_picking_line(
            _detail(
                sku="02KK00361",
                customer_name="WinMart+",
                nvt="NVT01",
                trip="T01",
                lot_number="040526",
            ),
        )
        self.assertEqual(line["sku"], "02KK00361")
        self.assertEqual(line["quantity"], 10)
        self.assertNotIn("customer_name", line)
        self.assertNotIn("nvt", line)
        self.assertNotIn("trip", line)

    def test_build_sheets_groups_by_customer(self):
        details = [
            _detail(1, customer_name="Khách A", nvt="N1", trip="T01", sku="A1"),
            _detail(2, customer_name="Khách B", nvt="N2", trip="T02", sku="B1"),
            _detail(3, customer_name="Khách A", nvt="N3", trip="T03", sku="A2"),
        ]
        sheets = _build_picking_sheets(details)
        self.assertEqual(len(sheets), 2)
        self.assertEqual(sheets[0]["customer_name"], "Khách A")
        self.assertEqual(len(sheets[0]["lines"]), 2)
        self.assertEqual(sheets[0]["lines"][0]["sku"], "A1")
        self.assertEqual(sheets[0]["lines"][1]["sku"], "A2")
        self.assertEqual(sheets[1]["customer_name"], "Khách B")
        self.assertEqual(len(sheets[1]["lines"]), 1)

    def test_build_sheets_aggregates_nvt_and_trip_unique(self):
        details = [
            _detail(1, customer_name="Khách A", nvt="NVT01", trip="T01"),
            _detail(2, customer_name="Khách A", nvt="NVT02", trip="T01"),
            _detail(3, customer_name="Khách A", nvt="NVT01", trip="T02"),
        ]
        sheets = _build_picking_sheets(details)
        self.assertEqual(len(sheets), 1)
        self.assertEqual(sheets[0]["nvt"], "NVT01, NVT02")
        self.assertEqual(sheets[0]["trip"], "T01, T02")

    def test_build_sheets_trip_falls_back_to_trip_code(self):
        sheets = _build_picking_sheets(
            [_detail(1, customer_name="Khách A", trip_code="T99")],
        )
        self.assertEqual(sheets[0]["trip"], "T99")

    def test_build_sheets_unknown_customer(self):
        sheets = _build_picking_sheets([_detail(1, nvt="N1")])
        self.assertEqual(sheets[0]["customer_name"], "Unknown")


if __name__ == "__main__":
    unittest.main()
