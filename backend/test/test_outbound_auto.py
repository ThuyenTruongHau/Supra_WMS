"""Automatic outbound regressions, isolated DB and fake cache/ICS only."""
import copy
import fnmatch
import re
from datetime import datetime
import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace
from unittest.mock import patch

from test import test_outbound_remaining_quantity as fixture
from app.modules.masan import masan_auto_service as auto
from app.modules.masan.masan_auto_model import OutboundAutoZone, OutboundAutoCycle, OutboundAutoCommand
from app.modules.robot.robot_model import RobotTask
from app.modules.robot.robot_service import task_status_service
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation, OutboundOrderDetail
from app.modules.warehouse.location_map.location_model import Location
from sqlalchemy import update, event, create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session


class OutboundAutoTests(unittest.TestCase):
    native_mode = True
    put = fixture.OutboundRemainingQuantityTests.put
    cache_details = fixture.OutboundRemainingQuantityTests.cache_details

    def setUp(self):
        with patch.object(fixture, "create_engine", side_effect=lambda url: create_engine(
            url, connect_args={"check_same_thread": False}, poolclass=StaticPool,
        )):
            fixture.OutboundRemainingQuantityTests.setUp(self)
        # Keep the real FEFO SELECT; adapt PostgreSQL date/regex syntax to the
        # isolated SQLite dialect rather than mocking inventory selection.
        @event.listens_for(self.engine, "before_cursor_execute", retval=True)
        def postgres_operators(conn, cursor, statement, parameters, context, executemany):
            return statement.replace(" ~ ", " REGEXP "), parameters
        raw = self.db.connection().connection.driver_connection
        raw.create_function("regexp", 2, lambda pattern, value: bool(value and re.search(pattern, value)))
        raw.create_function("to_date", 2, lambda value, fmt: datetime.strptime(value, "%d/%m/%y" if "/" in fmt else "%d%m%y").date().isoformat() if value else None)
        self.db.execute(update(OutboundOrderDetail).values(details={"vehicle_no": "TEST"}))
        self.put("zone", id=4, warehouse_id=1, code="Zone_CC_02")
        self.put("zone", id=5, warehouse_id=1, code="Zone_sorting_2")
        for i, name in enumerate(("VT21", "VT22", "VT23", "VT24"), 201):
            self.put("location", id=i, location_name=name, location_code=f"NODE-{name}", zone_id=3, warehouse_id=1)
        for i, name in enumerate(("VT11", "VT12", "VT13", "VT14"), 211):
            self.put("location", id=i, location_name=name, location_code=f"NODE-{name}", zone_id=5, warehouse_id=1)
        self.put("location", id=301, location_name="CC21", location_code="CC21-NODE", zone_id=4, warehouse_id=1)
        self.db.commit()
        self.cache.clear()
        self.assign(1, "Zone_CC_02", 301)
        for name, fake in {
            "cache_get": lambda key: copy.deepcopy(self.cache.get(key)),
            "cache_delete": lambda key: self.cache.pop(key, None),
            "cache_scan_keys": lambda pattern: sorted(key for key in self.cache if fnmatch.fnmatchcase(key, pattern)),
            "cache_set": lambda key, value, ttl=None: self.cache.__setitem__(key, copy.deepcopy(value)),
        }.items():
            mock = patch.object(auto, name, side_effect=fake)
            mock.start()
            self.addCleanup(mock.stop)
        self.wake = patch.object(auto, "wake").start()
        self.addCleanup(patch.stopall)
        patch.object(auto.settings, "zone_storage", ["Zone_storage"]).start()
        patch("app.socket.ws_events.publish_masan_sorting_zone").start()
        patch("app.socket.ws_events.publish_robot_task_completed").start()
        patch.object(task_status_service, "_distance_m", return_value=12.5).start()
        if self.native_mode:
            patch.object(auto, "_prepare_pick", side_effect=auto._prepare_native_pick).start()

    def assign(self, detail_id, zone, cc):
        self.cache[f"outbound:assigned_cc_details:1:{detail_id}"] = {"zone": zone, "location_id": cc}
        self.cache[f"outbound:assigned_cc_location:1:{cc}"] = {"zone": zone, "outbound_order_id": 1,
            "lines": [{"detail_id": detail_id, "quantity": self.db.get(OutboundOrderDetail, detail_id).quantity}]}

    def start(self, display=8):
        return auto.start(self.db, 1, display, 1)

    def tick(self, display=8):
        auto.tick_zone(self.db, 1, display)

    def cycles(self):
        self.db.expire_all()
        return self.db.query(OutboundAutoCycle).order_by(OutboundAutoCycle.id).all()

    def callback(self, cycle, status="8", returning=False):
        task = self.db.get(RobotTask, cycle.return_task_id if returning else cycle.pick_task_id)
        return task_status_service.receive_task_status(self.db, {"orderId": task.order_id, "status": status, "deviceNum": "TEST-ROBOT"})

    def confirm(self, cycle, ids=None):
        rows = auto._allocations(self.db, cycle)
        quantities = {a.id: a.quantity for a in rows if ids is None or a.id in ids}
        return fixture.masan.confirm_allocation_outbound(self.db, 1, "Zone_CC_02", quantities, "test")

    def test_complete_cycle_delays_return_and_does_not_move_other_vt_stock(self):
        self.start()
        self.tick()
        cycle = self.cycles()[0]
        self.assertEqual(cycle.vt_location_id, 201)
        self.assertIsNone(cycle.return_task_id)
        self.assertEqual(self.rpc.call_count, 1)
        self.callback(cycle)
        self.put("item_stock", id=99, item_id=1, unit_id=1, location_id=201, quantity=7, status="available", is_active=True)
        self.db.commit()
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 100)
        self.tick()
        self.assertIsNone(cycle.return_task_id)
        self.confirm(cycle)
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 81)
        self.assertEqual(cycle.phase, "ready_to_return")
        self.tick()
        self.assertEqual(self.rpc.call_count, 2)
        self.assertEqual(self.db.get(RobotTask, cycle.return_task_id).quantity, 81)
        self.callback(cycle, returning=True)
        self.assertEqual(self.db.get(ItemStock, 1).location_id, 101)
        self.assertEqual(self.db.get(ItemStock, 99).location_id, 201)
        self.assertEqual(cycle.phase, "completed")

    def test_confirmation_and_callback_retries_are_idempotent(self):
        self.start(); self.tick()
        cycle = self.cycles()[0]
        self.callback(cycle); self.callback(cycle)
        self.confirm(cycle); self.confirm(cycle)
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 81)
        self.tick(); self.tick()
        self.assertEqual(self.rpc.call_count, 2)
        self.callback(cycle, returning=True); self.callback(cycle, returning=True)
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 81)

    def test_stop_prevents_all_new_sends_but_manual_return_works(self):
        self.start(); self.tick()
        cycle = self.cycles()[0]
        auto.stop(self.db, 1, 8)
        self.callback(cycle)
        self.confirm(cycle)
        self.tick()
        self.assertIsNone(cycle.return_task_id)
        self.assertEqual(self.rpc.call_count, 1)
        auto.manual_return(self.db, 1, 8, cycle.id)
        self.assertEqual(self.rpc.call_count, 2)

    def test_empty_pallet_completes_without_return(self):
        self.db.execute(update(OutboundOrderDetail).where(OutboundOrderDetail.id == 1).values(quantity=100))
        self.db.commit()
        self.start(); self.tick()
        cycle = self.cycles()[0]
        self.callback(cycle); self.confirm(cycle); self.tick()
        self.assertEqual(cycle.phase, "completed")
        self.assertIsNone(cycle.return_task_id)
        self.assertEqual(self.rpc.call_count, 1)

    def test_start_is_idempotent_and_restart_does_not_duplicate_send(self):
        self.start(); self.start(); self.tick()
        self.assertEqual(self.db.query(OutboundAutoZone).count(), 1)
        with Session(self.engine) as other:
            auto.tick_zone(other, 1, 8)
        self.assertEqual(self.rpc.call_count, 1)

    def test_timeout_stops_zone_and_blocks_restart(self):
        self.rpc.side_effect = TimeoutError("unknown ICS result")
        self.start(); self.tick()
        cycle = self.cycles()[0]
        self.assertEqual(auto.status(self.db, 1, 8)["state"], "error")
        self.assertEqual(self.db.query(OutboundAutoCommand).one().state, "unknown")
        self.tick()
        self.assertEqual(self.rpc.call_count, 1)
        with self.assertRaisesRegex(ValueError, "đối soát"):
            self.start()
        self.callback(cycle)
        self.start()  # An authoritative completed callback resolves uncertainty.
        self.assertTrue(auto.status(self.db, 1, 8)["enabled"])

    def test_interrupted_sending_is_not_replayed(self):
        self.start(); self.tick()
        command = self.db.query(OutboundAutoCommand).one()
        command.state = "sending"
        self.db.commit()
        self.tick()
        self.assertEqual(command.state, "unknown")
        self.assertFalse(auto.status(self.db, 1, 8)["enabled"])
        self.assertEqual(self.rpc.call_count, 1)

    def test_failed_and_cancelled_callbacks_stop_zone(self):
        for code in ("7", "3"):
            with self.subTest(code=code):
                if self.cycles():
                    # Use the same interrupted task: neither failure is retried.
                    cycle = self.cycles()[0]
                else:
                    self.start(); self.tick(); cycle = self.cycles()[0]
                self.callback(cycle, status=code)
                self.assertFalse(auto.status(self.db, 1, 8)["enabled"])
                self.tick()
                self.assertEqual(self.rpc.call_count, 1)

    def test_mapping_validates_zone_and_does_not_use_node_codes(self):
        self.assertEqual(set(auto.resolve_locations(self.db, 1, 9)), {"VT11", "VT12", "VT13", "VT14"})
        self.db.get(Location, 204).location_name = "BAD"
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "VT24"):
            self.start()

    def test_manual_dispatch_cannot_bypass_auto_zone(self):
        self.start()
        with self.assertRaisesRegex(ValueError, "tự động"):
            fixture.masan.sending_masan_outbound_task(self.db, 1, "Zone_CC_02", 1, 201)
        self.rpc.assert_not_called()

    def test_front_has_stock_is_allowed_but_moving_blocks_both_cells(self):
        self.put("item_stock", id=99, item_id=1, unit_id=1, location_id=202, quantity=7, status="available", is_active=True)
        self.db.commit()
        self.start(); self.tick()
        cycle = self.cycles()[0]
        control = self.db.get(OutboundAutoZone, cycle.zone_id)
        self.assertEqual(cycle.vt_location_id, 201)
        self.assertIsNotNone(auto.path_reason(self.db, control, self.db.get(Location, 202)))
        self.callback(cycle)
        self.assertIsNone(auto.path_reason(self.db, control, self.db.get(Location, 202)))

    def test_largest_sku_and_new_imports_while_waiting(self):
        self.cache.clear()
        self.start(); self.tick()
        self.assertEqual(auto.status(self.db, 1, 8)["state"], "waiting")
        self.assertTrue(auto.status(self.db, 1, 8)["enabled"])
        self.assign(1, "Zone_CC_02", 301)
        self.put("item", id=2, sku="LARGER", name="Larger demand", base_unit=1, warehouse_id=1, supplier="TEST", max_quantity=9999, min_quantity=0)
        self.put("outbound_order_detail", id=2, outbound_order_id=1, item_id=2, quantity=30, unit="Thung", detail_type="auto")
        self.put("location", id=105, location_name="SOURCE2", location_code="SOURCE2", zone_id=1, warehouse_id=1)
        self.put("item_stock", id=2, item_id=2, unit_id=1, location_id=105, quantity=100, status="available", is_active=True)
        self.db.commit(); self.assign(2, "Zone_CC_02", 301)
        self.tick()
        first = self.cycles()[0]
        self.assertEqual(auto._allocations(self.db, first)[0].outbound_order_detail.item_id, 2)

    def test_all_four_pairs_check_front_for_rear_and_only_self_for_front(self):
        for display in (8, 9):
            self.start(display)
            control = auto.zone_control(self.db, 1, display)
            locations = auto.resolve_locations(self.db, 1, display)
            for rear, front in auto.configuration(display)[2]:
                with self.subTest(display=display, rear=rear, front=front):
                    blocker = OutboundOrderAllocation(outbound_order_detail_id=1, item_stock_id=1,
                        quantity=1, allocation_type="outbound", status="initialize",
                        from_location_id=locations[front].id, to_location_id=101)
                    self.db.add(blocker); self.db.commit()
                    self.assertIn(front, auto.path_reason(self.db, control, locations[rear]))
                    self.assertIn(front, auto.path_reason(self.db, control, locations[front]))
                    blocker.from_location_id = locations[rear].id
                    self.db.commit()
                    self.assertIsNone(auto.path_reason(self.db, control, locations[front]))
                    self.assertIn(rear, auto.path_reason(self.db, control, locations[rear]))
                    blocker.status = "in_progress"; self.db.commit()
                    self.assertIsNotNone(auto.path_reason(self.db, control, locations[rear]))
                    blocker.status = "cancelled"; self.db.commit()

    def test_equal_demand_and_order_age_use_item_id_instead_of_detail_id(self):
        self.put("item", id=2, sku="TIE", name="Same demand", base_unit=1, warehouse_id=1,
                 supplier="TEST", max_quantity=9999, min_quantity=0)
        self.db.execute(update(OutboundOrderDetail).where(OutboundOrderDetail.id == 1).values(item_id=2))
        self.put("outbound_order_detail", id=2, outbound_order_id=1, item_id=1, quantity=19,
                 unit="Thung", detail_type="auto")
        self.put("location", id=105, location_name="SOURCE2", location_code="SOURCE2", zone_id=1, warehouse_id=1)
        self.put("item_stock", id=2, item_id=2, unit_id=1, location_id=105, quantity=100,
                 status="available", is_active=True)
        self.db.commit(); self.assign(2, "Zone_CC_02", 301)
        self.start(); self.tick()
        first = self.cycles()[0]
        self.assertEqual(auto._allocations(self.db, first)[0].outbound_order_detail.item_id, 1)

    def test_one_pallet_serves_multiple_cc_and_waits_for_every_confirmation(self):
        self.put("location", id=302, location_name="CC22", location_code="CC22-NODE", zone_id=4, warehouse_id=1)
        self.put("outbound_order_detail", id=2, outbound_order_id=1, item_id=1, quantity=20, unit="Thung", detail_type="auto")
        self.db.commit(); self.assign(2, "Zone_CC_02", 302)
        self.start(); self.tick()
        cycle = self.cycles()[0]
        self.assertEqual(len(cycle.allocation_ids), 2)
        self.callback(cycle)
        self.confirm(cycle, [cycle.allocation_ids[0]])
        self.tick()
        self.assertEqual(cycle.phase, "awaiting_confirmation")
        self.assertEqual(self.rpc.call_count, 1)
        self.confirm(cycle, [cycle.allocation_ids[1]])
        self.tick()
        self.assertEqual(cycle.phase, "returning")
        self.assertEqual(self.db.get(RobotTask, cycle.return_task_id).quantity, 61)
        self.assertEqual(self.db.get(OutboundOrderDetail, 1).sorting_location_id, 301)
        self.assertEqual(self.db.get(OutboundOrderDetail, 2).sorting_location_id, 302)

    def test_other_pallet_of_same_detail_does_not_block_return(self):
        self.start(); self.tick()
        cycle = self.cycles()[0]
        self.callback(cycle)
        self.put("location", id=105, location_name="SOURCE2", location_code="SOURCE2", zone_id=1, warehouse_id=1)
        self.put("item_stock", id=2, item_id=1, unit_id=1, location_id=105, quantity=20, status="available", is_active=True)
        self.put("outbound_order_allocation", id=99, outbound_order_detail_id=1, item_stock_id=2, quantity=1,
                 status="initialize", allocation_type="outbound", from_location_id=105, to_location_id=204)
        self.db.commit()
        self.confirm(cycle); self.tick()
        self.assertEqual(cycle.phase, "returning")
        self.assertEqual(self.rpc.call_count, 2)

    def test_reuses_unsent_allocations_without_reallocating(self):
        self.put("robot_task", id=100, order_id="QUEUED", quantity=100, process_code="OUT", system_code="Thadosoft", task_order_detail='[{"taskPath":"None"}]')
        self.put("outbound_order_allocation", id=100, outbound_order_detail_id=1, item_stock_id=1, quantity=19,
                 status="initialize", allocation_type="outbound", from_location_id=101, robot_task_id=100)
        self.db.commit(); self.start(); self.tick()
        cycle = self.cycles()[0]
        self.assertEqual(cycle.pick_task_id, 100)
        self.assertEqual(self.db.query(OutboundOrderAllocation).count(), 1)
        self.assertEqual(self.rpc.call_args.args[0]["orderId"], "QUEUED")

    def test_prepared_command_recovers_without_changing_task_id(self):
        self.start()
        with patch.object(auto, "_send"):
            self.tick()
        cycle = self.cycles()[0]
        pick_id = cycle.pick_task_id
        self.rpc.assert_not_called()
        self.tick()
        self.assertEqual(cycle.pick_task_id, pick_id)
        self.assertEqual(self.rpc.call_count, 1)
        self.callback(cycle); self.confirm(cycle)
        with patch.object(auto, "_send"):
            self.tick()
        return_id = cycle.return_task_id
        self.tick()
        self.assertEqual(cycle.return_task_id, return_id)
        self.assertEqual(self.rpc.call_count, 2)

    def test_two_workers_serialize_same_source_and_stop_waits_for_inflight_send(self):
        self.start()
        sending, release, stop_requested = Event(), Event(), Event()
        def rpc(payload):
            sending.set()
            self.assertTrue(release.wait(5))
            return {"code": 1000}
        self.rpc.side_effect = rpc
        def tick():
            with Session(self.engine) as db:
                auto.tick_zone(db, 1, 8)
        def stop():
            stop_requested.set()
            with Session(self.engine) as db:
                auto.stop(db, 1, 8)
        with ThreadPoolExecutor(max_workers=3) as pool:
            first = pool.submit(tick)
            self.assertTrue(sending.wait(5))
            stopping = pool.submit(stop)
            self.assertTrue(stop_requested.wait(5))
            second = pool.submit(tick)
            self.assertFalse(stopping.done())
            release.set()
            first.result(timeout=10); stopping.result(timeout=10); second.result(timeout=10)
        self.assertEqual(self.rpc.call_count, 1)
        self.assertFalse(auto.status(self.db, 1, 8)["enabled"])

    def test_two_zones_are_independent_but_do_not_share_a_source(self):
        self.put("outbound_order_detail", id=2, outbound_order_id=1, item_id=1, quantity=20, unit="Thung", detail_type="auto")
        self.db.commit(); self.assign(2, "Zone_CC_01", 103)
        self.start(8); self.start(9); self.tick(8); self.tick(9)
        self.assertEqual(self.rpc.call_count, 1)
        auto.stop(self.db, 1, 8)
        self.assertTrue(auto.status(self.db, 1, 9)["enabled"])
        self.assertFalse(auto.status(self.db, 1, 8)["enabled"])

    def test_auto_api_permissions_warehouse_scope_and_shape(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from app.core.database import get_db
        from app.core.dependencies import get_current_user
        from app.modules.masan.masan_auto_api import router
        application = FastAPI()
        application.include_router(router, prefix="/api/v1")
        application.dependency_overrides[get_db] = lambda: self.db
        base = "/api/v1/masan/outbound-orders/auto-dispatch"
        with TestClient(application) as client:
            self.assertIn(client.post(base + "/start", json={"warehouse_id": 1, "display_zone_id": 8}).status_code, (401, 403))
            role = SimpleNamespace(name="operator", permissions=[])
            user = SimpleNamespace(id=1, roles=[role], warehouses=[])
            application.dependency_overrides[get_current_user] = lambda: user
            self.assertEqual(client.get(base + "/status", params={"warehouse_id": 1, "display_zone_id": 8}).status_code, 403)
            user.warehouses = [SimpleNamespace(id=1)]
            response = client.post(base + "/start", json={"warehouse_id": 1, "display_zone_id": 8})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(len(response.json()["vts"]), 4)
            self.assertEqual(client.post(base + "/stop", json={"warehouse_id": 1, "display_zone_id": 8}).json()["enabled"], False)
            self.assertEqual(client.post(base + "/start", json={"warehouse_id": 1, "display_zone_id": 10}).status_code, 422)

    def test_returns_precede_new_supply_even_when_other_pair_is_next(self):
        self.start(); self.tick()
        cycle = self.cycles()[0]
        self.callback(cycle); self.confirm(cycle)
        self.put("item", id=2, sku="NEXT", name="Next SKU", base_unit=1, warehouse_id=1, supplier="TEST", max_quantity=9999, min_quantity=0)
        self.put("location", id=105, location_name="SOURCE2", location_code="SOURCE2", zone_id=1, warehouse_id=1)
        self.put("item_stock", id=2, item_id=2, unit_id=1, location_id=105, quantity=100, status="available", is_active=True)
        self.put("outbound_order_detail", id=2, outbound_order_id=1, item_id=2, quantity=20, unit="Thung", detail_type="auto")
        self.db.commit(); self.assign(2, "Zone_CC_02", 301)
        self.tick()
        orders = [call.args[0]["orderId"] for call in self.rpc.call_args_list]
        self.assertTrue(orders[1].startswith("TDS_AutoReturn_"), orders)
        self.assertTrue(orders[2].startswith("TDS_AutoOutbound_"), orders)

    def test_front_is_used_only_after_rear_movement_finishes(self):
        self.db.execute(update(OutboundOrderDetail).values(quantity=300))
        for identifier in (105, 106):
            self.put("location", id=identifier, location_name=f"SOURCE{identifier}", location_code=f"SOURCE{identifier}", zone_id=1, warehouse_id=1)
            self.put("item_stock", id=identifier, item_id=1, unit_id=1, location_id=identifier, quantity=100, status="available", is_active=True)
        self.db.commit(); self.start(); self.tick()
        cycles = self.cycles()
        self.assertEqual({c.vt_location_id for c in cycles}, {201, 203})
        self.tick()
        self.assertEqual(self.rpc.call_count, 2)
        rear = next(c for c in cycles if c.vt_location_id == 201)
        self.callback(rear); self.tick()
        self.assertEqual({c.vt_location_id for c in self.cycles()}, {201, 202, 203})
        self.assertEqual(self.rpc.call_count, 3)

    def test_cache_clear_cannot_remove_cc_owned_by_an_active_cycle(self):
        self.start()
        with self.assertRaises(ValueError):
            auto.guard_station_cache_clear(self.db, 1, [301])
        self.tick(); cycle = self.cycles()[0]
        auto.stop(self.db, 1, 8)
        with self.assertRaises(ValueError):
            auto.guard_station_cache_clear(self.db, 1, [301])
        self.callback(cycle); self.confirm(cycle)
        auto.manual_return(self.db, 1, 8, cycle.id)
        self.callback(cycle, returning=True)
        auto.guard_station_cache_clear(self.db, 1, [301])

    def test_legacy_confirmation_apis_cannot_bypass_cc_or_deduct_twice(self):
        self.start(); self.tick(); cycle = self.cycles()[0]
        self.callback(cycle)
        task = self.db.get(RobotTask, cycle.pick_task_id)
        with self.assertRaisesRegex(ValueError, "CC"):
            fixture.outbound.confirm_no_qr(self.db, task.order_id)
        with self.assertRaisesRegex(ValueError, "CC"):
            fixture.outbound.execute_qr_manual(self.db, cycle.allocation_ids, "any")
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 100)
        self.confirm(cycle)
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 81)

    def test_unrecognized_ics_ack_stops_instead_of_repeating(self):
        self.rpc.return_value = {"code": 500, "message": "Rejected"}
        self.start(); self.tick(); self.tick()
        self.assertEqual(self.rpc.call_count, 1)
        self.assertFalse(auto.status(self.db, 1, 8)["enabled"])
        self.assertEqual(self.db.query(OutboundAutoCommand).one().state, "unknown")

    def test_cache_failure_after_confirmation_is_repaired_without_deducting_again(self):
        self.start(); self.tick(); cycle = self.cycles()[0]
        self.callback(cycle)
        with patch.object(auto, "cache_set", side_effect=RuntimeError("cache unavailable")):
            self.confirm(cycle)
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 81)
        self.assertTrue(cycle.cache_pending)
        self.tick()
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 81)
        self.assertFalse(cycle.cache_pending)

    def test_completed_cycle_retries_cc_cleanup_after_partial_cache_failure(self):
        self.db.execute(update(OutboundOrderDetail).where(OutboundOrderDetail.id == 1).values(quantity=100))
        self.db.commit()
        self.start(); self.tick(); cycle = self.cycles()[0]
        self.callback(cycle)
        detail_key = "outbound:assigned_cc_details:1:1"
        location_key = "outbound:assigned_cc_location:1:301"
        original_delete = auto.cache_delete

        def interrupted_cleanup(key):
            if key == detail_key:
                raise RuntimeError("Redis interrupted after clearing CC location")
            return original_delete(key)

        with patch.object(auto, "cache_delete", side_effect=interrupted_cleanup):
            self.confirm(cycle)
        self.assertEqual(cycle.phase, "completed")
        self.assertTrue(cycle.cache_pending)
        self.assertNotIn(location_key, self.cache)
        self.assertIn(detail_key, self.cache)
        self.tick()
        self.assertNotIn(detail_key, self.cache)
        self.assertFalse(cycle.cache_pending)
        self.assertEqual(self.db.get(ItemStock, 1).quantity, 0)

    def test_source_reserved_by_inbound_is_not_selected(self):
        self.put("inbound_order", id=1, order_code="RESERVED-IN", warehouse_id=1, created_by_id=1)
        self.put("inbound_order_detail", id=1, inbound_order_id=1, from_location_id=101,
                 to_location_id=301, status="initialize", detail_type="auto")
        self.db.commit()
        self.start(); self.tick()
        self.assertEqual(self.rpc.call_count, 0)
        self.assertEqual(self.cycles(), [])

    def test_existing_manual_pallet_is_not_taken_over_and_reports_wait_reason(self):
        self.db.execute(update(ItemStock).where(ItemStock.id == 1).values(location_id=201))
        self.put("outbound_order_allocation", id=99, outbound_order_detail_id=1, item_stock_id=1,
                 quantity=1, allocation_type="outbound", status="pre_completed",
                 from_location_id=101, to_location_id=201)
        self.put("location", id=105, location_name="SOURCE2", location_code="SOURCE2", zone_id=1, warehouse_id=1)
        self.put("item_stock", id=2, item_id=1, unit_id=1, location_id=105, quantity=50,
                 status="available", is_active=True)
        self.db.commit()
        self.start(); self.tick()
        self.assertEqual(self.cycles()[0].vt_location_id, 202)
        rear = next(vt for vt in auto.status(self.db, 1, 8)["vts"] if vt["location_id"] == 201)
        self.assertIsNone(rear["cycle_id"])
        self.assertIn("thủ công", rear["message"])
        self.assertIsNone(self.db.get(OutboundOrderAllocation, 99).auto_cycle_id)


if __name__ == "__main__":
    unittest.main()
