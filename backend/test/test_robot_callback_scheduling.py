"""Callback scheduling regressions with isolated inventory and fake ICS/cache."""
import unittest
from unittest.mock import patch

from test import test_outbound_auto as native_fixture
from test import test_outbound_auto_manual_services as shared_fixture
from app.modules.masan import masan_auto_service as auto
from app.modules.masan.masan_auto_model import OutboundAutoCommand
from app.modules.robot.robot_model import RobotTask, TaskStatus
from app.modules.robot.robot_service import task_status_service
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation


class CallbackSchedulingFixture:
    put = native_fixture.OutboundAutoTests.put
    cache_details = native_fixture.OutboundAutoTests.cache_details
    assign = native_fixture.OutboundAutoTests.assign
    start = native_fixture.OutboundAutoTests.start
    tick = native_fixture.OutboundAutoTests.tick
    cycles = native_fixture.OutboundAutoTests.cycles
    callback = native_fixture.OutboundAutoTests.callback

    def prepare(self):
        self.start()
        self.tick()
        self.wake.reset_mock()
        return self.cycles()[0]

    def test_progress_is_persisted_without_scheduling_coordinator(self):
        cycle = self.prepare()
        for _ in range(4):
            self.callback(cycle, status="6")
        self.wake.assert_not_called()
        task = self.db.get(RobotTask, cycle.pick_task_id)
        self.assertEqual(self.db.query(TaskStatus).filter_by(order_id=task.order_id, status="6").count(), 4)
        self.assertEqual(task.status, "in_progress")
        self.assertEqual(self.db.get(ItemStock, 1).location_id, 101)

    def test_completed_schedules_once_after_stock_is_settled(self):
        cycle = self.prepare()
        held_when_woken = []
        self.wake.side_effect = lambda: held_when_woken.append(set(self.db.info.get("outbound_auto_locks", set())))
        self.callback(cycle)
        self.wake.assert_called_once_with()
        self.assertEqual(held_when_woken, [set()])
        self.assertEqual(self.db.get(ItemStock, 1).location_id, cycle.vt_location_id)
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 100)
        command = self.db.query(OutboundAutoCommand).filter_by(robot_task_id=cycle.pick_task_id).one()
        self.assertEqual(command.state, "completed")

    def test_failure_schedules_once_and_stops_zone(self):
        cycle = self.prepare()
        self.callback(cycle, status="7")
        self.wake.assert_called_once_with()
        self.assertFalse(auto.status(self.db, 1, 8)["enabled"])

    def test_cancel_schedules_once_and_stops_zone(self):
        cycle = self.prepare()
        self.callback(cycle, status="3")
        self.wake.assert_called_once_with()
        self.assertFalse(auto.status(self.db, 1, 8)["enabled"])

    def test_retries_and_late_progress_after_completion_do_not_join_lock_queue(self):
        cycle = self.prepare()
        self.callback(cycle)
        task = self.db.get(RobotTask, cycle.pick_task_id)
        records = self.db.query(TaskStatus).filter_by(order_id=task.order_id).count()
        self.wake.reset_mock()
        with patch.object(auto, "warehouse_lock", side_effect=AssertionError("completed task must bypass lock")):
            self.callback(cycle)
            self.callback(cycle, status="6")
        self.wake.assert_not_called()
        self.assertEqual(self.db.query(TaskStatus).filter_by(order_id=task.order_id).count(), records)
        self.assertEqual(self.db.get(RobotTask, task.id).status, "completed")
        self.assertEqual(self.db.get(ItemStock, 1).location_id, cycle.vt_location_id)
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 100)


class NativeCallbackSchedulingTests(CallbackSchedulingFixture, unittest.TestCase):
    native_mode = True
    setUp = native_fixture.OutboundAutoTests.setUp


class SharedCallbackSchedulingTests(CallbackSchedulingFixture, unittest.TestCase):
    native_mode = False
    setUp = shared_fixture.ManualServicesAutoTests.setUp

    def test_incomplete_command_is_recovered_even_when_status_already_completed(self):
        cycle = self.prepare()
        self.callback(cycle)
        command = self.db.query(OutboundAutoCommand).filter_by(robot_task_id=cycle.pick_task_id).one()
        command.state = "accepted"
        self.db.commit()
        self.wake.reset_mock()
        with patch.object(auto, "warehouse_lock", wraps=auto.warehouse_lock) as lock:
            self.callback(cycle)
        self.assertTrue(lock.called)
        self.assertEqual(command.state, "completed")
        self.assertEqual(self.db.get(ItemStock, 1).location_id, cycle.vt_location_id)
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 100)

    def test_unowned_outbound_progress_does_not_wake_but_completion_does(self):
        self.put("robot_task", id=99, order_id="UNOWNED-PICK", quantity=19,
                 process_code="pick", system_code="test", task_order_detail='[]')
        self.put("outbound_order_allocation", id=99, outbound_order_detail_id=1, item_stock_id=1,
                 quantity=19, allocation_type="outbound", status="issued", robot_task_id=99,
                 from_location_id=101, to_location_id=201)
        self.db.commit()
        self.wake.reset_mock()
        payload = {"orderId": "UNOWNED-PICK", "status": "6", "deviceNum": "TEST-ROBOT"}
        task_status_service.receive_task_status(self.db, payload)
        self.wake.assert_not_called()
        held_when_woken = []
        self.wake.side_effect = lambda: held_when_woken.append(set(self.db.info.get("outbound_auto_locks", set())))
        task_status_service.receive_task_status(self.db, {**payload, "status": "8"})
        self.wake.assert_called_once_with()
        self.assertEqual(held_when_woken, [set()])
        allocation = self.db.get(OutboundOrderAllocation, 99)
        self.assertEqual(allocation.status, "pre_completed")
        self.assertEqual(self.db.get(ItemStock, 1).location_id, 201)

    def test_completed_unowned_return_journal_does_not_regress_on_late_progress(self):
        self.put("robot_task", id=99, order_id="COMPLETED-RETURN", quantity=19,
                 process_code="return", system_code="test", task_order_detail='[]')
        self.put("outbound_order_allocation", id=99, outbound_order_detail_id=1, item_stock_id=1,
                 quantity=19, allocation_type="return", status="completed", robot_task_id=99,
                 from_location_id=201, to_location_id=101)
        self.db.add(TaskStatus(order_id="COMPLETED-RETURN", status="8"))
        self.db.add(OutboundAutoCommand(robot_task_id=99, kind="return", state="completed"))
        self.db.commit()
        self.wake.reset_mock()
        with patch.object(auto, "warehouse_lock", side_effect=AssertionError("settled return must bypass lock")):
            task_status_service.receive_task_status(self.db, {"orderId": "COMPLETED-RETURN", "status": "6"})
        self.wake.assert_not_called()
        command = self.db.query(OutboundAutoCommand).filter_by(robot_task_id=99).one()
        self.assertEqual(command.state, "completed")
        self.assertEqual(self.db.get(ItemStock, 1).location_id, 101)


if __name__ == "__main__":
    unittest.main()
