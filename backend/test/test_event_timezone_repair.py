"""The historical repair selects evidence-backed offsets and preserves correct/missing times."""
import unittest
from datetime import datetime, timedelta

from app.core.time import VN_TZ
from scripts.repair_event_timezones import plan_repairs


class EventTimezoneRepairTests(unittest.TestCase):
    def sample(self):
        at = lambda h, m, s: datetime(2026, 10, 31, h, m, s, tzinfo=VN_TZ)
        return {"id": 2340, "start_time": at(11, 23, 24), "end_time": at(11, 24, 38),
                "start_sorting_time": at(4, 25, 14), "end_sorting_time": at(4, 25, 18),
                "callback_start": at(11, 23, 24), "callback_end": at(11, 24, 38)}

    def confirmations(self):
        return {2340: {"history_id": 3916, "created_at": datetime(2026, 10, 31, 11, 25, 18, tzinfo=VN_TZ)}}

    def test_sorting_repair_needs_history_and_orders_start_after_arrival(self):
        row = self.sample()
        self.assertEqual(plan_repairs([row], {}), [])
        plan, = plan_repairs([row], self.confirmations())
        self.assertEqual(set(plan["evidence"]), {"start_sorting_time", "end_sorting_time"})
        self.assertEqual(plan["after"]["start_sorting_time"].hour, 11)
        self.assertEqual(plan["after"]["end_sorting_time"].hour, 11)
        self.assertEqual(plan["after"]["end_time"], row["end_time"])

    def test_correct_and_missing_sorting_starts_are_kept(self):
        for start in (None, datetime(2026, 10, 31, 11, 25, 14, tzinfo=VN_TZ)):
            with self.subTest(start=start):
                row = {**self.sample(), "start_sorting_time": start}
                plan, = plan_repairs([row], self.confirmations())
                self.assertEqual(plan["after"]["start_sorting_time"], start)
                self.assertNotIn("start_sorting_time", plan["evidence"])

    def test_robot_repair_uses_each_corresponding_callback(self):
        row = self.sample()
        for field in ("start_time", "end_time"):
            row[field] -= timedelta(hours=7)
        plan, = plan_repairs([row], {})
        self.assertEqual(set(plan["evidence"]), {"start_time", "end_time"})
        self.assertEqual(plan["after"]["start_time"], row["callback_start"])
        self.assertEqual(plan["after"]["end_time"], row["callback_end"])

    def test_repair_does_not_repeat_and_rejects_unrelated_differences(self):
        row = self.sample()
        plan, = plan_repairs([row], self.confirmations())
        healed = {**row, **plan["after"]}
        self.assertEqual(plan_repairs([healed], self.confirmations()), [])
        unrelated = {**row, "start_time": row["start_time"] - timedelta(hours=6)}
        self.assertEqual(plan_repairs([unrelated], {}), [])

    def test_contradictory_references_abort_the_plan(self):
        row = self.sample()
        row["end_time"] = row["start_time"] - timedelta(hours=7, minutes=1)
        row["callback_end"] = row["end_time"] + timedelta(hours=7)
        with self.assertRaisesRegex(ValueError, "ordering is ambiguous"):
            plan_repairs([row], {})


if __name__ == "__main__":
    unittest.main()
