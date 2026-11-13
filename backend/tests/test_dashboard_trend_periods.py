"""Calendar boundary tests; no DB, Redis, settings or AMR connection required.

Run from backend/: python -m unittest discover -s tests -p test_dashboard_trend_periods.py -v
"""

import unittest
from datetime import date, timedelta

from app.modules.warehouse.dashboard.dashboard_trend_periods import build_trend_periods


class TrendCalendarTests(unittest.TestCase):
    def test_week_starts_monday_across_year_boundary(self):
        periods = build_trend_periods(date(2026, 1, 1), "week")
        self.assertEqual(periods[0], (date(2025, 12, 29), date(2025, 12, 29), "29/12"))
        self.assertEqual(periods[-1][:2], (date(2026, 1, 1), date(2026, 1, 1)))
        self.assertEqual(len(periods), 4)

    def test_week_has_one_point_on_monday_and_seven_on_sunday(self):
        self.assertEqual(len(build_trend_periods(date(2026, 10, 12), "week")), 1)
        self.assertEqual(len(build_trend_periods(date(2026, 10, 18), "week")), 7)

    def test_month_includes_leap_day(self):
        periods = build_trend_periods(date(2024, 2, 29), "month")
        self.assertEqual(len(periods), 29)
        self.assertEqual(periods[0][0], date(2024, 2, 1))
        self.assertEqual(periods[-1][1], date(2024, 2, 29))

    def test_month_stops_at_today(self):
        periods = build_trend_periods(date(2026, 10, 16), "month")
        self.assertEqual(len(periods), 16)
        self.assertEqual(periods[-1][1], date(2026, 10, 16))

    def test_quarter_boundaries(self):
        for month in (1, 4, 7, 10):
            with self.subTest(first_month=month):
                today = date(2026, month, 1)
                self.assertEqual(build_trend_periods(today, "quarter"), [
                    (today, today, f"Tháng {month:02d}/2026")
                ])

    def test_quarter_groups_months_and_clips_current_month(self):
        periods = build_trend_periods(date(2024, 3, 15), "quarter")
        self.assertEqual(periods, [
            (date(2024, 1, 1), date(2024, 1, 31), "Tháng 01/2024"),
            (date(2024, 2, 1), date(2024, 2, 29), "Tháng 02/2024"),
            (date(2024, 3, 1), date(2024, 3, 15), "Tháng 03/2024"),
        ])

    def test_year_contains_twelve_months_at_year_end(self):
        periods = build_trend_periods(date(2026, 12, 31), "year")
        self.assertEqual(len(periods), 12)
        self.assertEqual(periods[0][:2], (date(2026, 1, 1), date(2026, 1, 31)))
        self.assertEqual(periods[-1][:2], (date(2026, 12, 1), date(2026, 12, 31)))

    def test_periods_are_contiguous_and_never_include_future_days(self):
        for today in (date(2024, 2, 29), date(2026, 1, 1), date(2026, 10, 16)):
            for mode in ("week", "month", "quarter", "year"):
                with self.subTest(today=today, mode=mode):
                    periods = build_trend_periods(today, mode)
                    self.assertEqual(periods[-1][1], today)
                    for start, end, _ in periods:
                        self.assertLessEqual(start, end)
                        self.assertLessEqual(end, today)
                    for previous, current in zip(periods, periods[1:]):
                        self.assertEqual(previous[1] + timedelta(days=1), current[0])

    def test_old_day_mode_is_not_silently_reinterpreted(self):
        with self.assertRaises(ValueError):
            build_trend_periods(date(2026, 10, 16), "day")


if __name__ == "__main__":
    unittest.main()
