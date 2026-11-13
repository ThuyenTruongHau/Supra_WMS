"""Masan inbound/outbound report row width matches Excel headers."""

import os
import unittest
from datetime import datetime, timezone
from io import BytesIO
from types import SimpleNamespace

from openpyxl import load_workbook

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
)

from app.modules.masan.masan_inbound_excel import INBOUND_REPORT_HEADERS
from app.modules.masan.masan_inbound_service import (
    _build_export_row,
    _build_export_workbook,
    _format_inbound_datetime,
    _format_report_distance_m,
)
from app.modules.masan.masan_outbound_excel import OUTBOUND_REPORT_HEADERS
from app.modules.masan.masan_outbound_service import _build_outbound_report_row


class MasanReportColumnTests(unittest.TestCase):
    def test_inbound_datetime_uses_order_creation_time_in_vietnam(self):
        cases = (
            (datetime(2026, 11, 10, 8, 30, 45), "2026-11-10 08:30:45"),
            (datetime(2026, 11, 9, 18, 30, 45, tzinfo=timezone.utc), "2026-11-10 01:30:45"),
            (None, ""),
        )
        for created_at, expected in cases:
            with self.subTest(created_at=created_at):
                self.assertEqual(
                    _format_inbound_datetime(SimpleNamespace(created_at=created_at)),
                    expected,
                )

    def test_inbound_workbook_displays_formatted_datetime(self):
        values = [
            [_format_inbound_datetime(SimpleNamespace(created_at=created_at))]
            for created_at in (datetime(2026, 11, 9, 8, 30, 45), datetime(2026, 11, 10, 9, 15, 20))
        ]
        content = _build_export_workbook(values)
        ws = load_workbook(BytesIO(content)).active
        self.assertEqual(ws["A3"].value, "2026-11-09 08:30:45")
        self.assertEqual(ws["A4"].value, "2026-11-10 09:15:20")
        self.assertGreaterEqual(ws.column_dimensions["A"].width, 22)

    def test_inbound_row_matches_headers(self):
        order = SimpleNamespace(
            warehouse=SimpleNamespace(name="WH"),
            created_at=datetime(2026, 11, 10, 8, 30, 45),
        )
        detail = SimpleNamespace(
            details={"vehicle_no": "51C", "inbound_datetime": "46335"},
            from_location=SimpleNamespace(location_name="VT01"),
            to_location=SimpleNamespace(location_name="G100"),
            device="R1",
            start_time=datetime(2026, 10, 28, 14, 40, 15),
            end_time=datetime(2026, 10, 28, 14, 55, 7),
            sorting_persons="Nguyen A",
            distance=25.0084,
            start_battery="85",
            end_battery=80,
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
        self.assertEqual(row[0], "2026-11-10 08:30:45")
        self.assertEqual(row[14], "Nguyen A")
        self.assertEqual(row[15], 25.008)
        self.assertEqual(row[17], "28/10/2026\n14:40:15")
        self.assertEqual(row[18], "28/10/2026\n14:55:07")
        self.assertEqual(row[19], "85")
        self.assertEqual(row[20], "80")
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
            start_time=datetime(2026, 10, 28, 9, 1, 2),
            end_time=datetime(2026, 10, 28, 9, 8, 9),
            start_sorting_time=datetime(2026, 10, 28, 9, 10, 11),
            end_sorting_time=datetime(2026, 10, 28, 9, 20, 30),
            sorting_persons="Tran B",
            distance=25.0,
            start_battery="90",
            end_battery=None,
        )
        row = _build_outbound_report_row(
            detail, allocation, detail_sorting_location="CC01"
        )
        self.assertEqual(len(row), len(OUTBOUND_REPORT_HEADERS))
        self.assertEqual(row[12], "Tran B")
        self.assertEqual(row[13], 25.0)
        self.assertEqual(row[15], "28/10/2026\n09:01:02")
        self.assertEqual(row[16], "28/10/2026\n09:08:09")
        self.assertEqual(row[17], "90")
        self.assertEqual(row[20], "28/10/2026\n09:10:11")
        self.assertEqual(row[21], "28/10/2026\n09:20:30")
        self.assertIsNone(row[18])
        self.assertEqual(row[19], "CC01")


if __name__ == "__main__":
    unittest.main()
