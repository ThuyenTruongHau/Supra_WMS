"""Inbound controls in a real browser; every API/WS request is intercepted."""
import copy
import json
import os
import re
import unittest
from urllib.parse import urlparse

from playwright.sync_api import expect
import outboundReturnBrowser as fixture

BASE_URL = os.environ.get("INBOUND_BROWSER_BASE_URL", "https://127.0.0.1:5187")


class InboundDispatchBrowserTests(unittest.TestCase):
    setUpClass = classmethod(fixture.OutboundReturnBrowserTests.setUpClass.__func__)
    tearDownClass = classmethod(fixture.OutboundReturnBrowserTests.tearDownClass.__func__)

    def setUp(self):
        self.state = {"warehouse_id": 1, "enabled": True, "state": "idle", "batch_id": None,
                      "batch_code": None, "waiting_count": 0, "issued_count": 0, "review_count": 0,
                      "assign_robot_id": None, "sorting_persons": None, "changed_by_id": None,
                      "changed_at": None, "message": None, "problems": []}
        self.writes = []
        self.fail_status = False
        fixture.OutboundReturnBrowserTests.setUp(self)
        self.context.add_init_script("localStorage.setItem('operator-assignee-store', " + json.dumps(json.dumps({
            "state": {"inboundByWarehouseId": {"1": "browser-test"}, "outboundByDisplayZoneId": {}}, "version": 0
        })) + ");")

    def mock_api(self, route):
        path = urlparse(route.request.url).path
        if "/masan/inbound-orders/auto-dispatch/" in path:
            if route.request.method == "GET":
                if self.fail_status:
                    return route.fulfill(status=503, json={"detail": "Test status unavailable"})
                return route.fulfill(json=copy.deepcopy(self.state))
            self.writes.append((path, copy.deepcopy(route.request.post_data_json)))
            if path.endswith("/pause"):
                self.state.update(enabled=False, state="paused")
            elif path.endswith("/resume"):
                self.state.update(enabled=True, state="running")
            elif path.endswith("/verify-unsent"):
                self.state.update(review_count=0, problems=[])
            else:
                return route.fulfill(status=405)
            return route.fulfill(json=copy.deepcopy(self.state))
        if path.endswith("/inbound-orders/assigned-details"):
            return route.fulfill(json={"order_ids": [], "details": []})
        if path.endswith("/auth/staff-usernames"):
            return route.fulfill(json=["browser-test"])
        return fixture.OutboundReturnBrowserTests.mock_api(self, route)

    def open(self, page=None):
        page = page or self.page
        page.goto(f"{BASE_URL}/import")
        page.mouse.move(0, 0)
        control = page.get_by_test_id("inbound-dispatch-control")
        expect(control).to_be_visible()
        return control

    def details(self, page=None):
        page = page or self.page
        page.get_by_test_id("inbound-dispatch-control").hover()
        details = page.get_by_test_id("inbound-dispatch-details")
        expect(details).to_be_visible()
        return details

    def test_pause_resume_persists_on_reload_and_blocks_both_call_buttons(self):
        self.state.update(batch_id=42, batch_code="INB-OLD", waiting_count=18, issued_count=2, sorting_persons="original-person")
        self.state["message"] = "Đã chuyển hàng đợi nhập cũ; bấm Tiếp tục sau khi đối chiếu lệnh đã phát"
        control = self.open()
        expect(self.page.get_by_test_id("inbound-dispatch-details")).to_be_hidden()
        qr = self.page.get_by_role("button", name=re.compile("Quét QR gán ô"))
        button_box, qr_box = control.bounding_box(), qr.bounding_box()
        self.assertLessEqual(button_box["x"] + button_box["width"], qr_box["x"])
        self.assertAlmostEqual(button_box["y"], qr_box["y"], delta=1)
        control.get_by_role("button", name="Dừng phiên", exact=True).click()
        details = self.details()
        expect(details).to_contain_text("Đã ngừng gửi nhập")
        expect(details).to_contain_text("2 lệnh nhập đã phát, 18 lệnh chờ")
        expect(details).to_contain_text(self.state["message"])
        self.page.mouse.move(0, 0)
        expect(details).to_be_hidden()
        expect(self.page.get_by_role("button", name=re.compile(r"Gọi robot nhập"))).to_be_disabled()
        expect(self.page.get_by_role("button").filter(has_text=re.compile(r"^Gọi robot\s*$"))).to_be_disabled()
        self.page.reload()
        expect(control.get_by_role("button", name="Tiếp tục phiên", exact=True)).to_be_visible()
        control.get_by_role("button", name="Tiếp tục phiên", exact=True).click()
        expect(self.details()).to_contain_text("Đang cho phép gửi nhập")
        expect(self.details()).to_contain_text("original-person")
        self.assertEqual([body for _, body in self.writes], [{"warehouse_id": 1}, {"warehouse_id": 1}])
        self.assertEqual(self.errors, [])

    def test_other_tab_observes_pause_through_polling(self):
        first = self.open()
        second_page = self.context.new_page()
        second = self.open(second_page)
        first.get_by_role("button", name="Dừng phiên", exact=True).click()
        expect(second.get_by_role("button", name="Tiếp tục phiên", exact=True)).to_be_visible(timeout=8000)
        expect(self.details(second_page)).to_contain_text("Đã ngừng gửi nhập")
        self.assertEqual(len(self.writes), 1)

    def test_unknown_order_is_visible_and_requires_explicit_note_to_verify(self):
        self.state.update(enabled=False, state="needs_review", review_count=1, problems=[{
            "command_id": 5, "order_id": "TDS_Inbound_UNKNOWN", "detail_id": 10, "state": "unknown", "message": "RCS timeout"
        }])
        control = self.open()
        details = self.details()
        expect(details).to_contain_text("TDS_Inbound_UNKNOWN")
        expect(control.get_by_role("button", name="Tiếp tục phiên", exact=True)).to_be_disabled()
        details.get_by_role("button", name="Xác minh RCS chưa nhận lệnh", exact=True).click()
        dialog = self.page.get_by_role("dialog")
        expect(dialog.get_by_role("button", name="Xác nhận chưa gửi", exact=True)).to_be_disabled()
        dialog.get_by_placeholder("Ghi nhận kết quả đối soát trên RCS").fill("Checked RCS order: absent")
        dialog.get_by_role("button", name="Xác nhận chưa gửi", exact=True).click()
        expect(control.get_by_role("button", name="Tiếp tục phiên", exact=True)).to_be_enabled()
        self.assertEqual(self.writes[0][1]["note"], "Checked RCS order: absent")

    def test_status_failure_keeps_sending_controls_disabled(self):
        self.fail_status = True
        control = self.open()
        expect(self.details()).to_contain_text("Chưa đọc được trạng thái gửi nhập")
        expect(self.page.get_by_role("button", name=re.compile(r"Gọi robot nhập"))).to_be_disabled()
        self.assertEqual(self.writes, [])


if __name__ == "__main__":
    unittest.main()
