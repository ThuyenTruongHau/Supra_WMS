"""Inbound buffer editor in the real /import UI, with every API/WS intercepted.

INBOUND_BROWSER_BASE_URL=https://localhost:5177 backend/.venv/Scripts/python.exe frontend/tests/inboundBufferStockBrowser.py -v
"""
import copy
import json
import os
import re
import unittest
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright
from outboundReturnBrowser import USER, WAREHOUSE

BASE_URL = os.environ.get("INBOUND_BROWSER_BASE_URL", "https://localhost:5177")


class InboundBufferStockBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def setUp(self):
        self.context = self.browser.new_context(ignore_https_errors=True, viewport={"width": 1600, "height": 1000})
        self.addCleanup(self.context.close)
        self.calls, self.writes, self.errors = [], [], []
        self.failure = None
        self.stocks = [{"id": i, "item_id": i, "sku": f"SKU-{i}", "item_name": f"Product {i}",
                        "quantity": str(qty), "lot_number": "01/10/26", "expiry_date": "01/10/2027",
                        "status": "in_transit"} for i, qty in [(1, 100), (2, 20)]]
        self.location = {"id": 101, "location_code": "BUFFER-NODE", "location_name": "BP01",
                         "bin_code": "BP01", "warehouse_id": 1, "zone_id": 2, "is_active": True,
                         "row": "1", "column": "1", "level": "1", "map_x": 0, "map_y": 0}
        self.context.route("**/api/v1/**", self.mock_api)
        self.context.route("**/task/**", lambda route: route.abort())
        self.context.route_web_socket("**/api/v1/**", lambda ws: None)
        self.context.add_init_script(
            "localStorage.setItem('access_token','isolated-browser-test');"
            "localStorage.setItem('user_data'," + json.dumps(json.dumps(USER)) + ");"
            # Capture actual canvas shelf geometry for a real double-click.
            "const clear=CanvasRenderingContext2D.prototype.clearRect;"
            "CanvasRenderingContext2D.prototype.clearRect=function(...args){this.canvas.__cells=[];return clear.apply(this,args)};"
            "const rect=CanvasRenderingContext2D.prototype.roundRect;"
            "CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,...rest){"
            "const p=new DOMPoint(x+w/2,y+h/2).matrixTransform(this.getTransform());"
            "(this.canvas.__cells??=[]).push({x:p.x/devicePixelRatio,y:p.y/devicePixelRatio});"
            "return rect.call(this,x,y,w,h,...rest)};"
        )
        self.page = self.context.new_page()
        self.page.set_default_timeout(10000)
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def mock_api(self, route):
        request = route.request
        url = urlparse(request.url)
        path = url.path
        self.calls.append((request.method, path))
        query = parse_qs(url.query)
        data = {"items": [], "total": 0, "page": 1, "page_size": 100}
        if request.method == "PATCH":
            self.assertRegex(path, r"/item-stocks/[12]$")
            self.assertEqual(query.get("inbound_buffer_location_id"), ["101"])
            body = request.post_data_json
            self.writes.append((path, copy.deepcopy(body)))
            if self.failure:
                if self.failure == 409:
                    self.stocks = []
                    return route.fulfill(status=409, json={"detail": {
                        "code": "inbound_buffer_changed", "message": "Hàng đã rời buffer"}})
                return route.fulfill(status=self.failure, json={"detail": "Không có quyền chỉnh sửa"})
            stock = next(s for s in self.stocks if s["id"] == int(path.rsplit("/", 1)[1]))
            if "quantity" in body:
                stock["quantity"] = str(body["quantity"])
            if "lot_number_from" in body:
                stock["lot_number"] = body["lot_number_from"]
            if "expiry_date" in body:
                stock["expiry_date"] = body["expiry_date"]
            return route.fulfill(json=stock)
        if path.endswith("/assigned-details"):
            data = {"order_ids": [1], "details": []}
        elif path.endswith("/operator-list-summary"):
            data = {"vehicle_count_by_order_id": {"1": 1}}
        elif request.method != "GET":
            return route.fulfill(status=405, json={"detail": "Unexpected write in isolated test"})
        elif path.endswith("/warehouses"):
            data = [WAREHOUSE]
        elif path.endswith("/robot_data"):
            data = []
        elif "/warehouse-maps/zones/" in path:
            zone = int(path.split("/zones/")[1].split("/")[0])
            nodes = [self.location] if zone == 2 else []
            data = {"zone_id": zone, "warehouse_id": 1, "nodes": nodes}
        elif "/locations/zones/" in path:
            zone = int(path.split("/zones/")[1].split("/")[0])
            locations = [{**self.location, "status": "has_stock", "item_stock": self.stocks}] if zone == 2 else []
            data = {"warehouse_id": 1, "locations": locations, "location_codes": [l["location_code"] for l in locations]}
        elif path.endswith("/locations/101/detail"):
            data = {"location": self.location, "item_stock": self.stocks,
                    "summary": {"item_stock_count": len(self.stocks), "total_quantity": "120"}}
        elif path.endswith("/inbound-orders"):
            data["items"] = [{"id": 1, "order_code": "IN-TEST", "warehouse_id": 1, "status": "initialize",
                              "created_at": "2026-10-30T00:00:00", "created_by_id": 1, "details": {}, "note": None}]
        elif path.endswith("/incomplete-vehicles"):
            data = {"order_id": 1, "vehicles": []}
        elif path.endswith("/items"):
            data["items"] = [{"id": i, "sku": f"SKU-{i}", "name": f"Product {i}", "base_unit": "Thùng",
                              "warehouse_id": 1, "is_active": True} for i in [1, 2]]
        route.fulfill(json=data)

    def open_location(self):
        self.page.goto(f"{BASE_URL}/import", wait_until="domcontentloaded", timeout=30000)
        canvas = self.page.locator("canvas").first
        expect(canvas).to_be_visible()
        self.page.wait_for_function("document.querySelector('canvas')?.__cells?.length > 0")
        point = canvas.evaluate("c=>{const r=c.getBoundingClientRect(),p=c.__cells[0];return {x:r.left+p.x,y:r.top+p.y}}")
        self.page.mouse.dblclick(point["x"], point["y"], delay=100)
        self.info = self.page.get_by_role("dialog", name="Thông tin vị trí BP01", exact=True)
        expect(self.info).to_be_visible()
        expect(self.info.get_by_role("button", name="Chỉnh sửa")).to_have_count(2)

    def editor(self, index=0):
        self.info.get_by_role("button", name="Chỉnh sửa").nth(index).click()
        dialog = self.page.get_by_role("dialog", name="Chỉnh sửa hàng tại buffer", exact=True)
        expect(dialog).to_be_visible()
        return dialog

    def test_edit_second_stock_refreshes_and_survives_reload(self):
        self.open_location()
        before = {path: self.calls.count(("GET", path)) for path in [
            "/api/v1/inbound-orders", "/api/v1/locations/zones/2/for-map", "/api/v1/locations/101/detail"]}
        editor = self.editor(1)
        editor.get_by_label("Số lượng", exact=True).fill("12")
        editor.get_by_label("LOT", exact=True).fill("071026")
        editor.get_by_label("Hạn dùng", exact=True).fill("")
        editor.get_by_role("button", name="Lưu", exact=True).click()
        expect(editor).not_to_be_visible()
        self.assertEqual(self.writes, [("/api/v1/item-stocks/2", {
            "quantity": 12, "lot_number_from": "071026", "lot_number_to": "071026", "expiry_date": None})])
        expect(self.info.locator("article").nth(1)).to_contain_text("12")
        for path, count in before.items():
            self.assertGreater(self.calls.count(("GET", path)), count, path)
        self.assertEqual(self.stocks[0]["quantity"], "100")
        self.open_location()
        expect(self.info.locator("article").nth(1)).to_contain_text("12")
        self.assertEqual(self.errors, [])

    def test_zero_and_empty_lot_do_not_send_unchanged_expiry(self):
        self.open_location()
        editor = self.editor()
        editor.get_by_label("Số lượng", exact=True).fill("0")
        editor.get_by_label("LOT", exact=True).fill("")
        editor.get_by_role("button", name="Lưu", exact=True).click()
        expect(editor).not_to_be_visible()
        self.assertEqual(self.writes, [("/api/v1/item-stocks/1", {
            "quantity": 0, "lot_number_from": None, "lot_number_to": None})])

    def test_cancel_and_unchanged_save_do_not_write(self):
        self.open_location()
        editor = self.editor()
        editor.get_by_label("Số lượng", exact=True).fill("90")
        editor.get_by_role("button", name="Hủy", exact=True).click()
        editor = self.editor()
        expect(editor.get_by_label("Số lượng", exact=True)).to_have_value("100")
        editor.get_by_role("button", name="Lưu", exact=True).click()
        expect(editor).not_to_be_visible()
        self.assertEqual(self.writes, [])

    def test_invalid_quantity_and_lot_keep_editor_open(self):
        self.open_location()
        editor = self.editor()
        editor.get_by_label("Số lượng", exact=True).fill("1.5")
        editor.get_by_role("button", name="Lưu", exact=True).click()
        expect(editor.get_by_text("Số lượng phải là số nguyên từ 0 đến 999999999", exact=True)).to_be_visible()
        editor.get_by_label("Số lượng", exact=True).fill("90")
        editor.get_by_label("LOT", exact=True).fill("bad-lot")
        editor.get_by_role("button", name="Lưu", exact=True).click()
        expect(editor.get_by_text(re.compile(r"^LOT không hợp lệ"))).to_be_visible()
        self.assertEqual(self.writes, [])

    def test_moved_stock_closes_editor_and_refreshes_buffer(self):
        self.open_location()
        self.failure = 409
        editor = self.editor()
        editor.get_by_label("Số lượng", exact=True).fill("90")
        editor.get_by_role("button", name="Lưu", exact=True).click()
        expect(editor).not_to_be_visible()
        expect(self.info.get_by_text("Vị trí này chưa có item stock", exact=True)).to_be_visible()

    def test_permission_error_keeps_entered_values(self):
        self.open_location()
        self.failure = 403
        editor = self.editor()
        editor.get_by_label("Số lượng", exact=True).fill("90")
        editor.get_by_role("button", name="Lưu", exact=True).click()
        expect(self.page.get_by_text("Không có quyền chỉnh sửa", exact=True)).to_be_visible()
        expect(editor.get_by_label("Số lượng", exact=True)).to_have_value("90")
        expect(editor.get_by_role("button", name="Lưu", exact=True)).to_be_enabled()


if __name__ == "__main__":
    unittest.main()
