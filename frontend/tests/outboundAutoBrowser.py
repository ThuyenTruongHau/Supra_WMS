"""Full UI regressions; all HTTP and WS calls are intercepted, including writes.

Run with Vite/preview available and OUTBOUND_BROWSER_BASE_URL configured.
"""
import copy
import json
import re
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect
import outboundReturnBrowser as legacy

BASE_URL, VT_ZONES = legacy.BASE_URL, legacy.VT_ZONES


class OutboundAutoBrowserTests(legacy.OutboundReturnBrowserTests):
    def setUp(self):
        self.auto_states = {}
        self.auto_writes = []
        self.status_error = False
        super().setUp()

    def state(self, display_id):
        return self.auto_states.setdefault(display_id, {
            "warehouse_id": 1, "display_zone_id": display_id, "enabled": False,
            "state": "stopped", "message": "Đã dừng", "vts": [],
        })

    def mock_api(self, route):
        url = urlparse(route.request.url)
        if "/auto-dispatch/" not in url.path:
            return super().mock_api(route)
        query = parse_qs(url.query)
        self.calls.append((route.request.method, url.path, query))
        if route.request.method == "GET":
            if self.status_error:
                return route.fulfill(status=503, json={"detail": "Isolated status failure"})
            return route.fulfill(json=self.state(int(query["display_zone_id"][0])))
        body = route.request.post_data_json
        self.auto_writes.append((url.path, copy.deepcopy(body)))
        self.assertEqual(body["warehouse_id"], 1)
        state = self.state(body["display_zone_id"])
        if url.path.endswith("/start"):
            state.update(enabled=True, state="waiting", message="Chờ nhu cầu")
        elif url.path.endswith("/stop"):
            state.update(enabled=False, state="stopped", message="Đã dừng phát lệnh")
        elif url.path.endswith("/return"):
            state["vts"][0].update(phase="returning", message="Đang return")
        elif url.path.endswith("/verify-unsent"):
            if getattr(self, 'verify_error', False):
                return route.fulfill(status=409, json={"detail":"Lệnh đã có callback; không thể xác nhận"})
            task_id=int(url.path.split('/')[-2])
            candidate=next(c for c in state['return_candidates'] if c['task_id']==task_id)
            candidate.update(state='ready',can_verify=False,message='Return đủ điều kiện tiếp quản')
        else:
            return route.fulfill(status=405)
        route.fulfill(json=state)

    def test_start_stop_and_refresh_use_persistent_server_state(self):
        self.page.goto(f"{BASE_URL}/export/zone/9")
        control = self.page.get_by_test_id("outbound-auto-9")
        expect(control.get_by_role("button", name=re.compile("Gọi tự động$"))).to_be_enabled()
        expect(control).to_have_text("Gọi tự động")
        control.get_by_role("button", name=re.compile("Gọi tự động$")).click()
        expect(control.get_by_role("button", name=re.compile("Dừng tự động$"))).to_be_enabled()
        expect(control).to_have_text("Dừng tự động")
        expect(self.page.get_by_role("button", name=re.compile("Gọi lệnh$"))).to_be_disabled()
        self.page.reload()
        expect(control.get_by_role("button", name=re.compile("Dừng tự động$"))).to_be_enabled()
        expect(control).to_have_text("Dừng tự động")
        control.get_by_role("button", name=re.compile("Dừng tự động$")).click()
        expect(self.page.get_by_role("button", name=re.compile("Gọi lệnh$"))).to_be_enabled()
        expect(control).to_have_text("Gọi tự động")
        self.assertEqual([body["display_zone_id"] for _, body in self.auto_writes], [9, 9])
        self.assertEqual(self.errors, [])

    def test_overview_zones_have_independent_switches(self):
        self.page.goto(f"{BASE_URL}/export")
        first = self.page.get_by_test_id("outbound-auto-8")
        second = self.page.get_by_test_id("outbound-auto-9")
        first.get_by_role("button", name=re.compile("Gọi tự động$")).click()
        expect(first.get_by_role("button", name=re.compile("Dừng tự động$"))).to_be_visible()
        expect(second.get_by_role("button", name=re.compile("Gọi tự động$"))).to_be_enabled()
        expect(first).to_have_text("Dừng tự động")
        expect(second).to_have_text("Gọi tự động")
        expect(self.page.get_by_role("button", name="Gọi lệnh xuất tại Khu vực chia chọn 2", exact=True)).to_be_disabled()
        expect(self.page.get_by_role("button", name="Gọi lệnh xuất tại Khu vực chia chọn 1", exact=True)).to_be_enabled()
        self.assertEqual(self.auto_writes[0][1]["display_zone_id"], 8)
        self.assertEqual(self.errors, [])

    def test_stopped_cycle_offers_manual_return_without_an_existing_robot_task(self):
        state = self.state(9)
        state["vts"] = [{"location_id": VT_ZONES[9][2], "name": "VT14", "location_status": "has_stock",
                         "cycle_id": 123, "phase": "ready_to_return", "message": "Chờ return",
                         "pick_order_id": "PICK-123", "return_order_id": None, "remaining_quantity": 81}]
        self.open_detail(9)
        expect(self.page.get_by_test_id("outbound-auto-9")).to_have_text("Gọi tự động")
        self.page.get_by_role("button", name="Return", exact=True).click()
        self.assertTrue(self.auto_writes[-1][0].endswith("/cycles/123/return"))
        expect(self.page.get_by_role("button", name="Return", exact=True)).to_have_count(0)
        self.assertEqual(self.errors, [])

    def test_failed_status_read_does_not_enable_manual_dispatch(self):
        self.status_error = True
        self.page.goto(f"{BASE_URL}/export/zone/9")
        control = self.page.get_by_test_id("outbound-auto-9")
        button = control.get_by_role("button", name=re.compile("Gọi tự động$"))
        expect(button).to_be_disabled()
        expect(button).to_have_attribute("title", "Chưa đọc được trạng thái tự động")
        expect(control).to_have_text("Gọi tự động")
        expect(self.page.get_by_role("button", name=re.compile("Gọi lệnh$"))).to_be_disabled()
        self.assertEqual(self.auto_writes, [])

    def test_loading_status_shows_only_disabled_button(self):
        pending = []
        self.page.route("**/auto-dispatch/status**", lambda route: pending.append(route))
        self.page.goto(f"{BASE_URL}/export/zone/9")
        control = self.page.get_by_test_id("outbound-auto-9")
        button = control.get_by_role("button", name=re.compile("Gọi tự động$"))
        expect(button).to_be_disabled()
        expect(button).to_have_attribute("title", "Chưa đọc được trạng thái tự động")
        expect(control).to_have_text("Gọi tự động")
        self.assertTrue(pending)
        for route in pending:
            query = parse_qs(urlparse(route.request.url).query)
            route.fulfill(json=self.state(int(query["display_zone_id"][0])))
        self.page.unroute("**/auto-dispatch/status**")
        expect(button).to_be_enabled()
        expect(control).to_have_text("Gọi tự động")
        self.assertEqual(self.auto_writes, [])

    def test_shared_service_cycle_uses_existing_return_row_without_duplicate_button(self):
        state = self.state(9)
        state["vts"] = [{"location_id": VT_ZONES[9][2], "name": "VT14", "location_status": "reserved",
            "cycle_id": 123, "execution_mode": "manual_services", "phase": "ready_to_return",
            "message": "Chờ điều kiện return thủ công", "pick_order_id": "PICK-123",
            "return_order_id": "TDS_Return_378f2e81", "remaining_quantity": 5}]
        self.open_detail(9)
        expect(self.page.get_by_role("button", name="Return", exact=True)).to_have_count(0)
        expect(self.page.get_by_role("button", name=re.compile("Execute$"))).to_have_count(1)
        expect(self.page.get_by_test_id("outbound-auto-status-9")).to_contain_text("Chờ điều kiện return thủ công")
        expect(self.page.get_by_role("button", name=re.compile("Execute$"))).to_be_enabled()
        self.page.get_by_role("button", name=re.compile("Execute$")).click()
        self.assertTrue(self.auto_writes[-1][0].endswith('/cycles/123/return'))

    def legacy_candidate(self):
        candidate={"task_id":500,"order_id":"TDS_Return_legacy","location_id":VT_ZONES[9][2],
            "name":"VT14","quantity":8,"state":"awaiting_verification",
            "message":"Return cũ chưa có lịch sử gửi; cần xác nhận chưa gửi ICS",
            "can_verify":True,"business_ready":True}
        self.state(9)['return_candidates']=[candidate]
        return candidate

    def test_legacy_verification_requires_note_and_does_not_execute_return(self):
        self.legacy_candidate()
        self.page.goto(f"{BASE_URL}/export/zone/9")
        self.page.get_by_role('button',name='Xác nhận chưa gửi ICS',exact=True).click()
        dialog=self.page.get_by_role('dialog',name='Xác nhận chưa gửi ICS')
        expect(dialog.get_by_role('button',name='Xác nhận chưa gửi',exact=True)).to_be_disabled()
        dialog.get_by_role('textbox',name='Ghi chú đối soát ICS').fill('Đã đối chiếu ICS, chưa nhận mã lệnh')
        dialog.get_by_role('button',name='Xác nhận chưa gửi',exact=True).click()
        expect(dialog).not_to_be_visible()
        expect(self.page.get_by_test_id('return-candidate-500')).to_contain_text('Return đủ điều kiện tiếp quản')
        self.assertEqual(len(self.auto_writes),1)
        path,body=self.auto_writes[0]
        self.assertTrue(path.endswith('/returns/500/verify-unsent'))
        self.assertEqual(body,{'warehouse_id':1,'display_zone_id':9,'note':'Đã đối chiếu ICS, chưa nhận mã lệnh'})
        self.page.reload()
        expect(self.page.get_by_role('button',name='Xác nhận chưa gửi ICS',exact=True)).to_have_count(0)
        self.assertEqual(self.errors,[])

    def test_running_zone_shows_legacy_reason_and_requires_stop_before_verification(self):
        self.legacy_candidate()
        self.state(9).update(enabled=True,state='waiting',message='Chờ đối soát')
        self.page.goto(f"{BASE_URL}/export/zone/9")
        row=self.page.get_by_test_id('return-candidate-500')
        expect(row).to_contain_text('Dừng tự động để đối soát lệnh này')
        expect(row.get_by_role('button',name='Xác nhận chưa gửi ICS')).to_have_count(0)
        self.assertEqual(self.auto_writes,[])

    def test_verification_conflict_keeps_dialog_and_does_not_execute(self):
        self.legacy_candidate(); self.verify_error=True
        self.page.goto(f"{BASE_URL}/export/zone/9")
        self.page.get_by_role('button',name='Xác nhận chưa gửi ICS',exact=True).click()
        dialog=self.page.get_by_role('dialog',name='Xác nhận chưa gửi ICS')
        dialog.get_by_role('textbox',name='Ghi chú đối soát ICS').fill('Đã kiểm tra ICS')
        dialog.get_by_role('button',name='Xác nhận chưa gửi',exact=True).click()
        expect(self.page.get_by_text('Lệnh đã có callback; không thể xác nhận',exact=True)).to_be_visible()
        expect(dialog).to_be_visible()
        self.assertEqual(len(self.auto_writes),1)

    def test_adopted_cycle_uses_one_existing_execute_after_stop(self):
        self.state(9)['vts']=[{"location_id":VT_ZONES[9][2],"name":"VT14","location_status":"reserved",
            "cycle_id":124,"execution_mode":"adopted_return","phase":"ready_to_return",
            "message":"Đã tiếp quản return thủ công","pick_order_id":None,
            "return_order_id":"TDS_Return_378f2e81","remaining_quantity":5}]
        self.open_detail(9)
        expect(self.page.get_by_role('button',name='Return',exact=True)).to_have_count(0)
        expect(self.page.get_by_role('button',name=re.compile('Execute$'))).to_have_count(1)
        expect(self.page.get_by_test_id('outbound-auto-status-9')).to_contain_text('tiếp quản return')
        self.page.get_by_role('button',name=re.compile('Execute$')).click()
        self.assertTrue(self.auto_writes[-1][0].endswith('/cycles/124/return'))
        self.assertEqual(self.errors,[])

    def test_pending_condition_is_visible_without_verification_action(self):
        candidate=self.legacy_candidate()
        candidate.update(state='waiting_conditions',message='Chờ allocation cùng detail hoàn tất',can_verify=False,business_ready=False)
        self.page.goto(f"{BASE_URL}/export/zone/9")
        expect(self.page.get_by_test_id('return-candidate-500')).to_contain_text('Chờ allocation cùng detail hoàn tất')
        expect(self.page.get_by_role('button',name='Xác nhận chưa gửi ICS',exact=True)).to_have_count(0)


if __name__ == "__main__":
    import unittest
    unittest.main()
