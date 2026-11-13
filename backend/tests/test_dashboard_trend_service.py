"""Trend aggregation and API contract tests with all database reads mocked."""

import os
import unittest
from contextlib import ExitStack
from datetime import date
from decimal import Decimal
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

# Settings may otherwise inherit a non-boolean DEBUG from the host. No database
# connection is opened; service reads and API DB/auth dependencies are mocked.
with patch.dict(os.environ, {
    "DEBUG": "false",
    "DATABASE_URL": "postgresql://test:test@127.0.0.1/wms_test",
}):
    from app.modules.warehouse.dashboard import dashboard_api
    from app.modules.warehouse.dashboard import dashboard_trend_service as service
    from app.modules.warehouse.dashboard.dashboard_schema import ReportTrendResponse


class TrendAggregationTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.today = date(2024, 3, 15)
        self.db = object()
        self.snapshots = {
            date(2024, 1, 30): (Decimal("90"), Decimal("900")),
            date(2024, 1, 31): (Decimal("100"), Decimal("1000")),
            date(2024, 2, 29): (Decimal("200"), Decimal("2000")),
            date(2024, 3, 14): (Decimal("300"), Decimal("3000")),
        }
        self.stack.enter_context(patch.object(service, "vn_today", return_value=self.today))
        self.ensure = self.stack.enter_context(patch.object(service, "_ensure_warehouse_exists"))
        self.inbound_qty = self.stack.enter_context(
            patch.object(
                service,
                "_sum_inbound_quantity_by_day",
                return_value={
                    date(2024, 3, 12): 50,
                    date(2024, 1, 31): 2,
                    date(2024, 2, 29): 3,
                    self.today: 4,
                },
            )
        )
        self.outbound_qty = self.stack.enter_context(
            patch.object(
                service,
                "_sum_outbound_quantity_by_day",
                return_value={
                    date(2024, 3, 14): 20,
                    date(2024, 1, 5): 7,
                    self.today: 8,
                },
            )
        )
        self.stack.enter_context(patch.object(service, "_load_snapshot_map", return_value=self.snapshots))

    def test_quarter_sums_quantities_and_inventory_from_month_end_snapshots(self):
        result = service.get_report_trends(self.db, warehouse_id=9, granularity="quarter")
        self.assertEqual(result.granularity, "quarter")
        self.assertEqual([p.inbound_quantity for p in result.points], [2, 3, 4])
        self.assertEqual([p.outbound_quantity for p in result.points], [7, 0, 8])
        self.assertEqual(
            [p.inventory_quantity for p in result.points],
            [Decimal("100"), Decimal("200"), Decimal("0")],
        )
        self.assertEqual(result.points[-1].period_end, self.today)
        self.ensure.assert_called_once_with(self.db, 9)
        for call in (
            self.inbound_qty.call_args_list + self.outbound_qty.call_args_list
        ):
            self.assertEqual(call.kwargs["warehouse_id"], 9)
            self.assertEqual(call.kwargs["range_start"], date(2024, 1, 1))
            self.assertEqual(call.kwargs["range_end"], self.today)

    def test_week_inventory_only_on_snapshot_days(self):
        result = service.get_report_trends(self.db, warehouse_id=9, granularity="week")
        self.assertEqual(len(result.points), 5)
        self.assertEqual(result.points[0].period_start, date(2024, 3, 11))
        self.assertEqual([p.inbound_quantity for p in result.points], [0, 50, 0, 0, 4])
        inv_qtys = [p.inventory_quantity for p in result.points]
        self.assertEqual(inv_qtys[0], Decimal("0"))
        self.assertEqual(inv_qtys[1], Decimal("0"))
        self.assertEqual(inv_qtys[-2], Decimal("300"))
        self.assertEqual(inv_qtys[-1], Decimal("0"))

    def test_snapshot_today_used_when_present(self):
        self.snapshots[self.today] = (Decimal("350"), Decimal("3500"))
        result = service.get_report_trends(self.db, warehouse_id=9, granularity="week")
        self.assertEqual(result.points[-1].inventory_quantity, Decimal("350"))
        self.assertEqual(result.points[-1].inventory_value, Decimal("3500"))

    def test_month_starts_on_first_day_and_uses_snapshot_per_day(self):
        result = service.get_report_trends(self.db, warehouse_id=9, granularity="month")
        self.assertEqual(len(result.points), 15)
        self.assertEqual(result.points[0].period_start, date(2024, 3, 1))
        self.assertTrue(all(p.period_start == p.period_end for p in result.points))
        self.assertEqual(result.points[-1].inventory_quantity, Decimal("0"))
        self.assertEqual(result.points[-2].inventory_quantity, Decimal("300"))

    def test_year_aggregates_elapsed_months_only(self):
        result = service.get_report_trends(self.db, warehouse_id=9, granularity="year")
        self.assertEqual(len(result.points), 3)
        self.assertEqual(result.points[0].period_start, date(2024, 1, 1))
        self.assertEqual(result.points[-1].period_end, self.today)
        self.assertEqual(sum(p.inbound_quantity for p in result.points), 9)
        self.assertEqual(
            [p.inventory_quantity for p in result.points],
            [Decimal("100"), Decimal("200"), Decimal("0")],
        )


class TrendApiTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(dashboard_api.router, prefix="/api/v1")
        app.dependency_overrides[dashboard_api.get_db] = lambda: object()
        app.dependency_overrides[dashboard_api._REPORT_TREND_READ] = lambda: None
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        service_patch = patch.object(
            service, "get_report_trends",
            side_effect=lambda _db, *, warehouse_id, granularity: ReportTrendResponse(
                granularity=granularity, points=[]
            ),
        )
        self.mock_service = service_patch.start()
        self.addCleanup(service_patch.stop)

    def test_default_is_current_week(self):
        response = self.client.get("/api/v1/dashboard/report-trends", params={"warehouse_id": 9})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["granularity"], "week")

    def test_four_modes_are_accepted_and_forwarded(self):
        for mode in ("week", "month", "quarter", "year"):
            with self.subTest(mode=mode):
                response = self.client.get("/api/v1/dashboard/report-trends", params={
                    "warehouse_id": 9, "granularity": mode,
                })
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["granularity"], mode)
                self.assertEqual(self.mock_service.call_args.kwargs["granularity"], mode)

    def test_old_day_and_unknown_modes_are_rejected(self):
        for mode in ("day", "unknown"):
            with self.subTest(mode=mode):
                response = self.client.get("/api/v1/dashboard/report-trends", params={
                    "warehouse_id": 9, "granularity": mode,
                })
                self.assertEqual(response.status_code, 422)
        self.mock_service.assert_not_called()

    def test_invalid_warehouse_is_rejected_before_service(self):
        response = self.client.get("/api/v1/dashboard/report-trends", params={"warehouse_id": 0})
        self.assertEqual(response.status_code, 422)
        self.mock_service.assert_not_called()


if __name__ == "__main__":
    unittest.main()
