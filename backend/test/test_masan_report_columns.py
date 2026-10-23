"""Masan inbound/outbound report row width matches Excel headers."""

import os
import unittest
from types import SimpleNamespace

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
)

from app.modules.masan.masan_inbound_excel import INBOUND_REPORT_HEADERS
from app.modules.masan.masan_inbound_service import _build_export_row, _format_report_distance_m
from app.modules.masan.masan_outbound_excel import OUTBOUND_REPORT_HEADERS
from app.modules.masan.masan_outbound_service import _build_outbound_report_row


class MasanReportColumnTests(unittest.TestCase):
    def test_inbound_row_matches_headers(self):
        order = SimpleNamespace(
            warehouse=SimpleNamespace(name="WH"),
            created_at=None,
        )
        detail = SimpleNamespace(
            details={"vehicle_no": "51C"},
            from_location=SimpleNamespace(location_name="VT01"),
            to_location=SimpleNamespace(location_name="G100"),
            device="R1",
            start_time=None,
            end_time=None,
            sorting_persons="Nguyen A",
            distance=25.0084,
        )
        allocation = SimpleNamespace(
            quantity=10,
            item_stock=SimpleNamespace(
                item=SimpleNamespace(sku="SKU", name="Item"),
                lot_number_from="011026",
                lot_number_to="011026",
            ),
        )
        row = _build_export_row(order, detail, allocation)
        self.assertEqual(len(row), len(INBOUND_REPORT_HEADERS))
        self.assertEqual(row[14], "Nguyen A")
        self.assertEqual(row[15], 25.008)
        self.assertEqual(_format_report_distance_m(None), None)

    def test_outbound_row_matches_headers(self):
        detail = SimpleNamespace(
            details={"vehicle_no": "51C", "locator": "G417"},
            item=SimpleNamespace(sku="SKU", name="Item"),
            sorting_location=None,
        )
        allocation = SimpleNamespace(
            quantity=5,
            item_stock=SimpleNamespace(
                lot_number_from="011026",
                lot_number_to="011026",
            ),
            from_location=SimpleNamespace(location_name="G417", location_code="G417"),
            to_location=SimpleNamespace(location_name="VT14"),
            device="R2",
            start_time=None,
            end_time=None,
            start_sorting_time=None,
            end_sorting_time=None,
            sorting_persons="Tran B",
            distance=25.0,
        )
        row = _build_outbound_report_row(
            detail, allocation, detail_sorting_location="CC01"
        )
        self.assertEqual(len(row), len(OUTBOUND_REPORT_HEADERS))
        self.assertEqual(row[12], "Tran B")
        self.assertEqual(row[13], 25.0)


if __name__ == "__main__":
    unittest.main()
