"""Isolated regressions: returning a VT pallet after its CC assignment is cleared."""

import unittest
from unittest.mock import patch

# Sets unreachable service URLs before importing the application.
from test import test_outbound_remaining_quantity as fixture

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, update
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.modules.masan import masan_api
from app.modules.masan.masan_sorting_return_service import list_sorting_zone_return_tasks
from app.modules.robot.robot_model import RobotTask
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation


class SortingReturnTasksTests(unittest.TestCase):
    put = fixture.OutboundRemainingQuantityTests.put
    cache_details = fixture.OutboundRemainingQuantityTests.cache_details

    def setUp(self):
        with patch.object(fixture, "create_engine", side_effect=lambda url: create_engine(
            url, connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )):
            fixture.OutboundRemainingQuantityTests.setUp(self)
        self.cache.clear()
        self.db.execute(update(ItemStock).where(ItemStock.id == 1).values(location_id=102, quantity=5))
        self.put("robot_task", id=1, order_id="TDS_Return_test", quantity=5,
                 process_code="Return", system_code="Thadosoft",
                 task_order_detail='[{"taskPath":"VT-NODE,SOURCE-NODE"}]')
        self.put("outbound_order_allocation", id=1, outbound_order_detail_id=1,
                 item_stock_id=1, quantity=3, status="completed", allocation_type="outbound",
                 from_location_id=101, to_location_id=102)
        self.put("outbound_order_allocation", id=2, outbound_order_detail_id=1,
                 item_stock_id=1, quantity=5, status="initialize", allocation_type="return",
                 from_location_id=102, to_location_id=101, robot_task_id=1)
        self.db.commit()

    def rows(self, warehouse_id=1, zone="Zone_sorting_1"):
        self.db.expire_all()
        return list_sorting_zone_return_tasks(self.db, warehouse_id, zone).rows

    def test_return_survives_empty_cc_assignments_and_keeps_route(self):
        with patch.object(fixture.masan, "cache_get", side_effect=AssertionError("No CC dependency")):
            rows = self.rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].outbound_order_id, 1)
        task = rows[0].task
        self.assertEqual((task.order_id, task.quantity, task.task_path),
                         ("TDS_Return_test", 5, "VT-NODE,SOURCE-NODE"))
        self.assertEqual([(a.id, a.from_location_id, a.to_location_id) for a in task.allocations], [(2, 102, 101)])
        self.rpc.assert_not_called()
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 5)

    def test_zone_and_warehouse_are_scoped(self):
        self.assertEqual(self.rows(zone="Zone_sorting_2"), [])
        self.assertEqual(self.rows(warehouse_id=2), [])
        self.assertEqual(self.rows(zone="Zone_CC_01"), [])
        self.assertEqual(len(self.rows(zone=" Zone_sorting_1 ")), 1)

    def test_cancelled_or_dispatched_return_is_hidden_even_without_callback(self):
        for status in ("cancelled", "failed", "issued", "in_progress", "completed"):
            with self.subTest(status=status):
                self.db.execute(update(OutboundOrderAllocation).where(OutboundOrderAllocation.id == 2).values(status=status))
                self.db.commit()
                self.assertEqual(self.rows(), [])

    def test_robot_callback_also_blocks_return(self):
        for index, status in enumerate(("6", "7", "3", "8"), 1):
            with self.subTest(status=status):
                self.put("task_status", id=index, order_id="TDS_Return_test", status=status)
                self.db.commit()
                self.assertEqual(self.rows(), [])

    def test_stock_must_be_active_positive_and_still_at_vt(self):
        for values in ({"is_active": False}, {"quantity": 0}, {"quantity": 4}, {"location_id": 101}):
            with self.subTest(values=values):
                self.db.execute(update(ItemStock).where(ItemStock.id == 1).values(
                    **({"is_active": True, "quantity": 5, "location_id": 102} | values)))
                self.db.commit()
                self.assertEqual(self.rows(), [])

    def test_outbound_must_be_completed(self):
        for status in ("initialize", "issued", "in_progress", "pre_completed", "confirmed", "failed", "cancelled"):
            with self.subTest(status=status):
                self.db.execute(update(OutboundOrderAllocation).where(OutboundOrderAllocation.id == 1).values(status=status))
                self.db.commit()
                self.assertEqual(self.rows(), [])

    def test_old_failed_attempt_does_not_block_successful_retry(self):
        for index, status in enumerate(("failed", "cancelled"), 3):
            self.put("outbound_order_allocation", id=index, outbound_order_detail_id=1,
                     item_stock_id=1, quantity=3, status=status, allocation_type="outbound",
                     from_location_id=101, to_location_id=102)
        self.db.commit()
        self.assertEqual(len(self.rows()), 1)

    def test_other_order_still_picking_same_stock_blocks_return(self):
        self.put("outbound_order", id=2, order_code="OUT-SECOND", warehouse_id=1, created_by_id=1)
        self.put("outbound_order_detail", id=2, outbound_order_id=2, item_id=1, quantity=2, unit="Thung", detail_type="auto")
        self.put("outbound_order_allocation", id=3, outbound_order_detail_id=2,
                 item_stock_id=1, quantity=2, status="pre_completed", allocation_type="outbound",
                 from_location_id=101, to_location_id=102)
        self.db.commit()
        self.assertEqual(self.rows(), [])

    def test_shared_task_keeps_all_orders_allocations(self):
        self.db.execute(update(RobotTask).where(RobotTask.id == 1).values(quantity=7))
        self.put("outbound_order", id=2, order_code="OUT-SECOND", warehouse_id=1, created_by_id=1)
        self.put("outbound_order_detail", id=2, outbound_order_id=2, item_id=1, quantity=2, unit="Thung", detail_type="auto")
        self.put("item_stock", id=2, item_id=1, unit_id=1, location_id=102, quantity=2, is_active=True, status="available")
        self.put("outbound_order_allocation", id=3, outbound_order_detail_id=2,
                 item_stock_id=2, quantity=2, status="completed", allocation_type="outbound",
                 from_location_id=101, to_location_id=102)
        self.put("outbound_order_allocation", id=4, outbound_order_detail_id=2,
                 item_stock_id=2, quantity=2, status="initialize", allocation_type="return",
                 from_location_id=102, to_location_id=101, robot_task_id=1)
        self.db.commit()
        self.assertEqual([a.id for a in self.rows()[0].task.allocations], [2, 4])
        self.db.execute(update(OutboundOrderAllocation).where(OutboundOrderAllocation.id == 4).values(status="cancelled"))
        self.db.commit()
        self.assertEqual(self.rows(), [])

    def test_wrong_or_missing_return_destination_is_hidden(self):
        for target in (None, 104):
            with self.subTest(target=target):
                self.db.execute(update(OutboundOrderAllocation).where(OutboundOrderAllocation.id == 2).values(to_location_id=target))
                self.db.commit()
                self.assertEqual(self.rows(), [])

    def test_api_is_authenticated_validated_and_read_only(self):
        api_app = FastAPI()
        api_app.include_router(masan_api.router, prefix="/api/v1")
        api_app.dependency_overrides[get_db] = lambda: self.db
        route = next(r for r in masan_api.router.routes if r.endpoint == masan_api.get_masan_sorting_zone_return_tasks)
        url = "/api/v1/masan/outbound-orders/sorting-zone/return-tasks"
        params = {"warehouse_id": 1, "zone": "Zone_sorting_1"}
        statements = []
        def record_sql(conn, cursor, statement, parameters, context, executemany):
            statements.append(statement.lstrip().split()[0].upper())
        event.listen(self.engine, "before_cursor_execute", record_sql)
        self.addCleanup(lambda: event.remove(self.engine, "before_cursor_execute", record_sql))
        with TestClient(api_app) as client:
            self.assertIn(client.get(url, params=params).status_code, (401, 403))
            api_app.dependency_overrides[route.dependencies[0].dependency] = lambda: None
            response = client.get(url, params=params)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["rows"][0]["task"]["allocations"][0]["id"], 2)
            for invalid in ({"warehouse_id": 0}, {"zone": "   "}):
                self.assertEqual(client.get(url, params=params | invalid).status_code, 422)
        self.assertTrue(statements)
        self.assertEqual(set(statements), {"SELECT"})
        self.rpc.assert_not_called()


if __name__ == "__main__":
    unittest.main()
