"""Shared manual-service orchestration on isolated SQLite, cache and ICS."""
from decimal import Decimal
import unittest
from unittest.mock import patch

from test import test_outbound_auto as native_fixture
from test import test_outbound_remaining_quantity as fixture
from app.modules.masan import masan_auto_service as auto
from app.modules.masan import masan_auto_manual_service as shared
from app.modules.masan.masan_auto_model import OutboundAutoCommand, OutboundAutoCycle
from app.modules.robot.robot_service import task_status_service
from app.modules.robot.robot_model import RobotTask
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation, OutboundOrderDetail
from app.modules.warehouse.outbound_order.outbound_order_schema import OutboundRobotTaskCreate, AllocationOutboundTaskExecute
from sqlalchemy import event, update


class ManualServicesAutoTests(unittest.TestCase):
    native_mode = False
    put = native_fixture.OutboundAutoTests.put
    cache_details = native_fixture.OutboundAutoTests.cache_details
    assign = native_fixture.OutboundAutoTests.assign
    start = native_fixture.OutboundAutoTests.start
    tick = native_fixture.OutboundAutoTests.tick
    cycles = native_fixture.OutboundAutoTests.cycles
    callback = native_fixture.OutboundAutoTests.callback
    confirm = native_fixture.OutboundAutoTests.confirm
    test_all_four_pairs = native_fixture.OutboundAutoTests.test_all_four_pairs_check_front_for_rear_and_only_self_for_front
    test_two_workers_and_stop = native_fixture.OutboundAutoTests.test_two_workers_serialize_same_source_and_stop_waits_for_inflight_send
    test_two_zones = native_fixture.OutboundAutoTests.test_two_zones_are_independent_but_do_not_share_a_source
    test_largest_sku_and_imports = native_fixture.OutboundAutoTests.test_largest_sku_and_new_imports_while_waiting
    test_equal_demand = native_fixture.OutboundAutoTests.test_equal_demand_and_order_age_use_item_id_instead_of_detail_id
    test_no_manual_takeover = native_fixture.OutboundAutoTests.test_existing_manual_pallet_is_not_taken_over_and_reports_wait_reason
    test_source_reserved_by_inbound = native_fixture.OutboundAutoTests.test_source_reserved_by_inbound_is_not_selected
    test_manual_guard = native_fixture.OutboundAutoTests.test_manual_dispatch_cannot_bypass_auto_zone
    test_multiple_cc = native_fixture.OutboundAutoTests.test_one_pallet_serves_multiple_cc_and_waits_for_every_confirmation
    test_cc_cache_clear_guard = native_fixture.OutboundAutoTests.test_cache_clear_cannot_remove_cc_owned_by_an_active_cycle

    def setUp(self):
        native_fixture.OutboundAutoTests.setUp(self)
        @event.listens_for(self.engine, "before_cursor_execute", retval=True)
        def sqlite_decimal(conn, cursor, statement, parameters, context, executemany):
            def convert(value):
                return float(value) if isinstance(value, Decimal) else value
            if isinstance(parameters, tuple):
                parameters = tuple(convert(v) for v in parameters)
            return statement, parameters
        patch.object(fixture.masan, "publish_masan_sorting_zone").start()
        patch("app.modules.robot.robot_service.publish_robot_task_completed").start()
        patch("app.modules.robot.robot_service.robot_telemetry.get_robot_data", return_value=None).start()

    def test_shared_services_create_return_early_and_reuse_it_after_confirmation(self):
        with patch.object(fixture.masan, "_sending_masan_outbound_task", wraps=fixture.masan._sending_masan_outbound_task) as supply:
            self.start(); self.tick()
            self.assertEqual(supply.call_count, 1)
        cycle = self.cycles()[0]
        self.assertEqual(cycle.execution_mode, "manual_services")
        self.assertIsNotNone(cycle.return_task_id)
        returned = cycle.return_task_id
        self.assertEqual(self.db.get(RobotTask, returned).quantity, 81)
        self.assertEqual(self.rpc.call_count, 1)
        self.callback(cycle)
        self.assertEqual(auto.status(self.db, 1, 8)["vts"][0]["location_status"], "reserved")
        with patch.object(fixture.masan, "_confirm_allocation_outbound", wraps=fixture.masan._confirm_allocation_outbound) as confirm:
            self.confirm(cycle)
            self.assertEqual(confirm.call_count, 1)
        self.tick()
        self.assertEqual(cycle.return_task_id, returned)
        self.assertEqual(cycle.phase, "returning")
        self.assertEqual(self.rpc.call_count, 2)
        self.callback(cycle, returning=True)
        self.assertEqual((cycle.phase, self.db.get(ItemStock, 1).location_id, self.db.get(ItemStock, 1).quantity),
                         ("completed", 101, 81))

    def test_return_waits_for_other_pallet_of_same_detail_exactly_like_manual(self):
        self.start(); self.tick(); cycle = self.cycles()[0]
        self.callback(cycle)
        self.put("location", id=105, location_name="SOURCE2", location_code="S2", zone_id=1, warehouse_id=1)
        self.put("item_stock", id=2, item_id=1, unit_id=1, location_id=105, quantity=10, status="available", is_active=True)
        self.put("outbound_order_allocation", id=99, outbound_order_detail_id=1, item_stock_id=2,
                 quantity=1, status="initialize", allocation_type="outbound", from_location_id=105)
        self.db.commit(); self.confirm(cycle); self.tick()
        self.assertEqual(cycle.phase, "ready_to_return")
        self.assertIn("cùng detail", cycle.message)
        self.assertEqual(self.rpc.call_count, 1)

    def test_stop_then_existing_execute_return_works_without_duplicate_task(self):
        self.start(); self.tick(); cycle = self.cycles()[0]
        auto.stop(self.db, 1, 8)
        self.callback(cycle); self.confirm(cycle); self.tick()
        self.assertEqual(self.rpc.call_count, 1)
        rows = self.db.query(OutboundOrderAllocation).filter_by(robot_task_id=cycle.return_task_id).all()
        fixture.outbound.execute_outbound_task(self.db, OutboundRobotTaskCreate(
            order_id=self.db.get(RobotTask, cycle.return_task_id).order_id, from_location_id=201, to_location_id=101,
            allocations=[AllocationOutboundTaskExecute(allocation_id=a.id) for a in rows]), "auto")
        self.assertEqual(self.rpc.call_count, 2)
        self.assertEqual(self.db.query(RobotTask).count(), 2)

    def test_full_confirmation_does_not_send_empty_pallet_and_is_idempotent(self):
        self.db.execute(update(OutboundOrderDetail).values(quantity=100)); self.db.commit()
        self.start(); self.tick(); cycle = self.cycles()[0]
        self.callback(cycle); self.callback(cycle)
        self.confirm(cycle); self.confirm(cycle); self.tick()
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 0)
        self.assertEqual(cycle.phase, "completed")
        self.assertEqual(self.rpc.call_count, 1)

    def test_front_is_used_after_rear_arrives_even_with_waiting_return(self):
        self.db.execute(update(OutboundOrderDetail).values(quantity=300))
        for identifier in (105, 106):
            self.put("location", id=identifier, location_name=f"S{identifier}", location_code=f"S{identifier}", zone_id=1, warehouse_id=1)
            self.put("item_stock", id=identifier, item_id=1, unit_id=1, location_id=identifier, quantity=100, status="available", is_active=True)
        self.db.commit(); self.start(); self.tick()
        rear = next(c for c in self.cycles() if c.vt_location_id == 201)
        self.callback(rear); self.tick()
        self.assertIn(202, {c.vt_location_id for c in self.cycles()})

    def test_timeout_is_durable_and_does_not_retry(self):
        self.rpc.side_effect = TimeoutError("unknown result")
        self.start(); self.tick(); self.tick()
        self.assertEqual(self.rpc.call_count, 1)
        self.assertFalse(auto.status(self.db, 1, 8)["enabled"])
        self.assertEqual(self.db.query(OutboundAutoCommand).filter_by(kind="pick").one().state, "unknown")

    def test_callback_only_moves_owned_stocks_and_repeated_return_is_safe(self):
        self.start(); self.tick(); cycle = self.cycles()[0]
        self.callback(cycle)
        self.put("item_stock", id=99, item_id=1, unit_id=1, location_id=201, quantity=7, status="available", is_active=True)
        self.db.commit(); self.confirm(cycle); self.tick()
        self.callback(cycle, returning=True); self.callback(cycle, returning=True)
        self.assertEqual(self.db.get(ItemStock, 99).location_id, 201)
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 81)

    def test_prepared_pick_recovers_same_task_and_existing_return(self):
        self.start()
        # Simulate a killed process after durable preparation, before HTTP.
        with patch.object(shared, "submit", side_effect=SystemExit("worker killed")):
            with self.assertRaises(SystemExit):
                self.tick()
        cycle = self.cycles()[0]
        original = (cycle.pick_task_id, cycle.return_task_id)
        self.rpc.assert_not_called()
        self.tick()
        self.assertEqual(self.rpc.call_count, 1)
        self.assertEqual((cycle.pick_task_id, cycle.return_task_id), original)
        self.assertEqual(self.db.query(RobotTask).count(), 2)

    def test_non_success_ack_stops_and_reports_order_for_reconciliation(self):
        self.rpc.return_value = {"code":500}
        self.start(); self.tick(); self.tick()
        self.assertEqual(self.rpc.call_count, 1)
        task = self.db.get(RobotTask, self.cycles()[0].pick_task_id)
        self.assertIn(task.order_id, auto.status(self.db, 1, 8)["message"])
        with self.assertRaisesRegex(ValueError, "đối soát"):
            self.start()

    def test_queued_task_is_partitioned_without_taking_other_zones_allocations(self):
        self.put("outbound_order_detail", id=2, outbound_order_id=1, item_id=1, quantity=20, unit="Thung", detail_type="auto")
        self.put("robot_task", id=100, order_id="SHARED-QUEUED", quantity=100,
                 process_code="OUT", system_code="Thadosoft", task_order_detail='[{"taskPath":"None"}]')
        for identifier, detail_id, quantity in [(100,1,19),(101,2,20)]:
            self.put("outbound_order_allocation", id=identifier, outbound_order_detail_id=detail_id,
                     item_stock_id=1, quantity=quantity, status="initialize", allocation_type="outbound",
                     from_location_id=101, robot_task_id=100)
        self.db.commit(); self.assign(2, "Zone_CC_01", 103)
        self.start(); self.tick()
        cycle = self.cycles()[0]
        self.assertNotEqual(cycle.pick_task_id, 100)
        self.assertEqual(cycle.allocation_ids, [100])
        other = self.db.get(OutboundOrderAllocation, 101)
        self.assertEqual((other.robot_task_id, other.status, other.to_location_id, other.auto_cycle_id),
                         (100, "initialize", None, None))

    def test_external_reservation_blocks_return(self):
        self.start(); self.tick(); cycle = self.cycles()[0]
        self.callback(cycle); self.confirm(cycle)
        self.put("outbound_order_allocation", id=99, outbound_order_detail_id=1, item_stock_id=1,
                 quantity=1, allocation_type="return", status="initialize", from_location_id=202, to_location_id=101)
        self.db.commit(); self.tick()
        self.assertEqual(self.rpc.call_count, 1)
        self.assertIn("VT22", cycle.message)

    def test_return_quantity_is_resynchronized_before_execute(self):
        self.start(); self.tick(); cycle = self.cycles()[0]
        self.callback(cycle); self.confirm(cycle)
        self.db.get(RobotTask, cycle.return_task_id).quantity = 999
        self.db.query(OutboundOrderAllocation).filter_by(robot_task_id=cycle.return_task_id).one().quantity = 2
        self.db.commit(); self.tick()
        self.assertEqual(self.db.get(RobotTask, cycle.return_task_id).quantity, 81)
        self.assertEqual(self.db.query(OutboundOrderAllocation).filter_by(robot_task_id=cycle.return_task_id).one().quantity, 81)
        self.assertEqual(self.db.query(RobotTask).count(), 2)

    def test_completed_callback_recovers_after_legacy_commit_without_double_settlement(self):
        self.start(); self.tick(); cycle = self.cycles()[0]
        self.callback(cycle); self.confirm(cycle); self.tick()
        self.callback(cycle, returning=True)
        from app.modules.warehouse.transaction_history.history_model import Transaction
        transactions = self.db.query(Transaction).count()
        # Legacy commit succeeded, but the worker died before marking the command.
        command = self.db.query(OutboundAutoCommand).filter_by(kind="return").one()
        command.state = "accepted"
        cycle.phase, cycle.completed_at = "returning", None
        self.db.commit()
        self.callback(cycle, returning=True)
        self.assertEqual(self.db.query(Transaction).count(), transactions)
        self.assertEqual(cycle.phase, "completed")

    def test_failed_callback_stops_zone_and_authoritative_callback_resolves_it(self):
        self.start(); self.tick(); cycle = self.cycles()[0]
        self.callback(cycle, status="7")
        self.assertFalse(auto.status(self.db, 1, 8)["enabled"])
        with self.assertRaisesRegex(ValueError, "đối soát"):
            self.start()
        self.callback(cycle, status="6")
        self.assertEqual(cycle.phase, "supplying")
        self.assertFalse(auto.status(self.db, 1, 8)["enabled"])
        self.callback(cycle)
        self.start()
        self.assertTrue(auto.status(self.db, 1, 8)["enabled"])

    def test_stopped_cycle_rejects_execute_for_another_route(self):
        self.start(); self.tick(); cycle = self.cycles()[0]
        auto.stop(self.db, 1, 8)
        self.callback(cycle); self.confirm(cycle)
        rows = self.db.query(OutboundOrderAllocation).filter_by(robot_task_id=cycle.return_task_id).all()
        with self.assertRaisesRegex(ValueError, "không khớp"):
            fixture.outbound.execute_outbound_task(self.db, OutboundRobotTaskCreate(
                order_id=self.db.get(RobotTask, cycle.return_task_id).order_id,
                from_location_id=202, to_location_id=101,
                allocations=[AllocationOutboundTaskExecute(allocation_id=a.id) for a in rows]), "auto")
        self.assertEqual(self.rpc.call_count, 1)


if __name__ == "__main__":
    unittest.main()
