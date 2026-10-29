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

    def expand_status(self, display_id=9):
        self.page.get_by_test_id(f"outbound-auto-toggle-{display_id}").click()
        expect(self.page.get_by_test_id(f"outbound-auto-details-{display_id}")).to_be_visible()

    def open_detail_with_status(self, display_id=9):
        self.page.goto(f"{BASE_URL}/export/zone/{display_id}")
        self.expand_status(display_id)
        self.page.get_by_role("button", name=re.compile(r"Gọi lệnh$")).click()
        self.page.get_by_role("button", name=re.compile(VT_ZONES[display_id][1])).click()

    def seed_status(self, display_id=9, count=2):
        state = self.state(display_id)
        state.update(enabled=True, state="waiting", message="Chờ chia chọn")
        state["vts"] = [{
            "location_id": VT_ZONES[display_id][2] + index,
            "name": f"VT{index + 1:02d}", "location_status": "reserved",
            "cycle_id": 123 + index, "phase": "supplying",
            "message": "Đang cấp hàng về vị trí chia chọn",
            "pick_order_id": f"PICK-{index}", "return_order_id": f"RETURN-{index}",
            "remaining_quantity": 5,
        } for index in range(count)]
        return state

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
        self.open_detail_with_status(9)
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
        self.expand_status()
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
        self.expand_status()
        expect(self.page.get_by_role('button',name='Xác nhận chưa gửi ICS',exact=True)).to_have_count(0)
        self.assertEqual(self.errors,[])

    def test_running_zone_shows_legacy_reason_and_requires_stop_before_verification(self):
        self.legacy_candidate()
        self.state(9).update(enabled=True,state='waiting',message='Chờ đối soát')
        self.page.goto(f"{BASE_URL}/export/zone/9")
        self.expand_status()
        row=self.page.get_by_test_id('return-candidate-500')
        expect(row).to_contain_text('Dừng tự động để đối soát lệnh này')
        expect(row.get_by_role('button',name='Xác nhận chưa gửi ICS')).to_have_count(0)
        self.assertEqual(self.auto_writes,[])

    def test_verification_conflict_keeps_dialog_and_does_not_execute(self):
        self.legacy_candidate(); self.verify_error=True
        self.page.goto(f"{BASE_URL}/export/zone/9")
        self.expand_status()
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
        self.open_detail_with_status(9)
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
        self.expand_status()
        expect(self.page.get_by_test_id('return-candidate-500')).to_contain_text('Chờ allocation cùng detail hoàn tất')
        expect(self.page.get_by_role('button',name='Xác nhận chưa gửi ICS',exact=True)).to_have_count(0)

    def test_status_toggle_supports_keyboard_and_preserves_state_during_polling(self):
        state = self.seed_status()
        self.page.goto(f"{BASE_URL}/export/zone/9")
        status = self.page.get_by_test_id("outbound-auto-status-9")
        toggle = self.page.get_by_test_id("outbound-auto-toggle-9")
        details = self.page.get_by_test_id("outbound-auto-details-9")
        expect(toggle).to_have_attribute("aria-expanded", "false")
        expect(toggle).to_have_attribute("title", "Hiện thông tin VT")
        expect(details).to_be_hidden()
        expect(toggle).to_have_text("▶")
        bounds = toggle.bounding_box()
        self.assertGreaterEqual(bounds["width"], 40)
        self.assertGreaterEqual(bounds["height"], 40)
        toggle.focus()
        toggle.press("Enter")
        expect(toggle).to_have_attribute("aria-expanded", "true")
        expect(toggle).to_have_attribute("title", "Ẩn thông tin VT")
        expect(toggle).to_have_text("▼")
        expect(details).to_be_visible()
        expect(details).to_contain_text("VT01 · Đang cấp hàng")
        expect(details.locator('[title="PICK-0 · RETURN-0"]')).to_be_visible()
        state["vts"][0].update(phase="awaiting_confirmation", message="Đã cập nhật lượt mới")
        expect(details).to_contain_text("Đã cập nhật lượt mới", timeout=15000)
        expect(toggle).to_have_attribute("aria-expanded", "true")
        toggle.press("Space")
        expect(details).to_be_hidden()
        state.update(state="error", message="Cần đối soát mới")
        expect(details).to_contain_text("Cần đối soát mới", timeout=15000)
        expect(toggle).to_have_attribute("aria-expanded", "false")
        self.assertEqual(self.auto_writes, [])
        self.assertEqual(self.errors, [])

    def test_overview_status_expands_independently_and_resets_on_navigation(self):
        self.seed_status(8)
        self.seed_status(9)
        self.page.goto(f"{BASE_URL}/export")
        self.expand_status(8)
        expect(self.page.get_by_test_id("outbound-auto-details-9")).to_be_hidden()
        self.expand_status(9)
        self.page.get_by_test_id("outbound-auto-toggle-8").click()
        expect(self.page.get_by_test_id("outbound-auto-details-8")).to_be_hidden()
        expect(self.page.get_by_test_id("outbound-auto-details-9")).to_be_visible()
        # The map wrapper already supports double-click navigation to zone detail.
        card = self.page.get_by_test_id("outbound-auto-status-9").locator("../..")
        card.locator(":scope > div").last.dblclick(position={"x": 20, "y": 20})
        expect(self.page).to_have_url(f"{BASE_URL}/export/zone/9")
        expect(self.page.get_by_test_id("outbound-auto-details-9")).to_be_hidden()
        self.expand_status(9)
        self.page.get_by_role("button", name=re.compile("Chọn vị trí$")).click()
        expect(self.page).to_have_url(f"{BASE_URL}/export")
        expect(self.page.get_by_test_id("outbound-auto-details-9")).to_be_hidden()
        self.assertEqual(self.auto_writes, [])
        self.assertEqual(self.errors, [])

    def test_status_is_absent_when_no_displayable_information(self):
        for path in ("/export", "/export/zone/9"):
            with self.subTest(path=path):
                self.page.goto(f"{BASE_URL}{path}")
                expect(self.page.get_by_test_id("outbound-auto-9").get_by_role("button")).to_be_enabled()
                expect(self.page.get_by_test_id("outbound-auto-status-9")).to_have_count(0)
                expect(self.page.get_by_test_id("outbound-auto-toggle-9")).to_have_count(0)
                expect(self.page.get_by_test_id("outbound-auto-separator-9")).to_have_count(0)
        self.assertEqual(self.auto_writes, [])

    def test_long_status_scrolls_without_horizontal_overflow_or_hiding_map(self):
        state = self.seed_status(count=10)
        state["vts"][0]["message"] = "Thông báo rất dài " * 30 + "ORDER_" + "X" * 300
        for width, height in ((1440, 1000), (1024, 768)):
            self.page.set_viewport_size({"width": width, "height": height})
            for path in ("/export", "/export/zone/9"):
                with self.subTest(width=width, path=path):
                    self.page.goto(f"{BASE_URL}{path}")
                    status = self.page.get_by_test_id("outbound-auto-status-9")
                    expect(status).to_be_visible()
                    auto_button = self.page.get_by_test_id("outbound-auto-9").get_by_role("button").bounding_box()
                    toggle_button = self.page.get_by_test_id("outbound-auto-toggle-9")
                    toggle = toggle_button.bounding_box()
                    self.assertAlmostEqual(toggle["y"] + toggle["height"] / 2, auto_button["y"] + auto_button["height"] / 2, delta=1)
                    self.assertGreaterEqual(toggle["x"] - auto_button["x"] - auto_button["width"], 16)
                    self.assertAlmostEqual(toggle["width"], 40, delta=1)
                    self.assertAlmostEqual(toggle["height"], 40, delta=1)
                    if path == "/export":
                        map_area = status.locator("../..").locator(":scope > div").last
                    else:
                        map_area = status.locator("../../..").locator(":scope > div").last
                    before = map_area.bounding_box()
                    self.expand_status()
                    details = self.page.get_by_test_id("outbound-auto-details-9")
                    self.assertAlmostEqual(details.bounding_box()["width"], status.bounding_box()["width"], delta=1)
                    toolbar = status.locator(":scope > div").first.bounding_box()
                    self.assertGreaterEqual(details.bounding_box()["y"], toolbar["y"] + toolbar["height"])
                    size = details.evaluate("el => ({height: el.clientHeight, scrollHeight: el.scrollHeight, width: el.clientWidth, scrollWidth: el.scrollWidth})")
                    self.assertLessEqual(size["height"], 240)
                    self.assertGreater(size["scrollHeight"], size["height"])
                    self.assertLessEqual(size["scrollWidth"], size["width"] + 1)
                    after = map_area.bounding_box()
                    self.assertGreater(after["height"], 0)
                    self.assertLess(after["height"], before["height"])
                    self.assertLess(after["y"], height)
                    toggle_button.click()
                    expect(details).to_be_hidden()
                    self.assertAlmostEqual(map_area.bounding_box()["height"], before["height"], delta=1)
        self.assertEqual(self.auto_writes, [])
        self.assertEqual(self.errors, [])

    def test_status_gap_and_divider_do_not_trigger_automatic_commands(self):
        state = self.seed_status()
        for enabled in (False, True):
            state["enabled"] = enabled
            for path in ("/export", "/export/zone/9"):
                with self.subTest(enabled=enabled, path=path):
                    self.page.goto(f"{BASE_URL}{path}")
                    toggle = self.page.get_by_test_id("outbound-auto-toggle-9")
                    expect(toggle).to_be_visible()
                    auto = self.page.get_by_test_id("outbound-auto-9").get_by_role("button")
                    auto_bounds = auto.bounding_box()
                    toggle_bounds = toggle.bounding_box()
                    gap_start = auto_bounds["x"] + auto_bounds["width"]
                    gap_end = toggle_bounds["x"]
                    middle_y = toggle_bounds["y"] + toggle_bounds["height"] / 2
                    separator = self.page.get_by_test_id("outbound-auto-separator-9").bounding_box()
                    for x in (gap_start + 3, separator["x"] + 0.5, gap_end - 3):
                        self.page.mouse.click(x, middle_y)
                        expect(toggle).to_have_attribute("aria-expanded", "false")
                    toggle.click()
                    expect(toggle).to_have_attribute("aria-expanded", "true")
                    expect(auto).to_have_text("Dừng tự động" if enabled else "Gọi tự động")
                    self.assertEqual(self.auto_writes, [])
        self.assertEqual(self.errors, [])


if __name__ == "__main__":
    import unittest
    unittest.main()
