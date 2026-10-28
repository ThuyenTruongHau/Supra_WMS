"""Browser regression with mocked API/WS; never sends commands to a real backend.

Start Vite, then from repo root run:
backend/.venv/Scripts/python.exe frontend/tests/outboundReturnBrowser.py -v
Requires the backend Playwright dependency and its Chromium installation.
"""

import json
import os
import re
import unittest
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ.get("OUTBOUND_BROWSER_BASE_URL", "https://localhost:5173")
# Snapshot of the actual DB mapping on 21/10/2026. IDs and codes are not ordinal pairs.
VT_ZONES = {9: ("Zone_sorting_2", "VT14", 3446), 8: ("Zone_sorting_1", "VT24", 3450)}
WAREHOUSE = {"id": 1, "code": "TEST", "name": "Test warehouse"}
USER = {
    "id": 1, "username": "browser-test", "roles": [{"id": 2, "name": "operator"}],
    "warehouses": [WAREHOUSE], "is_active": True,
    "access": {"is_admin": False, "warehouse_scope": "assigned", "warehouses": [WAREHOUSE],
               "modules": ["inbound", "outbound", "stocktake"]},
}


class OutboundReturnBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context(ignore_https_errors=True, viewport={"width": 1440, "height": 1000})
        self.addCleanup(self.context.close)
        self.calls = []
        self.context.route("**/api/v1/**", self.mock_api)
        self.context.route("**/task/**", lambda route: route.abort())
        # Leave a mocked connection open; never connect it to the real WS server.
        self.context.route_web_socket("**/api/v1/**", lambda ws: None)
        self.context.add_init_script(
            "localStorage.setItem('access_token', 'isolated-browser-test');"
            "localStorage.setItem('user_data', " + json.dumps(json.dumps(USER)) + ");"
            "localStorage.setItem('operator-assignee-store', " + json.dumps(json.dumps({
                "state": {"outboundByDisplayZoneId": {"8": ["browser-test"], "9": ["browser-test"]}}, "version": 0,
            })) + ");"
        )
        self.page = self.context.new_page()
        self.page.set_default_timeout(8000)
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def mock_api(self, route):
        request = route.request
        url = urlparse(request.url)
        query = parse_qs(url.query)
        self.calls.append((request.method, url.path, query))
        if request.method != "GET":
            route.fulfill(status=405, json={"detail": "Test forbids writes"})
            return
        data = {"items": [], "total": 0, "page": 1, "page_size": 20,
                "locations": [], "tasks": [], "allocations": [], "warehouse_id": 1}
        if url.path.endswith("/auto-dispatch/status"):
            data = {"warehouse_id": 1, "display_zone_id": int(query.get("display_zone_id", [9])[0]),
                    "enabled": False, "state": "stopped", "message": "Chưa bật tự động", "vts": []}
        elif ("/outbound-tasks/by-wave/" in url.path
                or url.path.endswith(("/robot_data", "/sorting-waves/"))):
            data = []
        elif url.path.endswith("/incomplete-vehicles"):
            data = {"zone_id": 9, "vehicle_count": 0, "vehicles": []}
        elif url.path.endswith("/sorting-station-fills"):
            data = {"zone_id": 9, "sorting_wave_id": None, "stations": [], "assignment_labels": {}}
        elif url.path.endswith("/warehouses"):
            data = [WAREHOUSE]
        elif "/locations/zones/" in url.path:
            zone_id = int(url.path.split("/zones/")[1].split("/")[0])
            locations = []
            if zone_id in VT_ZONES:
                _, name, identifier = VT_ZONES[zone_id]
                locations = [{"id": identifier, "location_code": "10002603" if zone_id == 9 else "10002624",
                              "location_name": name, "status": "reserved", "item_stock": [],
                              "row": "1", "column": "1", "level": "1", "map_x": 1, "map_y": 1}]
            data = {"warehouse_id": 1, "location_codes": [l["location_code"] for l in locations], "locations": locations}
        elif url.path.endswith("/map-data"):
            route.fulfill(status=404, json={"detail": "Map drawing is outside this regression"})
            return
        elif url.path.endswith("/return-tasks"):
            zone = query.get("zone", [""])[0]
            rows = []
            # Only VT14 has a ready return; an inverted zone must yield an empty list.
            if zone == "Zone_sorting_2":
                rows = [{"outbound_order_id": 32, "task": {
                    "order_id": "TDS_Return_378f2e81", "quantity": 5, "status": "initialize", "task_type": "return",
                    "allocations": [{"id": 640, "outbound_order_detail_id": 723, "item_stock_id": 381,
                                     "quantity": 5, "status": "initialize", "from_location_id": 3446,
                                     "to_location_id": 3052, "from_location_name": "VT14", "to_location_name": "G366"}],
                }}]
            data = {"warehouse_id": 1, "zone": zone, "rows": rows}
        route.fulfill(status=200, json=data)

    def open_detail(self, zone_id=9):
        self.page.goto(f"{BASE_URL}/export/zone/{zone_id}")
        self.page.get_by_role("button", name=re.compile(r"Gọi lệnh$")).click()
        self.page.get_by_role("button", name=re.compile(VT_ZONES[zone_id][1])).click()

    def assert_return_visible(self):
        row = self.page.get_by_role("row").filter(has_text="TDS_Return_378f2e81")
        expect(row).to_be_visible()
        expect(row).to_contain_text("VT14")
        expect(row).to_contain_text("G366")
        expect(row.get_by_role("button", name="Execute")).to_be_enabled()
        queries = [q for method, path, q in self.calls if path.endswith("/return-tasks")]
        self.assertTrue(queries)
        self.assertTrue(all(q.get("zone") == ["Zone_sorting_2"] for q in queries), queries)
        self.assertTrue(all(method == "GET" for method, _, _ in self.calls), self.calls)
        self.assertEqual(self.errors, [])

    def test_detail_vt14_shows_return(self):
        self.open_detail()
        self.assert_return_visible()

    def test_overview_selecting_vt_keeps_return_modal_open(self):
        self.page.goto(f"{BASE_URL}/export")
        self.page.get_by_role("button", name="Gọi lệnh xuất tại Khu vực chia chọn 1", exact=True).click()
        self.page.get_by_role("button", name=re.compile("VT14")).click()
        self.assert_return_visible()

    def test_other_zone_does_not_show_vt14_return(self):
        self.open_detail(8)
        expect(self.page.get_by_text(re.compile("Chưa có pallet dư cần trả về kệ"))).to_be_visible()
        self.assertFalse(self.page.get_by_text("TDS_Return_378f2e81").count())
        queries = [q for _, path, q in self.calls if path.endswith("/return-tasks")]
        self.assertTrue(queries)
        self.assertTrue(all(q.get("zone") == ["Zone_sorting_1"] for q in queries), queries)
        self.assertEqual(self.errors, [])

    def test_tablet_return_button_is_visible(self):
        self.page.set_viewport_size({"width": 1024, "height": 768})
        self.open_detail()
        self.assert_return_visible()
        button = self.page.get_by_role("button", name=re.compile(r"Execute$"))
        button.scroll_into_view_if_needed()
        expect(button).to_be_in_viewport()


if __name__ == "__main__":
    unittest.main()
