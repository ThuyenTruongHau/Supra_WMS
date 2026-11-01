"""Vietnam event timestamps, output formatting and rollback-safe isolated fixtures."""
import logging
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from test import test_robot_distance_callback as fixture
from app.core import time as warehouse_time
from app.core.logger import VietnamFormatter
from app.core.time import VN_TZ, as_utc, as_vietnam, format_vietnam
from app.modules.masan import masan_outbound_service as outbound
from app.modules.masan.masan_inbound_service import _format_inbound_report_datetime
from app.modules.masan.masan_schema import MasanStartSortingTimeResponse
from app.modules.robot.robot_service import task_status_service
from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrderDetail
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation
from app.modules.warehouse.item.item_service import _resolve_qr_code_status
from app.modules.warehouse.notificcation.notification_service import _resolve_holding_date


class TimezoneTests(unittest.TestCase):
    def database(self):
        case = fixture.RobotDistanceCallbackTests()
        self.addCleanup(case.doCleanups)
        case.setUp()
        return case.db

    def test_business_clock_and_day_are_vietnamese(self):
        instant = datetime(2026, 10, 31, 17, 30, tzinfo=timezone.utc).astimezone(VN_TZ)
        with patch.object(warehouse_time, "datetime", wraps=datetime) as clock:
            clock.now.return_value = instant
            self.assertEqual(warehouse_time.vn_now().utcoffset(), timedelta(hours=7))
            self.assertEqual(warehouse_time.vn_today().isoformat(), "2026-11-01")
            clock.now.assert_called_with(VN_TZ)

    def test_conversion_preserves_instants_and_handles_legacy_wall_time(self):
        instant = datetime(2026, 10, 31, 4, 25, tzinfo=timezone.utc)
        local = as_vietnam(instant)
        self.assertEqual(local.hour, 11)
        self.assertEqual(as_utc(local), instant)
        self.assertEqual(as_utc(instant.replace(tzinfo=None)), instant)
        self.assertEqual(as_vietnam(datetime(2026, 10, 31, 11, 25)), local)

    def test_qr_and_stock_dates_use_vietnam_day_across_utc_midnight(self):
        created = datetime(2026, 10, 31, 18, 30, tzinfo=timezone.utc)
        vietnam_day = datetime(2026, 11, 1).date()
        self.assertEqual(_resolve_qr_code_status(created, None, vietnam_day), "available")
        self.assertEqual(_resolve_holding_date(SimpleNamespace(lot_number_from=None, created_at=created)), vietnam_day)

    def test_excel_converts_utc_and_keeps_legacy_vietnam_values(self):
        utc = datetime(2026, 10, 31, 18, 30, 15, tzinfo=timezone.utc)
        expected = "01/11/2026\n01:30:15"
        for formatter in (_format_inbound_report_datetime, outbound._format_outbound_report_datetime):
            self.assertEqual(formatter(utc), expected)
            self.assertEqual(formatter(as_vietnam(utc)), expected)
            self.assertEqual(formatter(datetime(2026, 11, 1, 1, 30, 15)), expected)
            self.assertEqual(formatter(None), "")
        self.assertEqual(format_vietnam(utc, "%d/%m/%Y"), "01/11/2026")

    def test_new_and_repeated_sorting_response_both_include_vietnam_offset(self):
        db = self.database()
        instant = datetime(2026, 11, 1, 1, 30, 15, tzinfo=VN_TZ)
        with patch.object(outbound, "vn_now", return_value=instant) as clock:
            first = outbound.start_sorting_time(db, [1, 2])
            db.expire_all()
            repeated = outbound.start_sorting_time(db, [1, 2])
        clock.assert_called_once()
        for result in (first, repeated):
            self.assertEqual(result["started_at"], instant)
            self.assertIn("2026-11-01T01:30:15+07:00", MasanStartSortingTimeResponse(**result).model_dump_json())
        self.assertFalse(first["already_started"])
        self.assertTrue(repeated["already_started"])

    def test_robot_callback_saves_vietnam_wall_time_in_sqlite(self):
        db = self.database()
        instant = datetime(2026, 11, 1, 1, 30, 15, tzinfo=VN_TZ)
        payload = {"orderId": "TDS_IN_1", "status": "6", "deviceNum": "R1",
                   "subTaskStatus": "2", "subTaskSeq": "2"}
        with patch("app.modules.robot.robot_service.vn_now", return_value=instant):
            task_status_service.receive_task_status(db, payload)
            task_status_service.receive_task_status(db, {**payload, "status": "8"})
        db.expire_all()
        detail = db.get(InboundOrderDetail, 1)
        self.assertEqual(as_vietnam(detail.start_time), instant)
        self.assertEqual(as_vietnam(detail.end_time), instant)
        self.assertEqual(detail.status, "completed")

    def test_sorting_confirmation_saves_vietnam_time(self):
        db = self.database()
        instant = datetime(2026, 11, 1, 1, 30, 15, tzinfo=VN_TZ)
        with (
            patch.object(outbound, "vn_now", return_value=instant),
            patch.object(outbound, "_delete_stock_ready_cache_for_allocation"),
            patch.object(outbound, "_clear_cache_details"),
            patch.object(outbound, "_clear_cc_cache_if_order_completed"),
            patch.object(outbound, "_settle_outbound_stock"),
        ):
            outbound._confirm_allocation_outbound(db, 1, "TEST", {1: 1}, "TEST")
        db.expire_all()
        self.assertEqual(as_vietnam(db.get(OutboundOrderAllocation, 1).end_sorting_time), instant)

    def test_logs_include_vietnam_time_and_offset(self):
        record = logging.LogRecord("test", logging.INFO, __file__, 1, "message", (), None)
        record.created = datetime(2026, 10, 31, 18, 30, tzinfo=timezone.utc).timestamp()
        self.assertEqual(VietnamFormatter().formatTime(record), "2026-11-01T01:30:00.000+07:00")


if __name__ == "__main__":
    unittest.main()
