import unittest

from app.modules.warehouse.lot_number_utils import (
    coerce_masan_lot_cell,
    format_lot_compact_ddmmyy,
    format_lot_for_masan_excel,
    format_lot_value_for_display,
    normalize_lot_parse_input,
    normalize_masan_lot_cell,
    normalize_storage_lot_pair,
    pad_missing_leading_zero_compact,
    parse_legacy_lot_number,
    resolve_lot_number_input,
)


class LotLeadingZeroTests(unittest.TestCase):
    def test_pad_five_digit_compact(self):
        self.assertEqual(pad_missing_leading_zero_compact("71026"), "071026")
        self.assertIsNone(pad_missing_leading_zero_compact("710266"))
        self.assertIsNone(pad_missing_leading_zero_compact("99126"))

    def test_parse_legacy_single_and_range(self):
        self.assertEqual(parse_legacy_lot_number("71026"), ("071026", "071026"))
        self.assertEqual(
            parse_legacy_lot_number("71026-81026"),
            ("071026", "081026"),
        )

    def test_resolve_input(self):
        self.assertEqual(resolve_lot_number_input("71026"), ("071026", "071026"))

    def test_parse_slash_four_digit_year(self):
        self.assertEqual(parse_legacy_lot_number("22/09/2026"), ("220926", "220926"))

    def test_parse_iso_date(self):
        self.assertEqual(parse_legacy_lot_number("2026-03-10"), ("100326", "100326"))
        self.assertEqual(
            parse_legacy_lot_number("2026-03-10T00:00:00"),
            ("100326", "100326"),
        )
        self.assertEqual(
            normalize_lot_parse_input("2026-03-10 00:00:00"),
            "2026-03-10",
        )
        self.assertEqual(format_lot_value_for_display("2026-03-10"), "10/03/26")
        self.assertEqual(
            format_lot_for_masan_excel(
                lot_number_from="2026-03-10",
                lot_number_to="2026-03-10",
            ),
            "100326",
        )

    def test_normalize_masan_lot_cell(self):
        self.assertEqual(normalize_masan_lot_cell("19/08/26"), "190826")
        self.assertEqual(coerce_masan_lot_cell("71026"), "071026")
        self.assertIsNone(normalize_masan_lot_cell("040526-050526"))

    def test_normalize_storage_lot_pair(self):
        self.assertEqual(
            normalize_storage_lot_pair("22/09/2026", "22/09/2026"),
            ("220926", "220926"),
        )
        self.assertEqual(
            normalize_storage_lot_pair("19/08/26", "19/08/26"),
            ("190826", "190826"),
        )

    def test_format_lot_compact_ddmmyy(self):
        self.assertEqual(format_lot_compact_ddmmyy("19/08/26"), "190826")
        self.assertEqual(format_lot_compact_ddmmyy("2026-03-10"), "100326")
        self.assertEqual(format_lot_compact_ddmmyy("040526-050526"), "040526-050526")
        self.assertEqual(format_lot_compact_ddmmyy("71026"), "071026")

    def test_masan_excel_export_compact(self):
        self.assertEqual(
            format_lot_for_masan_excel(
                lot_number_from="071026",
                lot_number_to="071026",
            ),
            "071026",
        )
        self.assertEqual(
            format_lot_for_masan_excel(lot_number="19/08/26"),
            "190826",
        )


if __name__ == "__main__":
    unittest.main()
