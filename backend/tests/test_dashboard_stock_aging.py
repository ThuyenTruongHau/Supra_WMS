"""Stock aging boundaries and API contract; no operational DB or AMR calls."""

import os
import unittest
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, literal, select
from sqlalchemy.orm import Query, Session

with patch.dict(os.environ, {
    "DEBUG": "false",
    "DATABASE_URL": "postgresql://test:test@127.0.0.1/wms_test",
}):
    from app.modules.warehouse.dashboard import dashboard_api
    from app.modules.warehouse.dashboard import dashboard_stock_aging_service as service
    from app.modules.warehouse.dashboard.dashboard_schema import ReportStockAgingBucketResponse


class StockAgingBoundaryTests(unittest.TestCase):
    def setUp(self):
        # Evaluate actual SQL CASE/WHERE expressions on constants in memory.
        self.engine = create_engine("sqlite:///:memory:")
        self.addCleanup(self.engine.dispose)
        self.connection = self.engine.connect()
        self.addCleanup(self.connection.close)

    def test_boundaries_match_exactly_one_detail_group(self):
        expected = {
            0: "lte_90", 1: "lte_90", 89: "lte_90", 90: "lte_90",
            91: "days_91_180", 179: "days_91_180", 180: "days_91_180",
            181: "days_181_360", 359: "days_181_360", 360: "days_181_360",
            361: "gt_360", 1000: "gt_360",
        }
        for days, bucket in expected.items():
            with self.subTest(days=days):
                expression = literal(days)
                actual = self.connection.execute(select(service._bucket_key_expr(expression))).scalar_one()
                self.assertEqual(actual, bucket)
                matching = [key for key in service.BUCKET_KEYS if self.connection.execute(
                    select(service._bucket_holding_filter(key, expression))
                ).scalar_one()]
                self.assertEqual(matching, [bucket])

    def test_no_gaps_or_overlaps_for_all_days_through_first_year(self):
        for days in range(367):
            expression = literal(days)
            matches = sum(bool(self.connection.execute(select(
                service._bucket_holding_filter(key, expression)
            )).scalar_one()) for key in service.BUCKET_KEYS)
            self.assertEqual(matches, 1, f"holding_days={days}")

    def test_unknown_detail_group_is_rejected(self):
        with self.assertRaises(ValueError):
            service._bucket_holding_filter("gt_60", literal(100))


class StockAgingSummaryTests(unittest.TestCase):
    def test_empty_inventory_still_returns_four_zero_buckets(self):
        buckets = service._summaries_from_totals({})
        self.assertEqual([b.key for b in buckets], list(service.BUCKET_KEYS))
        self.assertEqual([b.total_quantity for b in buckets], [0, 0, 0, 0])
        self.assertEqual([b.percent for b in buckets], [0, 0, 0, 0])

    def test_percentages_use_all_four_groups(self):
        totals = dict(zip(service.BUCKET_KEYS, map(Decimal, (10, 20, 30, 40))))
        buckets = service._summaries_from_totals(totals)
        self.assertEqual([b.percent for b in buckets], [10, 20, 30, 40])
        self.assertEqual([b.label for b in buckets], [
            "0–90 ngày", "91–180 ngày", "181–360 ngày", "Trên 360 ngày",
        ])

    def test_overview_includes_four_groups_and_preserves_quantities(self):
        rows = [SimpleNamespace(bucket=key, total_qty=Decimal(index + 1))
                for index, key in enumerate(service.BUCKET_KEYS)]
        with Session() as db, patch.object(service, "_ensure_warehouse_exists"), \
             patch.object(Query, "all", autospec=True, side_effect=[rows, []]):
            result = service.get_report_stock_aging_overview(db, warehouse_id=9)
        self.assertEqual([b.total_quantity for b in result.buckets], [1, 2, 3, 4])
        self.assertEqual(sum(b.percent for b in result.buckets), 100)


class StockAgingApiTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(dashboard_api.router, prefix="/api/v1")
        app.dependency_overrides[dashboard_api.get_db] = lambda: object()
        app.dependency_overrides[dashboard_api._REPORT_STOCK_AGING_READ] = lambda: None
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_all_four_bucket_keys_are_accepted(self):
        def report(_db, *, warehouse_id, bucket):
            return ReportStockAgingBucketResponse(bucket=bucket, items=[])

        with patch.object(service, "get_report_stock_aging_bucket", side_effect=report) as mock_report:
            for key in service.BUCKET_KEYS:
                with self.subTest(bucket=key):
                    response = self.client.get("/api/v1/dashboard/report-stock-aging/bucket", params={
                        "warehouse_id": 9, "bucket": key,
                    })
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()["bucket"], key)
                    self.assertEqual(mock_report.call_args.kwargs["bucket"], key)

    def test_old_unknown_and_missing_bucket_keys_are_rejected(self):
        with patch.object(service, "get_report_stock_aging_bucket") as report:
            for key in ("lte_30", "days_31_60", "gt_60", "unknown", None):
                with self.subTest(bucket=key):
                    params = {"warehouse_id": 9}
                    if key is not None:
                        params["bucket"] = key
                    response = self.client.get("/api/v1/dashboard/report-stock-aging/bucket", params=params)
                    self.assertEqual(response.status_code, 422)
            report.assert_not_called()


if __name__ == "__main__":
    unittest.main()
