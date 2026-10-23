"""Distance on robot task-status callbacks: SQLite only, no Redis, RCS or map files."""

import os
import unittest
from unittest.mock import patch

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="robot-distance-test",
)

import app.main  # noqa: F401,E402  registers every model on Base.metadata
from sqlalchemy import create_engine, func, insert, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.database import Base  # noqa: E402
from app.modules.robot import robot_service  # noqa: E402
from app.modules.robot.robot_model import TaskStatus  # noqa: E402
from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrderDetail  # noqa: E402
from app.modules.warehouse.location_map.map_route_algo import RouteUnreachableError  # noqa: E402
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation  # noqa: E402
from app.modules.warehouse.transaction_history.history_model import History, Transaction  # noqa: E402


class RobotDistanceCallbackTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:", poolclass=StaticPool,
                                    connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)

        self.put("warehouse", id=1, code="W1")
        self.put("unit", id=1, name="Thung")
        self.put("users", id=1, username="test", email="test@example.invalid", hashed_password="unused")
        self.put("item", id=1, sku="SKU-1", name="Item", base_unit=1, max_quantity=9999,
                 min_quantity=0, warehouse_id=1, supplier="TEST")
        for ident, code in [(101, "SOURCE-NODE"), (102, "DEST-NODE"), (103, "CC-NODE")]:
            self.put("location", id=ident, location_name=code, location_code=code, warehouse_id=1)

        self.put("inbound_order", id=1, order_code="IN-1", created_by_id=1, warehouse_id=1)
        self.put("inbound_order_detail", id=1, inbound_order_id=1, from_location_id=101,
                 to_location_id=102, status="issued", detail_type="auto")
        self.put("item_stock", id=1, item_id=1, unit_id=1, location_id=101, quantity=10,
                 status="pending", is_active=True, inbound_order_detail_id=1)
        self.put("robot_task", id=1, inbound_order_detail_id=1, order_id="TDS_IN_1", quantity=10,
                 process_code="Inbound", system_code="Thadosoft", task_order_detail="[]")

        self.put("outbound_order", id=1, order_code="OUT-1", warehouse_id=1, created_by_id=1)
        self.put("outbound_order_detail", id=1, outbound_order_id=1, item_id=1, quantity=5,
                 unit="Thung", detail_type="auto", details={})
        self.put("item_stock", id=2, item_id=1, unit_id=1, location_id=101, quantity=5,
                 status="available", is_active=True)
        self.put("robot_task", id=2, order_id="TDS_OUT_1", quantity=5, process_code="Outbound",
                 system_code="Thadosoft", task_order_detail="[]")
        for ident, to_location in [(1, 102), (2, 102), (3, 103)]:
            self.put("outbound_order_allocation", id=ident, outbound_order_detail_id=1,
                     item_stock_id=2, quantity=1, status="issued", allocation_type="outbound",
                     from_location_id=101, to_location_id=to_location, robot_task_id=2)
        self.db.commit()

        self.distance = self.patch("calculate_distance", return_value={"distance_mm": 1234.5, "distance_m": 1.235})
        self.patch("check_and_create_notifications_under_over_min_max")
        self.patch("cache_get", return_value=None)
        self.patch("publish_robot_task_completed")
        telemetry = patch.object(robot_service.robot_telemetry, "get_robot_data", return_value=None)
        telemetry.start()
        self.addCleanup(telemetry.stop)

    def put(self, table, **values):
        self.db.execute(insert(Base.metadata.tables[table]).values(**values))

    def patch(self, name, **kwargs):
        patcher = patch.object(robot_service, name, **kwargs)
        mock = patcher.start()
        self.addCleanup(patcher.stop)
        return mock

    def callback(self, order_id, status):
        self.db.expire_all()
        return robot_service.task_status_service.receive_task_status(
            self.db, {"orderId": order_id, "status": status, "deviceNum": "R1"}
        )

    def count(self, model, **filters):
        query = select(func.count()).select_from(model)
        for key, value in filters.items():
            query = query.where(getattr(model, key) == value)
        return self.db.scalar(query)

    def test_inbound_distance_once_across_repeated_callbacks(self):
        for status in ("6", "6", "8"):
            self.assertIsNotNone(self.callback("TDS_IN_1", status))
        self.assertIsNone(self.callback("TDS_IN_1", "8"))  # duplicate completed exits early

        self.db.expire_all()
        detail = self.db.get(InboundOrderDetail, 1)
        self.assertEqual(detail.status, "completed")
        self.assertEqual(detail.distance, 1.235)
        self.distance.assert_called_once()
        self.assertEqual(self.distance.call_args.args[1:], (1, "SOURCE-NODE", "DEST-NODE"))
        self.assertEqual(self.count(Transaction, transaction_type="inbound"), 1)
        self.assertEqual(self.count(History, inbound_order_id=1), 1)
        self.assertEqual(self.count(TaskStatus, order_id="TDS_IN_1"), 3)

    def test_inbound_distance_failure_never_breaks_callback(self):
        for error in (RouteUnreachableError("no path"), RuntimeError("map file broken")):
            with self.subTest(error=type(error).__name__):
                self.setUp()
                self.distance.side_effect = error
                self.assertIsNotNone(self.callback("TDS_IN_1", "8"))
                self.db.expire_all()
                detail = self.db.get(InboundOrderDetail, 1)
                self.assertEqual(detail.status, "completed")
                self.assertIsNone(detail.distance)
                self.assertEqual(self.count(Transaction, transaction_type="inbound"), 1)
                self.assertEqual(self.count(TaskStatus, order_id="TDS_IN_1"), 1)

    def test_existing_inbound_distance_is_kept(self):
        self.db.get(InboundOrderDetail, 1).distance = 99.0
        self.db.commit()
        self.callback("TDS_IN_1", "8")
        self.distance.assert_not_called()
        self.db.expire_all()
        self.assertEqual(self.db.get(InboundOrderDetail, 1).distance, 99.0)

    def test_outbound_distance_once_per_route_and_not_recomputed(self):
        self.callback("TDS_OUT_1", "6")
        self.assertEqual(self.distance.call_count, 2)  # 101->102 shared by two allocations, 101->103
        routes = sorted(call.args[2:] for call in self.distance.call_args_list)
        self.assertEqual(routes, [("SOURCE-NODE", "CC-NODE"), ("SOURCE-NODE", "DEST-NODE")])

        self.callback("TDS_OUT_1", "6")
        self.assertEqual(self.distance.call_count, 2)

        self.db.expire_all()
        for ident in (1, 2, 3):
            allocation = self.db.get(OutboundOrderAllocation, ident)
            self.assertEqual(allocation.distance, 1.235)
            self.assertEqual(allocation.status, "in_progress")

    def test_outbound_distance_failure_never_breaks_callback(self):
        self.distance.side_effect = RuntimeError("boom")
        self.assertIsNotNone(self.callback("TDS_OUT_1", "6"))
        self.db.expire_all()
        self.assertIsNone(self.db.get(OutboundOrderAllocation, 1).distance)
        self.assertEqual(self.db.get(OutboundOrderAllocation, 1).status, "in_progress")


if __name__ == "__main__":
    unittest.main()
