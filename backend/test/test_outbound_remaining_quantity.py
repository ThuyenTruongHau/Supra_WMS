"""Regression tests with a real in-memory SQL schema and fake cache/ICS only.

Run in an isolated process; these environment overrides prevent live connections.
"""

import copy
import fnmatch
import os
import re
import unittest
from unittest.mock import patch

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="outbound-regression-test",
)

# Register all ORM relationships without starting FastAPI's lifespan or workers.
from app.main import app  # noqa: F401,E402
from app.core.database import Base
from app.modules.masan import masan_outbound_service as masan
from app.modules.warehouse.outbound_order import outbound_order_service as outbound
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrderAllocation,
    OutboundOrderDetail,
)
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from sqlalchemy import create_engine, event, insert, update
from sqlalchemy.orm import Session


class OutboundRemainingQuantityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:")

        @event.listens_for(self.engine, "connect")
        def sqlite_functions(connection, _):
            connection.create_function("regexp_replace", 4, lambda value, pattern, replacement, flags: re.sub(pattern, replacement, value or ""))

        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.put("warehouse", id=1, code="TEST-1")
        self.put("warehouse", id=2, code="TEST-2")
        self.put("zone", id=1, warehouse_id=1, code="Zone_storage")
        self.put("zone", id=2, warehouse_id=1, code="Zone_CC_01")
        self.put("zone", id=3, warehouse_id=1, code="Zone_sorting_1")
        self.put("unit", id=1, name="Thung")
        self.put("users", id=1, username="test", email="test@example.invalid", hashed_password="unused")
        self.put("item", id=1, sku="02XX00200", name="Test item", base_unit=1, max_quantity=9999, min_quantity=0, warehouse_id=1, supplier="TEST")
        for identifier, name, code, zone_id, warehouse_id in [
            (101, "G417", "SOURCE-NODE", 1, 1),
            (102, "VT14", "VT-NODE", 3, 1),
            (103, "CC01", "CC-NODE", 2, 1),
            (104, "G417", "OTHER-NODE", 1, 2),
        ]:
            self.put("location", id=identifier, location_name=name, location_code=code, zone_id=zone_id, warehouse_id=warehouse_id)
        self.put("outbound_order", id=1, order_code="OUT-TEST", warehouse_id=1, created_by_id=1)
        self.put("outbound_order_detail", id=1, outbound_order_id=1, item_id=1, quantity=19, unit="Thung", detail_type="auto", details={"vehicle_no": "TEST", "locator": "G417"})
        self.put("item_stock", id=1, item_id=1, unit_id=1, location_id=101, quantity=100, status="available", is_active=True)
        self.db.commit()

        self.cache = {}
        self.cache_details([1])
        for name, fake in {
            "cache_get": lambda key: copy.deepcopy(self.cache.get(key)),
            "cache_scan_keys": lambda pattern: sorted(key for key in self.cache if fnmatch.fnmatchcase(key, pattern)),
            "cache_set": lambda key, value, ttl=None: self.cache.__setitem__(key, copy.deepcopy(value)),
            "cache_delete": lambda key: self.cache.pop(key, None),
        }.items():
            mock = patch.object(masan, name, side_effect=fake)
            mock.start()
            self.addCleanup(mock.stop)
        rpc = patch.object(outbound.task_status_service, "add_task", return_value={"code": 1000})
        self.rpc = rpc.start()
        self.addCleanup(rpc.stop)

    def put(self, table, **values):
        self.db.execute(insert(Base.metadata.tables[table]).values(**values))

    def detail(self, identifier=1):
        self.db.expire_all()
        return self.db.get(OutboundOrderDetail, identifier)

    def allocation(self, status, quantity, detail_id=1, kind="outbound"):
        result = self.db.execute(insert(Base.metadata.tables["outbound_order_allocation"]).values(
            outbound_order_detail_id=detail_id, item_stock_id=1, quantity=quantity,
            status=status, allocation_type=kind, from_location_id=101, to_location_id=102,
        ))
        self.db.commit()
        return result.inserted_primary_key[0]

    def cache_details(self, identifiers):
        lines = []
        for identifier in identifiers:
            detail = self.db.get(OutboundOrderDetail, identifier)
            lines.append({"detail_id": identifier, "outbound_order_id": 1, "item_id": 1, "quantity": detail.quantity, "locator": (detail.details or {}).get("locator")})
            self.cache[f"outbound:assigned_cc_details:1:{identifier}"] = {"zone": "Zone_CC_01", "location_id": 103}
        self.cache["outbound:assigned_cc_location:1:103"] = {"zone": "Zone_CC_01", "outbound_order_id": 1, "vehicle_number": "TEST", "lines": lines}

    def dispatch(self):
        return masan.sending_masan_outbound_task(self.db, 1, "Zone_CC_01", 1, 102)

    def allocated(self):
        return self.db.query(OutboundOrderAllocation).filter(
            OutboundOrderAllocation.allocation_type == "outbound",
            OutboundOrderAllocation.status.notin_(["failed", "cancelled"]),
        ).all()

    def test_failed_and_cancelled_do_not_fulfil_demand_or_hold_stock(self):
        self.allocation("failed", 12)
        self.allocation("cancelled", 7)
        detail = self.detail()
        self.assertEqual((detail.unallocated_quantity, detail.status), (19, "initialize"))
        self.assertEqual(outbound.lacked_details(self.db, 1)[0].quantity, 19)
        self.assertEqual(self.db.get(ItemStock, 1).available_quantity, 100)

    def test_new_detail_without_any_allocation_is_reported_as_lacked(self):
        self.assertEqual(outbound.lacked_details(self.db, 1)[0].quantity, 19)

    def test_completed_seven_failed_twelve_show_twelve_needed(self):
        self.allocation("completed", 7)
        self.allocation("failed", 12)
        self.assertEqual(self.detail().unallocated_quantity, 12)
        self.assertEqual(masan.get_item_needed_to_sorting(self.db, 1, "Zone_CC_01")["items"][0]["total_quantity"], 12)

    def test_retry_failed_sends_only_missing_quantity(self):
        self.allocation("completed", 7)
        self.allocation("failed", 12)
        result = self.dispatch()
        self.assertEqual(result["lacked"], [])
        issued = [a for a in self.allocated() if a.status == "issued"]
        self.assertEqual([a.quantity for a in issued], [12])
        self.assertEqual(self.detail().unallocated_quantity, 0)
        self.assertEqual(self.rpc.call_count, 1)
        self.assertEqual(self.rpc.call_args.args[0]["taskOrderDetail"], [{"taskPath": "SOURCE-NODE,VT-NODE"}])

    def test_partial_completed_line_can_dispatch_remainder(self):
        self.allocation("completed", 7)
        self.dispatch()
        self.assertEqual(sum(a.quantity for a in self.allocated()), 19)
        self.assertEqual([a.quantity for a in self.allocated() if a.status == "issued"], [12])

    def test_repeated_click_cannot_allocate_or_send_twice(self):
        self.dispatch()
        with self.assertRaisesRegex(ValueError, "Không có phần hàng mới"):
            self.dispatch()
        self.assertEqual(sum(a.quantity for a in self.allocated()), 19)
        self.assertEqual(self.rpc.call_count, 1)

    def test_completed_order_with_cancelled_return_stays_completed(self):
        self.allocation("completed", 19)
        self.allocation("cancelled", 81, kind="return")
        self.assertEqual(self.detail().status, "completed")
        with self.assertRaises(ValueError):
            self.dispatch()
        self.rpc.assert_not_called()

    def test_failed_return_still_needs_resolution(self):
        self.allocation("completed", 19)
        self.allocation("failed", 81, kind="return")
        self.assertEqual(self.detail().status, "in_progress")
        self.assertEqual(self.detail().unallocated_quantity, 0)

    def test_api_does_not_report_success_when_worker_returns_none(self):
        from fastapi import HTTPException
        from app.modules.masan import masan_api
        from app.modules.masan.masan_schema import MasanSortingOutboundDispatchRequest

        body = MasanSortingOutboundDispatchRequest(warehouse_id=1, zone="Zone_CC_01", item_id=1, to_location_id=102)
        with patch.object(masan_api, "run_logic_task", return_value=None):
            with self.assertRaises(HTTPException) as caught:
                masan_api.masan_sorting_outbound_dispatch(body)
        self.assertEqual(caught.exception.status_code, 400)

    def test_cleared_stock_and_other_warehouse_are_not_used(self):
        self.db.execute(update(ItemStock).where(ItemStock.id == 1).values(is_active=False))
        self.put("item_stock", id=2, item_id=1, unit_id=1, location_id=104, quantity=999, status="available", is_active=True)
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "Locator G417"):
            self.dispatch()
        self.assertEqual(self.allocated(), [])
        self.rpc.assert_not_called()

    def test_locator_node_code_is_accepted(self):
        self.db.execute(update(OutboundOrderDetail).where(OutboundOrderDetail.id == 1).values(details={"locator": "SOURCE-NODE"}))
        self.db.commit()
        self.dispatch()
        self.assertEqual(sum(a.quantity for a in self.allocated()), 19)

    def test_multiple_rows_cannot_overallocate_a_locator(self):
        quantities = [12, 40, 32, 32, 30, 2, 30, 26]
        self.db.execute(update(OutboundOrderDetail).where(OutboundOrderDetail.id == 1).values(quantity=quantities[0]))
        for identifier, quantity in enumerate(quantities[1:], 2):
            self.put("outbound_order_detail", id=identifier, outbound_order_id=1, item_id=1, quantity=quantity, unit="Thung", detail_type="auto", details={"vehicle_no": "TEST", "locator": "G417"})
        self.db.execute(update(ItemStock).where(ItemStock.id == 1).values(quantity=198))
        self.db.commit()
        self.cache_details(list(range(1, 9)))
        result = self.dispatch()
        self.assertEqual(sum(a.quantity for a in self.allocated()), 198)
        self.assertEqual([(row["id"], row["quantity"]) for row in result["lacked"]], [(8, 6)])
        self.assertEqual(self.rpc.call_count, 1)

    def test_detail_can_split_across_stock_rows_at_same_locator(self):
        self.db.execute(update(ItemStock).where(ItemStock.id == 1).values(quantity=8))
        self.put("item_stock", id=2, item_id=1, unit_id=1, location_id=101, quantity=11, status="available", is_active=True)
        self.db.commit()
        self.dispatch()
        self.assertEqual(sorted(a.quantity for a in self.allocated()), [8, 11])
        self.assertEqual(self.rpc.call_count, 1)

    def test_beat_assignment_recovers_failed_lines(self):
        self.allocation("failed", 19)
        self.cache.clear()
        masan.assign_cc_zone(self.db, 1)
        bucket = self.cache["outbound:assigned_cc_location:1:103"]
        self.assertEqual([(line["detail_id"], line["quantity"]) for line in bucket["lines"]], [(1, 19)])

    def test_beat_assignment_of_partial_line_uses_remaining_quantity(self):
        self.allocation("completed", 7)
        self.cache.clear()
        masan.assign_cc_zone(self.db, 1)
        self.assertEqual(self.cache["outbound:assigned_cc_location:1:103"]["lines"][0]["quantity"], 12)

    def test_no_locator_calculate_uses_only_remaining_quantity(self):
        self.allocation("completed", 7)
        self.db.execute(update(OutboundOrderDetail).where(OutboundOrderDetail.id == 1).values(details={}))
        self.db.commit()
        with patch.object(outbound, "_strategy_loading_stocks", return_value=[self.db.get(ItemStock, 1)]):
            self.dispatch()
        self.assertEqual([a.quantity for a in self.allocated() if a.status == "issued"], [12])


if __name__ == "__main__":
    unittest.main()
