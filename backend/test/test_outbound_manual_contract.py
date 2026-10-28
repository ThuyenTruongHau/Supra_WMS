"""Manual outbound contract captured before the manual-services refactor."""
import unittest
from decimal import Decimal
from unittest.mock import patch
from sqlalchemy import event

from test import test_outbound_remaining_quantity as fixture
from app.modules.masan.masan_sorting_return_service import list_sorting_zone_return_tasks
from app.modules.robot import robot_service
from app.modules.robot.robot_model import RobotTask
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation
from app.modules.warehouse.outbound_order.outbound_order_schema import OutboundRobotTaskCreate, AllocationOutboundTaskExecute


class ManualOutboundContractTests(unittest.TestCase):
    put = fixture.OutboundRemainingQuantityTests.put
    cache_details = fixture.OutboundRemainingQuantityTests.cache_details

    def setUp(self):
        fixture.OutboundRemainingQuantityTests.setUp(self)
        @event.listens_for(self.engine, "before_cursor_execute", retval=True)
        def sqlite_decimal(conn, cursor, statement, parameters, context, executemany):
            # PostgreSQL accepts Decimal for these integer quantities; SQLite's
            # DBAPI needs a numeric adapter. Do not change production services.
            if isinstance(parameters, tuple):
                parameters = tuple(float(v) if isinstance(v, Decimal) else v for v in parameters)
            return statement, parameters
        for target in ("app.modules.masan.masan_outbound_service.publish_masan_sorting_zone",
                       "app.modules.robot.robot_service.publish_robot_task_completed"):
            mock = patch(target)
            mock.start(); self.addCleanup(mock.stop)
        telemetry = patch.object(robot_service.robot_telemetry, "get_robot_data", return_value=None)
        telemetry.start(); self.addCleanup(telemetry.stop)
        distance = patch.object(robot_service.task_status_service, "_distance_m", return_value=12.5)
        distance.start(); self.addCleanup(distance.stop)
        self.put("robot_task", id=100, order_id="MANUAL-CONTRACT", quantity=100,
                 process_code="OUT", system_code="Thadosoft", task_order_detail='[{"taskPath":"None"}]')
        self.put("outbound_order_allocation", id=100, outbound_order_detail_id=1, item_stock_id=1,
                 quantity=19, status="initialize", allocation_type="outbound", from_location_id=101, robot_task_id=100)
        self.db.commit()

    def execute(self, task, rows, start, end):
        body = OutboundRobotTaskCreate(order_id=task.order_id, from_location_id=start, to_location_id=end,
            allocations=[AllocationOutboundTaskExecute(allocation_id=row.id) for row in rows])
        return fixture.outbound.execute_outbound_task(self.db, body, "auto")

    def test_manual_supply_confirmation_and_return_contract(self):
        pick = self.db.get(RobotTask, 100)
        outbound = self.db.get(OutboundOrderAllocation, 100)
        self.assertIsNone(self.execute(pick, [outbound], 101, 102))
        returns = self.db.query(OutboundOrderAllocation).filter_by(allocation_type="return").all()
        self.assertEqual(len(returns), 1)
        returned = returns[0]
        self.assertEqual((returned.status, returned.quantity, returned.from_location_id, returned.to_location_id),
                         ("initialize", 81, 102, 101))
        self.assertEqual(self.rpc.call_args.args[0]["taskOrderDetail"], [{"taskPath":"SOURCE-NODE,VT-NODE"}])
        robot_service.task_status_service.receive_task_status(self.db, {"orderId":pick.order_id,"status":"8"})
        self.assertEqual((outbound.status, self.db.get(ItemStock, 1).quantity), ("pre_completed", 100))
        self.assertEqual(list_sorting_zone_return_tasks(self.db, 1, "Zone_sorting_1").rows, [])
        self.assertIsNone(fixture.masan.confirm_allocation_outbound(self.db, 1, "Zone_CC_01", {100:19}, "test"))
        self.assertEqual((outbound.status, self.db.get(ItemStock, 1).quantity), ("completed", 81))
        ready = list_sorting_zone_return_tasks(self.db, 1, "Zone_sorting_1").rows
        self.assertEqual(len(ready), 1)
        self.assertEqual(ready[0].task.quantity, 81)
        task = self.db.get(RobotTask, returned.robot_task_id)
        self.execute(task, [returned], 102, 101)
        self.assertEqual(self.rpc.call_count, 2)
        self.assertEqual(self.rpc.call_args.args[0]["taskOrderDetail"], [{"taskPath":"VT-NODE,SOURCE-NODE"}])
        robot_service.task_status_service.receive_task_status(self.db, {"orderId":task.order_id,"status":"8"})
        self.assertEqual((returned.status, self.db.get(ItemStock, 1).location_id, self.db.get(ItemStock, 1).quantity),
                         ("completed", 101, 81))
        self.assertEqual(self.db.query(OutboundOrderAllocation).count(), 2)
        self.assertIsNone(outbound.auto_cycle_id)

    def test_manual_confirmation_still_updates_return_without_auto_sending(self):
        pick = self.db.get(RobotTask, 100)
        self.execute(pick, [self.db.get(OutboundOrderAllocation, 100)], 101, 102)
        robot_service.task_status_service.receive_task_status(self.db, {"orderId":pick.order_id,"status":"8"})
        fixture.masan.confirm_allocation_outbound(self.db, 1, "Zone_CC_01", {100:17}, "test")
        returned = self.db.query(OutboundOrderAllocation).filter_by(allocation_type="return").one()
        self.assertEqual((returned.status, returned.quantity), ("initialize", 83))
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 83)
        self.assertEqual(self.rpc.call_count, 1)
        self.assertIsNone(returned.auto_cycle_id)


if __name__ == "__main__":
    unittest.main()
