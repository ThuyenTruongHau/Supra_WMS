"""Report UI regression. Preview must be running; all API/WS traffic is mocked.

Run: backend/.venv/Scripts/python.exe frontend/tests/robotPerformanceBrowser.py -v
Override ROBOT_REPORT_BROWSER_URL when preview runs on another port.
"""

import copy
import json
import os
import unittest
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

BASE_URL = os.environ.get("ROBOT_REPORT_BROWSER_URL", "https://127.0.0.1:4178")
WAREHOUSES = [{"id": ident, "code": f"W{ident}", "name": f"Kho {ident}"} for ident in (1, 2)]
USER = {
    "id": 1, "username": "report-test", "roles": [{"id": 1, "name": "admin"}],
    "is_active": True, "warehouses": WAREHOUSES,
    "access": {"is_admin": True, "warehouse_scope": "all", "warehouses": WAREHOUSES,
               "modules": ["inbound", "outbound", "stocktake"]},
}
METRICS = dict(
    inbound_completed=1, outbound_completed=1, return_completed=0, completed_count=2,
    failed_count=1, cancelled_count=0, distance_m=180, inbound_distance_m=60,
    outbound_distance_m=120, return_distance_m=None, distance_count=2,
    duration_seconds=180, speed_distance_m=180, speed_eligible_count=2,
    average_speed_mps=1, speed_coverage_percent=100,
)


class RobotPerformanceBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True, args=["--disable-logging"])

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context(ignore_https_errors=True, viewport={"width": 1440, "height": 1000})
        self.addCleanup(self.context.close)
        self.mode = "normal"
        self.calls = []
        self.context.route("**/api/v1/**", self.api)
        self.context.route("**/task/**", lambda route: route.abort())
        self.context.route_web_socket("**/api/v1/**", lambda socket: None)
        self.context.add_init_script(
            "localStorage.setItem('access_token', 'isolated-report-test');"
            "localStorage.setItem('user_data', " + json.dumps(json.dumps(USER)) + ");"
        )
        self.page = self.context.new_page()
        self.page.set_default_timeout(12000)
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def api(self, route):
        url = urlparse(route.request.url)
        query = parse_qs(url.query)
        self.calls.append((route.request.method, url.path, query))
        if route.request.method != "GET":
            route.fulfill(status=405, json={"detail": "Writes forbidden in UI regression"})
            return
        data = {"items": [], "total": 0}
        if url.path.endswith("/report-robot-performance"):
            if self.mode == "error":
                route.fulfill(status=500, json={"detail": "Lỗi báo cáo giả lập"})
                return
            metrics = copy.deepcopy(METRICS)
            if self.mode == "missing":
                metrics.update(distance_m=None, inbound_distance_m=None, outbound_distance_m=None,
                               distance_count=0, duration_seconds=0, speed_distance_m=0,
                               speed_eligible_count=0, average_speed_mps=None, speed_coverage_percent=0)
            if self.mode == "empty":
                metrics.update({key: None if value is None or key.endswith("distance_m") or key in (
                    "distance_m", "average_speed_mps", "speed_coverage_percent",
                ) else 0 for key, value in metrics.items()})
            robots = [] if self.mode == "empty" else [{"device_num": "R1", **metrics}]
            start, end = query["start_date"][0], query["end_date"][0]
            data = dict(start_date=start, end_date=end, timezone="Asia/Ho_Chi_Minh",
                        granularity="hour" if start == end else "day", devices=["R1", "R2"],
                        summary=metrics, robots=robots, points=[dict(
                            label="08:00", period_start=f"{start}T08:00:00+07:00",
                            robots=robots, **metrics,
                        )])
        elif url.path.endswith("/report-kpis"):
            data = dict(total_inbound_orders=10, total_outbound_orders=20,
                        total_inventory_value=0, unsolved_notifications=0)
        elif url.path.endswith("/report-trends"):
            data = dict(granularity="day", points=[])
        elif url.path.endswith("/report-top-products"):
            data = dict(period="week", inbound_top=[], outbound_top=[], stock_top=[])
        elif url.path.endswith("/report-stock-aging"):
            data = dict(longest_holding=[], buckets=[])
        elif url.path.endswith("/warehouses"):
            data = {"items": WAREHOUSES, "total": len(WAREHOUSES), "page": 1, "page_size": 100}
        route.fulfill(status=200, json=data)

    def open_report(self):
        self.page.goto(f"{BASE_URL}/report")
        return self.page.get_by_role("region", name="Hiệu suất robot")

    def test_charts_table_filters_and_warehouse(self):
        section = self.open_report()
        expect(section.get_by_role("heading", name="Lệnh hoàn thành theo thời gian")).to_be_visible()
        expect(section.get_by_role("heading", name="Quãng đường ghi nhận theo robot (m)")).to_be_visible()
        expect(section.get_by_role("heading", name="Tốc độ trung bình theo lệnh (m/s)")).to_be_visible()
        expect(section.get_by_role("row").filter(has_text="R1")).to_contain_text("2/2 (100%)")
        self.assertEqual(section.locator(".recharts-wrapper").count(), 3)
        section.get_by_text("Hôm nay", exact=True).click()
        expect(section.get_by_role("row").filter(has_text="R1")).to_be_visible()
        section.get_by_role("combobox", name="Lọc robot").click()
        self.page.get_by_title("R1", exact=True).last.click()
        section.get_by_role("combobox", name="Loại lệnh robot").click()
        self.page.get_by_title("Xuất ra VT", exact=True).last.click()
        expect(section.get_by_role("row").filter(has_text="R1")).to_be_visible()
        queries = [q for _, path, q in self.calls if path.endswith("/report-robot-performance")]
        self.assertEqual(queries[-1]["device_num"], ["R1"])
        self.assertEqual(queries[-1]["task_kind"], ["outbound"])
        self.assertEqual(queries[-1]["start_date"], queries[-1]["end_date"])
        self.page.get_by_text("Kho hiện tại", exact=True).click()
        self.page.get_by_role("button", name="Kho 2", exact=True).click()
        expect(section.get_by_role("row").filter(has_text="R1")).to_be_visible()
        queries = [q for _, path, q in self.calls if path.endswith("/report-robot-performance")]
        self.assertEqual(queries[-1]["warehouse_id"], ["2"])
        self.assertNotIn("device_num", queries[-1])
        self.assertNotIn("task_kind", queries[-1])
        self.assertFalse(self.errors)

    def test_missing_empty_error_and_retry(self):
        self.mode = "missing"
        section = self.open_report()
        expect(section.get_by_text("Chưa đủ dữ liệu quãng đường.", exact=True)).to_be_visible()
        expect(section.get_by_text("Chưa đủ dữ liệu tốc độ cho robot xác định được.", exact=True)).to_be_visible()
        self.mode = "empty"
        section.get_by_text("Hôm nay", exact=True).click()
        expect(section.get_by_text("Không có lệnh robot kết thúc trong kỳ và bộ lọc đã chọn.", exact=True)).to_be_visible()
        self.mode = "error"
        section.get_by_text("7 ngày gần nhất", exact=True).click()
        expect(section.get_by_role("alert")).to_contain_text("Lỗi báo cáo giả lập", timeout=20000)
        self.mode = "normal"
        section.get_by_role("button", name="Thử lại").click()
        expect(section.get_by_role("row").filter(has_text="R1")).to_be_visible()
        section.get_by_text("Khoảng ngày", exact=True).click()
        expect(section.get_by_text("Vui lòng chọn khoảng ngày báo cáo.", exact=True)).to_be_visible()
        section.get_by_placeholder("Từ ngày").fill("20/10/2026")
        section.get_by_placeholder("Từ ngày").press("Tab")
        section.get_by_placeholder("Đến ngày").fill("23/10/2026")
        section.get_by_placeholder("Đến ngày").press("Enter")
        expect(section.get_by_role("row").filter(has_text="R1")).to_be_visible()
        queries = [q for _, path, q in self.calls if path.endswith("/report-robot-performance")]
        self.assertEqual(queries[-1]["start_date"], ["2026-10-20"])
        self.assertEqual(queries[-1]["end_date"], ["2026-10-23"])
        self.assertFalse(self.errors)


if __name__ == "__main__":
    unittest.main()
