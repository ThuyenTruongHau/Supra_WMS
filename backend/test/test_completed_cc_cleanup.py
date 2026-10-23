"""Completed CC vehicle cleanup: real SQLite schema, in-memory Redis substitute."""

import copy
import fnmatch
import unittest
from unittest.mock import patch

# This fixture module sets unreachable DB/cache URLs before importing the app.
from test import test_outbound_remaining_quantity as fixture
from app.modules.masan import masan_outbound_service as masan
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrder, OutboundOrderDetail
from sqlalchemy import update


class CompletedCcCleanupTests(unittest.TestCase):
    put = fixture.OutboundRemainingQuantityTests.put
    cache_details = fixture.OutboundRemainingQuantityTests.cache_details
    allocation = fixture.OutboundRemainingQuantityTests.allocation

    def setUp(self):
        fixture.OutboundRemainingQuantityTests.setUp(self)
        fake = patch.object(masan, "cache_replace_if_unchanged", side_effect=self.replace)
        self.cas = fake.start()
        self.addCleanup(fake.stop)

    def replace(self, key, expected, value):
        if self.cache.get(key) != expected:
            return False
        if value is None:
            self.cache.pop(key, None)
        else:
            self.cache[key] = copy.deepcopy(value)
        return True

    def finish(self):
        self.allocation("completed", 19)

    def add_other_order(self):
        self.put("outbound_order", id=2, order_code="OUT-OTHER", warehouse_id=1, created_by_id=1)
        self.put("outbound_order_detail", id=2, outbound_order_id=2, item_id=1, quantity=5,
                 unit="Thung", detail_type="auto", details={"vehicle_no": "OTHER"})
        self.db.commit()

    def test_completed_bucket_without_representative_order_is_cleared(self):
        self.finish()
        self.cache["outbound:assigned_cc_location:1:103"].pop("outbound_order_id")
        result = masan.clear_completed_cc_assignments(self.db, 1)
        self.assertEqual((result["locations_deleted"], result["details_deleted"], result["history_saved"]), (1, 1, 1))
        self.assertEqual(self.cache, {})
        self.assertEqual(self.db.query(OutboundOrderDetail.sorting_location_id).filter(OutboundOrderDetail.id == 1).scalar(), 103)

    def test_confirm_last_allocation_clears_vehicle_and_saves_cc_history(self):
        identifier = self.allocation("pre_completed", 19)
        masan.confirm_allocation_outbound(
            self.db, 1, "Zone_CC_01", {identifier: 19}, "test_user"
        )
        self.assertNotIn("outbound:assigned_cc_location:1:103", self.cache)
        self.assertNotIn("outbound:assigned_cc_details:1:1", self.cache)
        self.assertEqual(self.db.query(OutboundOrderDetail.sorting_location_id).filter(OutboundOrderDetail.id == 1).scalar(), 103)
        self.assertEqual(self.db.query(OutboundOrderDetail.status).filter(OutboundOrderDetail.id == 1).scalar(), "completed")

    def test_confirm_with_other_pending_allocation_keeps_vehicle(self):
        identifier = self.allocation("pre_completed", 7)
        self.allocation("issued", 12)
        masan.confirm_allocation_outbound(
            self.db, 1, "Zone_CC_01", {identifier: 7}, "test_user"
        )
        self.assertIn("outbound:assigned_cc_location:1:103", self.cache)
        self.assertIn("outbound:assigned_cc_details:1:1", self.cache)

    def test_mixed_bucket_preserves_unfinished_order(self):
        self.finish()
        self.add_other_order()
        self.cache_details([1, 2])
        result = masan.clear_completed_cc_assignments(self.db, 1, order_id=1)
        bucket = self.cache["outbound:assigned_cc_location:1:103"]
        self.assertEqual([line["detail_id"] for line in bucket["lines"]], [2])
        self.assertEqual(bucket["outbound_order_id"], 2)
        self.assertEqual(result["locations_updated"], 1)
        self.assertNotIn("outbound:assigned_cc_details:1:1", self.cache)
        self.assertIn("outbound:assigned_cc_details:1:2", self.cache)

    def test_completed_vehicle_is_freed_while_other_vehicle_in_same_order_is_pending(self):
        self.finish()
        self.put("outbound_order_detail", id=2, outbound_order_id=1, item_id=1, quantity=5,
                 unit="Thung", detail_type="auto", details={"vehicle_no": "OTHER"})
        self.db.commit()
        self.assertEqual(self.db.query(OutboundOrder.status).filter(OutboundOrder.id == 1).scalar(), "in_progress")
        masan.clear_completed_cc_assignments(self.db, 1)
        self.assertNotIn("outbound:assigned_cc_location:1:103", self.cache)
        self.assertEqual(self.db.get(OutboundOrderDetail, 2).unallocated_quantity, 5)

    def test_partial_failed_or_in_progress_detail_keeps_vehicle(self):
        for status, quantity in [("completed", 7), ("issued", 12), ("failed", 19)]:
            self.allocation(status, quantity)
            before = copy.deepcopy(self.cache)
            self.assertEqual(masan.clear_completed_cc_assignments(self.db, 1)["locations_deleted"], 0)
            self.assertEqual(self.cache, before)

    def test_pending_return_keeps_vehicle(self):
        self.finish()
        self.allocation("initialize", 81, kind="return")
        before = copy.deepcopy(self.cache)
        masan.clear_completed_cc_assignments(self.db, 1)
        self.assertEqual(self.cache, before)

    def test_cancelled_return_does_not_keep_completed_vehicle(self):
        self.finish()
        self.allocation("cancelled", 81, kind="return")
        masan.clear_completed_cc_assignments(self.db, 1)
        self.assertEqual(self.cache, {})

    def test_periodic_pass_cleans_before_checking_for_free_cc(self):
        self.finish()
        self.add_other_order()
        masan.assign_cc_zone(self.db, 1)
        bucket = self.cache["outbound:assigned_cc_location:1:103"]
        self.assertEqual(bucket["vehicle_number"], "OTHER")
        self.assertEqual([line["detail_id"] for line in bucket["lines"]], [2])

    def test_periodic_pass_cleans_when_no_unfinished_orders_exist(self):
        self.finish()
        masan.assign_cc_zone(self.db, 1)
        self.assertEqual(self.cache, {})

    def test_reset_order_does_not_reappear_and_new_order_can_be_assigned(self):
        self.db.execute(update(OutboundOrder).where(OutboundOrder.id == 1).values(
            details={"cc_assignment_disabled": True, "station_reset": {"reason": "manual recount"}},
        ))
        self.db.commit()
        self.cache.clear()
        masan.assign_cc_zone(self.db, 1)
        self.assertEqual(self.cache, {})
        self.add_other_order()
        masan.assign_cc_zone(self.db, 1)
        bucket = self.cache["outbound:assigned_cc_location:1:103"]
        self.assertEqual(bucket["outbound_order_id"], 2)
        self.assertEqual(bucket["vehicle_number"], "OTHER")
        self.assertEqual([row["detail_id"] for row in bucket["lines"]], [2])

    def test_order_status_is_queried_fresh_in_completion_hook(self):
        cached_order = self.db.get(OutboundOrder, 1)
        self.assertEqual(cached_order.status, "initialize")
        self.finish()
        self.db.execute(update(OutboundOrderDetail).where(OutboundOrderDetail.id == 1).values(sorting_location_id=103))
        self.db.commit()
        # Keep an old value in the identity map; scalar SQL must bypass it.
        cached_order.__dict__["status"] = "initialize"
        masan._clear_cc_cache_if_order_completed(self.db, 1, 1)
        self.assertEqual(self.cache, {})

    def test_completion_hook_defers_missing_history_until_periodic_pass(self):
        self.finish()
        masan._clear_cc_cache_if_order_completed(self.db, 1, 1)
        self.assertIn("outbound:assigned_cc_location:1:103", self.cache)
        masan.clear_completed_cc_assignments(self.db, 1)
        self.assertEqual(self.cache, {})

    def test_orphan_reverse_mapping_is_cleaned_and_history_saved(self):
        self.finish()
        self.cache.pop("outbound:assigned_cc_location:1:103")
        result = masan.clear_completed_cc_assignments(self.db, 1)
        self.assertEqual(result["details_deleted"], 1)
        self.assertEqual(result["history_saved"], 1)

    def test_scan_with_real_redis_prefix_does_not_double_prefix_keys(self):
        self.finish()
        with patch.object(masan, "cache_scan_keys", side_effect=lambda pattern:
                          ["wms:" + key for key in self.cache if fnmatch.fnmatchcase(key, pattern)]):
            masan.clear_completed_cc_assignments(self.db, 1)
        self.assertEqual(self.cache, {})

    def test_concurrent_bucket_reassignment_is_not_deleted(self):
        self.finish()
        self.add_other_order()
        original = copy.deepcopy(self.cache["outbound:assigned_cc_location:1:103"])
        def concurrent_replace(key, expected, value):
            if key == "outbound:assigned_cc_location:1:103":
                self.cache[key] = {**original, "outbound_order_id": 2, "vehicle_number": "NEW", "lines": [{"detail_id": 2}]}
            return self.replace(key, expected, value)
        self.cas.side_effect = concurrent_replace
        result = masan.clear_completed_cc_assignments(self.db, 1)
        self.assertEqual(result["locations_deleted"], 0)
        self.assertEqual(self.cache["outbound:assigned_cc_location:1:103"]["vehicle_number"], "NEW")

    def test_other_warehouse_is_untouched(self):
        self.finish()
        self.cache["outbound:assigned_cc_location:2:104"] = {"vehicle_number": "OTHER", "lines": [{"detail_id": 1}]}
        masan.clear_completed_cc_assignments(self.db, 2)
        self.assertIn("outbound:assigned_cc_location:2:104", self.cache)


if __name__ == "__main__":
    unittest.main()
