"""Robot charts: task grain, as-of callbacks, missing data and API contract (SQLite)."""

import os
import unittest
from datetime import date, datetime, timedelta, timezone

os.environ.update(
    DEBUG="false", DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0", CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://", APP_NAME="robot-charts-test",
)

import app.main  # noqa: E402,F401 - register all models without starting services
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, insert, update  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.database import Base, get_db  # noqa: E402
from app.core.dependencies import get_current_user  # noqa: E402
from app.modules.warehouse.dashboard.dashboard_api import router  # noqa: E402
from app.modules.warehouse.dashboard import dashboard_robot_performance_service as svc  # noqa: E402

DAY = date(2026, 10, 23)
AT = datetime(2026, 10, 23, 8)


class RobotPerformanceChartTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:", poolclass=StaticPool,
                                    connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        for ident in (1, 2):
            self.put("warehouse", id=ident, code=f"W{ident}")
            self.put("inbound_order", id=ident, order_code=f"IN-{ident}",
                     created_by_id=1, warehouse_id=ident)
            self.put("outbound_order", id=ident, order_code=f"OUT-{ident}",
                     created_by_id=1, warehouse_id=ident)
            self.put("outbound_order_detail", id=ident, outbound_order_id=ident, item_id=1,
                     quantity=5, unit="Thung", detail_type="auto", details={})
        self.put("unit", id=1, name="Thung")
        self.put("users", id=1, username="test", email="test@example.invalid", hashed_password="unused")
        self.put("item", id=1, sku="SKU", name="Item", base_unit=1, warehouse_id=1,
                 max_quantity=9999, min_quantity=0, supplier="TEST")
        self.put("location", id=1, location_code="L1", location_name="L1", warehouse_id=1)
        self.put("item_stock", id=1, item_id=1, unit_id=1, location_id=1, quantity=5,
                 status="available", is_active=True)
        self.task(1, "inbound", distance=60, seconds=60)
        self.task(2, "outbound", distance=120, seconds=120)
        # Three CC rows share one robot movement. Their clocks differ slightly.
        self.allocation(21, 2, distance=120, start_time=AT + timedelta(seconds=1),
                        end_time=AT + timedelta(seconds=119))
        self.allocation(22, 2, distance=120, start_time=AT + timedelta(seconds=2),
                        end_time=AT + timedelta(seconds=118))
        self.task(3, "return", distance=30, seconds=60, device="R2")
        self.task(4, "outbound", distance=999, seconds=1, warehouse=2)
        self.task(5, "outbound", distance=999, status="7")
        self.task(6, "return", distance=999, status="3")
        self.allocation(99, None, distance=999)
        self.db.commit()

    def put(self, table, **values):
        self.db.execute(insert(Base.metadata.tables[table]).values(**values))

    def allocation(self, ident, task_id, **values):
        defaults = dict(outbound_order_detail_id=1, item_stock_id=1, quantity=1,
                        status="pre_completed", allocation_type="outbound",
                        robot_task_id=task_id, device="R1")
        self.put("outbound_order_allocation", id=ident, **(defaults | values))

    def task(self, ident, kind, *, distance=None, seconds=60, device="R1", status="8", warehouse=1):
        if kind == "inbound":
            self.put("inbound_order_detail", id=ident, inbound_order_id=warehouse,
                     detail_type="auto", status="completed", device=device,
                     distance=distance, start_time=AT, end_time=AT + timedelta(seconds=seconds))
        else:
            self.allocation(ident * 10, ident, outbound_order_detail_id=warehouse,
                            allocation_type=kind, distance=distance, device=device,
                            start_time=AT, end_time=AT + timedelta(seconds=seconds))
        self.put("robot_task", id=ident, order_id=f"T{ident}", quantity=1,
                 process_code="P", system_code="WMS", task_order_detail="[]",
                 inbound_order_detail_id=ident if kind == "inbound" else None)
        self.status(ident, status=status, device=device)

    def status(self, ident, *, status="8", device="R1", at=AT):
        self.put("task_status", order_id=f"T{ident}", status=status,
                 device_num=device, created_at=at)

    def report(self, **values):
        return svc.get_robot_performance(self.db, **(dict(
            warehouse_id=1, start_date=DAY, end_date=DAY,
        ) | values))

    def test_task_grain_weighted_speed_and_totals(self):
        self.status(2, at=AT + timedelta(minutes=1))  # duplicate completed callback
        report = self.report()
        total = report.summary
        self.assertEqual((total.inbound_completed, total.outbound_completed, total.return_completed), (1, 1, 1))
        self.assertEqual((total.completed_count, total.failed_count, total.cancelled_count), (3, 1, 1))
        self.assertEqual(total.distance_m, 210)
        self.assertEqual(total.duration_seconds, 240)
        self.assertAlmostEqual(total.average_speed_mps, 210 / 240)
        self.assertEqual(total.speed_coverage_percent, 100)
        self.assertEqual(sum(point.completed_count for point in report.points), total.completed_count)
        self.assertEqual(sum(point.distance_m or 0 for point in report.points), total.distance_m)
        self.assertEqual(sum(robot.completed_count for robot in report.robots), total.completed_count)
        self.assertEqual(sum(robot.distance_m or 0 for robot in report.robots), total.distance_m)
        self.assertEqual(report.points[0].completed_count, 0)
        self.assertIsNone(report.points[0].average_speed_mps)
        self.assertEqual(len(report.points), 24)

    def test_terminal_cutoff_ties_and_cross_day(self):
        self.task(7, "inbound", distance=10)
        self.db.execute(update(Base.metadata.tables["task_status"]).where(
            Base.metadata.tables["task_status"].c.order_id == "T7"
        ).values(created_at=datetime(2026, 10, 22, 23, 59), status="7"))
        self.status(7, at=datetime(2026, 10, 24), status="8")
        self.assertEqual(self.report().summary.completed_count, 3)
        next_day = self.report(start_date=date(2026, 10, 24), end_date=date(2026, 10, 24))
        self.assertEqual(next_day.summary.completed_count, 1)
        self.status(1, at=AT, status="7")  # same time; higher id wins
        self.assertEqual(self.report().summary.completed_count, 2)
        self.assertEqual(self.report().summary.failed_count, 2)
        self.assertEqual(len(self.report(start_date=date(2026, 10, 22)).points), 2)

    def test_missing_robot_fallback_priority(self):
        table = Base.metadata.tables["task_status"]
        self.db.execute(update(table).where(table.c.order_id == "T1").values(device_num=" "))
        self.status(1, status="6", device="History", at=AT - timedelta(minutes=1))
        self.status(1, status="6", device="Future", at=datetime(2026, 10, 24))
        self.task(7, "inbound", distance=10, device=None)
        self.task(8, "inbound", distance=10, device=None)
        self.db.execute(update(Base.metadata.tables["inbound_order_detail"]).where(
            Base.metadata.tables["inbound_order_detail"].c.id == 8
        ).values(device=" Detail "))
        report = self.report()
        self.assertEqual(report.devices, ["Detail", "History", "R1", "R2"])
        self.assertEqual(report.robots[-1].device_num, None)
        self.assertEqual(report.robots[-1].completed_count, 1)
        self.status(1, device="Terminal", at=AT + timedelta(seconds=1))
        self.assertIn("Terminal", self.report().devices)

    def test_invalid_and_missing_data_not_zero_speed(self):
        self.task(7, "inbound")
        self.task(8, "outbound", distance=-1)
        self.task(9, "return", distance=50, seconds=0)
        self.task(10, "return", distance=50, seconds=-10)
        self.task(11, "return", distance=0)
        self.task(12, "outbound", distance=20)
        self.db.execute(update(Base.metadata.tables["outbound_order_allocation"]).where(
            Base.metadata.tables["outbound_order_allocation"].c.robot_task_id == 12
        ).values(start_time=None))
        total = self.report().summary
        self.assertEqual(total.completed_count, 9)
        self.assertEqual(total.distance_count, 7)
        self.assertEqual(total.speed_eligible_count, 4)
        self.assertEqual(total.distance_m, 330)
        self.assertAlmostEqual(total.average_speed_mps, 210 / 300)
        self.assertIsNone(self.report(device_num="none").summary.average_speed_mps)

    def test_filters_empty_and_validation(self):
        filtered = self.report(device_num="R1", task_kind="outbound")
        self.assertEqual(filtered.summary.completed_count, 1)
        self.assertEqual(filtered.summary.distance_m, 120)
        self.assertEqual(self.report(device_num="R2").devices, ["R1", "R2"])
        empty = self.report(start_date=date(2026, 10, 25), end_date=date(2026, 10, 26))
        self.assertEqual(empty.summary.completed_count, 0)
        self.assertIsNone(empty.summary.distance_m)
        self.assertEqual(len(empty.points), 2)
        with self.assertRaises(ValueError):
            self.report(end_date=date(2026, 10, 22))
        with self.assertRaises(ValueError):
            self.report(warehouse_id=999)

    def test_timezone_conversion(self):
        value = datetime(2026, 10, 22, 17, 30, tzinfo=timezone.utc)
        self.assertEqual(svc._vn_datetime(value).date(), DAY)
        self.assertEqual(svc._vn_datetime(value).hour, 0)

    def test_api_validation_serialization_and_auth(self):
        api = FastAPI()
        api.include_router(router, prefix="/api/v1")
        api.dependency_overrides[get_db] = lambda: self.db
        client = TestClient(api)
        url = "/api/v1/dashboard/report-robot-performance"
        params = dict(warehouse_id=1, start_date=DAY.isoformat(), end_date=DAY.isoformat())
        self.assertIn(client.get(url, params=params).status_code, (401, 403))
        api.dependency_overrides[get_current_user] = lambda: object()
        response = client.get(url, params=params)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["summary"]["completed_count"], 3)
        self.assertTrue(response.json()["points"][0]["period_start"].endswith("+07:00"))
        self.assertEqual(client.get(url, params=params | {"task_kind": "invalid"}).status_code, 422)
        self.assertEqual(client.get(url, params=params | {"warehouse_id": 0}).status_code, 422)
        self.assertEqual(client.get(url, params=params | {"end_date": "2026-10-22"}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
