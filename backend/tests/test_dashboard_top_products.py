"""Top products API and SQL limits, without database or AMR access."""

import os
import unittest
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Query, Session

with patch.dict(os.environ, {
    "DEBUG": "false",
    "DATABASE_URL": "postgresql://test:test@127.0.0.1/wms_test",
}):
    from app.modules.warehouse.dashboard import dashboard_api
    from app.modules.warehouse.dashboard import dashboard_top_products_service as service
    from app.modules.warehouse.dashboard.dashboard_schema import (
        ReportTopProductsResponse, TopProductRow,
    )


class TopProductsPeriodTests(unittest.TestCase):
    def test_product_identifiers_are_preserved_with_display_names(self):
        rows = [
            SimpleNamespace(item_id=2, sku="4603.637", name="Nút bịt lỗ ren M6", total_qty=20),
            SimpleNamespace(item_id=13, sku="RC4-3106-000", name="M-Rollor-Bushing-S", total_qty=30),
            SimpleNamespace(item_id=14, sku="001.020", name="Leading zero SKU", total_qty=10),
        ]
        products = service._rows_to_top_product(rows)
        self.assertEqual([p.sku for p in products], ["4603.637", "RC4-3106-000", "001.020"])
        self.assertEqual(products[0].name, "Nút bịt lỗ ren M6")
        self.assertEqual(products[0].label, "4603.637")
        self.assertEqual(products[0].total_quantity, 20)

    def test_rolling_windows_include_today(self):
        for today in (date(2026, 10, 16), date(2024, 3, 1), date(2026, 1, 1)):
            for period, days in (("week", 7), ("month", 30), ("three_months", 90)):
                with self.subTest(today=today, period=period):
                    self.assertEqual(service._period_start(period, today), today - timedelta(days=days - 1))

    def test_invalid_period_is_not_silently_treated_as_month(self):
        with self.assertRaises(ValueError):
            service._period_start("invalid", date(2026, 10, 16))

    def test_sql_limits_for_all_three_rankings(self):
        captured = []

        def capture_query(query):
            captured.append(str(query.statement.compile(
                dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True},
            )))
            return []

        with Session() as db, patch.object(Query, "all", autospec=True, side_effect=capture_query):
            for limit in (5, 10, 15):
                for helper in (service._top_inbound, service._top_outbound, service._top_stock):
                    with self.subTest(limit=limit, helper=helper.__name__):
                        kwargs = {"warehouse_id": 9, "limit": limit}
                        if helper is not service._top_stock:
                            kwargs["start_date"] = date(2026, 7, 19)
                        self.assertEqual(helper(db, **kwargs), [])
                        self.assertIn(f"LIMIT {limit}", captured[-1])
                        self.assertIn("ORDER BY", captured[-1])
                        self.assertIn("item.id ASC", captured[-1])

    def test_period_and_limit_reach_all_rankings(self):
        row = TopProductRow(item_id=1, label="SKU-1", total_quantity=20)
        db = object()
        today = date(2026, 10, 16)
        with patch.object(service, "vn_today", return_value=today), \
             patch.object(service, "_ensure_warehouse_exists"), \
             patch.object(service, "_top_inbound", return_value=[row]) as inbound, \
             patch.object(service, "_top_outbound", return_value=[]) as outbound, \
             patch.object(service, "_top_stock", return_value=[]) as stock:
            result = service.get_report_top_products(db, warehouse_id=9, period="three_months", limit=15)
            expected_start = date(2026, 7, 19)
            inbound.assert_called_once_with(db, warehouse_id=9, start_date=expected_start, limit=15)
            outbound.assert_called_once_with(db, warehouse_id=9, start_date=expected_start, limit=15)
            stock.assert_called_once_with(db, warehouse_id=9, limit=15)
            self.assertEqual(result.limit, 15)
            self.assertEqual(result.inbound_top, [row])
            self.assertEqual(result.outbound_top, [])

    def test_invalid_limit_is_rejected_before_database_access(self):
        with patch.object(service, "_ensure_warehouse_exists") as ensure:
            with self.assertRaises(ValueError):
                service.get_report_top_products(object(), warehouse_id=9, period="week", limit=20)
            ensure.assert_not_called()


class TopProductsApiTests(unittest.TestCase):
    def setUp(self):
        app = FastAPI()
        app.include_router(dashboard_api.router, prefix="/api/v1")
        app.dependency_overrides[dashboard_api.get_db] = lambda: object()
        app.dependency_overrides[dashboard_api._REPORT_TREND_READ] = lambda: None
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_default_is_week_and_top_five(self):
        with patch.object(service, "get_report_top_products", return_value=ReportTopProductsResponse(
            period="week", inbound_top=[], outbound_top=[], stock_top=[],
        )) as report:
            response = self.client.get("/api/v1/dashboard/report-top-products", params={"warehouse_id": 9})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["period"], "week")
            self.assertEqual(response.json()["limit"], 5)
            self.assertEqual(report.call_args.kwargs["limit"], 5)

    def test_all_period_and_limit_combinations(self):
        def report(_db, *, warehouse_id, period, limit):
            return ReportTopProductsResponse(
                period=period, limit=limit, inbound_top=[], outbound_top=[], stock_top=[],
            )

        with patch.object(service, "get_report_top_products", side_effect=report) as mock_report:
            for period in ("week", "month", "three_months"):
                for limit in (5, 10, 15):
                    with self.subTest(period=period, limit=limit):
                        response = self.client.get("/api/v1/dashboard/report-top-products", params={
                            "warehouse_id": 9, "period": period, "limit": limit,
                        })
                        self.assertEqual(response.status_code, 200)
                        self.assertEqual(response.json()["limit"], limit)
                        self.assertEqual(mock_report.call_args.kwargs["period"], period)

    def test_invalid_limits_and_periods_return_422(self):
        with patch.object(service, "get_report_top_products") as report:
            for limit in (0, 4, 6, 12, 16, 20, "5.5", "bad"):
                with self.subTest(limit=limit):
                    response = self.client.get("/api/v1/dashboard/report-top-products", params={
                        "warehouse_id": 9, "limit": limit,
                    })
                    self.assertEqual(response.status_code, 422)
            response = self.client.get("/api/v1/dashboard/report-top-products", params={
                "warehouse_id": 9, "period": "invalid",
            })
            self.assertEqual(response.status_code, 422)
            report.assert_not_called()


if __name__ == "__main__":
    unittest.main()
