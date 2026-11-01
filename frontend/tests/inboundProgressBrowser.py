"""Overview progress UI; run with a local Vite server on port 5187. All APIs are mocked."""
import copy
import json
import math
import os
import unittest
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect
import robotPerformanceBrowser as fixture
from outboundProgressBrowser import OUTBOUND_ORDER, fulfill_outbound_api_route

BASE_URL = os.environ.get('INBOUND_PROGRESS_BROWSER_URL', 'https://127.0.0.1:5187')
ORDER = dict(id=7, order_code='IN-TEST-007', status='in_progress', warehouse_id=1,
             created_at='2026-10-31T08:30:00+07:00', details={})


def detail(ident, status, item, quantity, vehicle='51C-123.45'):
    return dict(id=ident, status=status, details={'vehicle_no': vehicle},
                allocations=[dict(item_id=item, sku=f'SKU-{item}', item_name=f'Item {item}', quantity=quantity, unit_name='Thùng')])


def _progress_status(status):
    normalized = status.strip().lower().replace('-', '_')
    if normalized in {'initialize', 'pending'}:
        return 'waiting'
    if normalized in {'issued', 'in_progress', 'in_transit', 'receiving', 'partial'}:
        return 'running'
    if normalized == 'completed':
        return 'completed'
    return 'attention'


def _allocation_amount(raw):
    try:
        amount = float(raw)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(amount) or amount <= 0:
        return 0.0
    return amount


def build_progress_payload(details):
    commands = {key: 0 for key in ('waiting', 'running', 'completed', 'attention')}
    quantity = {key: 0 for key in ('waiting', 'running', 'completed', 'attention')}
    vehicles = set()
    items = {}
    for row in details:
        bucket = _progress_status(row['status'])
        commands[bucket] += 1
        vehicle = (row.get('details') or {}).get('vehicle_no')
        if isinstance(vehicle, str) and vehicle.strip():
            vehicles.add(vehicle.strip())
        for allocation in row.get('allocations') or []:
            amount = _allocation_amount(allocation.get('quantity'))
            if amount <= 0:
                continue
            quantity[bucket] += amount
            item_id = allocation.get('item_id')
            sku = (allocation.get('sku') or '').strip()
            if item_id is not None:
                key = f'item:{item_id}'
            elif sku:
                key = f'sku:{sku}'
            else:
                continue
            entry = items.setdefault(key, {
                'item_id': item_id,
                'sku': sku or None,
                'item_name': allocation.get('item_name'),
                'waiting_quantity': 0.0,
                'running_quantity': 0.0,
                'completed_quantity': 0.0,
                'attention_quantity': 0.0,
            })
            entry[f'{bucket}_quantity'] += amount
    item_rows = []
    for entry in items.values():
        total = sum(entry[f'{key}_quantity'] for key in ('waiting', 'running', 'completed', 'attention'))
        completed = entry['completed_quantity']
        percent = round(completed / total * 100) if total else 0
        item_rows.append({
            **entry,
            'total_quantity': total,
            'completion_percent': percent,
        })
    item_rows.sort(key=lambda row: (row.get('sku') or row.get('item_name') or '').casefold())
    return {
        'commands': commands,
        'quantity': quantity,
        'vehicles': sorted(vehicles, key=str.casefold),
        'items': item_rows,
    }


def build_item_details_payload(details, item_id=None, sku=None):
    rows = []
    for row in details:
        line_qty = 0.0
        unit_name = None
        for allocation in row.get('allocations') or []:
            if item_id is not None and allocation.get('item_id') != item_id:
                continue
            if sku is not None and (allocation.get('sku') or '').strip() != sku.strip():
                continue
            amount = _allocation_amount(allocation.get('quantity'))
            if amount <= 0:
                continue
            line_qty += amount
            unit_name = unit_name or allocation.get('unit_name')
        if line_qty <= 0:
            continue
        vehicle = (row.get('details') or {}).get('vehicle_no')
        vehicle_no = vehicle.strip() if isinstance(vehicle, str) and vehicle.strip() else None
        prog = _progress_status(row['status'])
        rows.append({
            'detail_id': row['id'],
            'status': row['status'],
            'progress_status': prog,
            'to_location_code': row.get('to_location_code'),
            'to_location_name': row.get('to_location_name'),
            'vehicle_no': vehicle_no,
            'quantity': line_qty,
            'unit_name': unit_name,
        })
    return rows


class InboundProgressBrowserTests(unittest.TestCase):
    setUpClass = classmethod(fixture.RobotPerformanceBrowserTests.setUpClass.__func__)
    tearDownClass = classmethod(fixture.RobotPerformanceBrowserTests.tearDownClass.__func__)

    def setUp(self):
        self.inbound_mode = 'active'
        self.order = copy.deepcopy(ORDER)
        self.details = [detail(1, 'initialize', 1, 20), detail(2, 'in_progress', 2, 30),
                        detail(3, 'completed', 3, 50), detail(4, 'completed', 1, 10, '51C-678.90')]
        self.outbound_mode = 'active'
        self.outbound_order = copy.deepcopy(OUTBOUND_ORDER)
        self.outbound_details = []
        fixture.RobotPerformanceBrowserTests.setUp(self)
        user = copy.deepcopy(fixture.USER)
        user['access']['is_admin'] = False
        user['roles'] = [{'id': 2, 'name': 'operator'}]
        self.context.add_init_script('localStorage.setItem("user_data", ' + json.dumps(json.dumps(user)) + ');')

    def api(self, route):
        url = urlparse(route.request.url)
        query = parse_qs(url.query)
        if url.path.endswith('/inbound-orders'):
            self.calls.append((route.request.method, url.path, query))
            if self.inbound_mode == 'error':
                return route.fulfill(status=503, json={'detail': 'Test unavailable'})
            status = query.get('status', [''])[0]
            rows = []
            if status == 'in_progress' and self.inbound_mode == 'active':
                rows = [self.order]
            elif status == 'completed' and self.inbound_mode == 'completed':
                rows = [{**self.order, 'status': 'completed'}]
            return route.fulfill(json=dict(items=rows, total=len(rows), page=1, page_size=1, summary={}))
        if url.path.endswith('/progress/item-details') and '/inbound-orders/' in url.path:
            item_id = int(query['item_id'][0]) if query.get('item_id') else None
            sku = query.get('sku', [None])[0]
            payload = build_item_details_payload(self.details, item_id=item_id, sku=sku)
            return route.fulfill(json=payload)
        if url.path.endswith('/progress') and '/inbound-orders/' in url.path:
            return route.fulfill(json=build_progress_payload(self.details))
        outbound = fulfill_outbound_api_route(self, route)
        if outbound is not None:
            return outbound
        return fixture.RobotPerformanceBrowserTests.api(self, route)

    def open_overview(self):
        self.page.goto(f'{BASE_URL}/overview')
        return self.page.get_by_role('region', name='Tiến độ nhập hàng', exact=True)

    def assert_counts(self, panel, waiting, running, completed):
        legend = panel.locator('dl[aria-label="Thống kê tiến độ nhập hàng"]')
        for label, value in [('Chưa thực hiện', waiting), ('Đang thực hiện', running), ('Đã hoàn thành', completed)]:
            expect(legend.locator('div').filter(has_text=label).locator('dd')).to_have_text(str(value))

    def test_active_session_metrics_metadata_layout_and_import_link(self):
        panel = self.open_overview()
        expect(panel.get_by_text('IN-TEST-007', exact=True)).to_be_visible()
        expect(panel.get_by_text('31/10/2026 08:30', exact=True)).to_be_visible()
        expect(panel.get_by_text('51C-123.45', exact=True)).to_be_visible()
        expect(panel.get_by_text('51C-678.90', exact=True)).to_be_visible()
        self.assert_counts(panel, 1, 1, 2)
        expect(panel.get_by_role('img', name='Số lệnh: hoàn thành 2 trên 4, 50%')).to_be_visible()
        panel.get_by_text('Số lượng hàng', exact=True).click()
        expect(panel.get_by_role('img', name='Số lượng hàng: hoàn thành 60 trên 110, 54,55%')).to_be_visible()
        expect(panel.get_by_label('Tiến độ theo mã hàng').get_by_text('SKU-1', exact=True)).to_be_visible()
        expect(panel.get_by_label('33% đã nhập').first).to_be_visible()
        expect(panel.get_by_text('Số mã SKU', exact=True)).to_have_count(0)
        right = self.page.get_by_role('region', name='Tiến độ xuất hàng', exact=True)
        left_box, right_box = panel.bounding_box(), right.bounding_box()
        self.assertAlmostEqual(left_box['y'], right_box['y'], delta=1)
        self.assertAlmostEqual(left_box['width'], right_box['width'], delta=1)
        self.assertLess(left_box['x'], right_box['x'])
        self.assertFalse(any(query.get('status') == ['completed'] for _, path, query in self.calls if path.endswith('/inbound-orders')))
        expect(panel.get_by_role('link', name='Xem nhập hàng')).to_have_attribute('href', '/import')
        self.assertEqual(self.errors, [])

    def test_quantity_item_expand_shows_detail_lines(self):
        panel = self.open_overview()
        panel.get_by_text('Số lượng hàng', exact=True).click()
        panel.get_by_role('button', name='SKU-1, 10 trên 30 hàng').click()
        expect(panel.get_by_role('table', name='Nhóm lệnh theo mã hàng')).to_be_visible()
        expect(panel.get_by_role('columnheader', name='Số lượng', exact=True)).to_be_visible()
        expect(panel.get_by_role('columnheader', name='Vị trí', exact=True)).to_be_visible()
        expect(panel.get_by_role('columnheader', name='Trạng thái', exact=True)).to_be_visible()
        expect(panel.get_by_text('20 Thùng', exact=True)).to_be_visible()
        expect(panel.get_by_text('10 Thùng', exact=True)).to_be_visible()
        panel.get_by_role('button', name='Quay lại danh sách mã hàng').click()
        expect(panel.get_by_label('Tiến độ theo mã hàng')).to_be_visible()

    def test_completed_session_fallback(self):
        self.inbound_mode = 'completed'
        for row in self.details:
            row['status'] = 'completed'
        panel = self.open_overview()
        expect(panel.get_by_text('Phiên hoàn thành gần nhất', exact=True)).to_be_visible()
        self.assert_counts(panel, 0, 0, 4)
        expect(panel.get_by_role('img', name='Số lệnh: hoàn thành 4 trên 4, 100%')).to_be_visible()
        self.assertTrue(any(query.get('status') == ['completed'] for _, path, query in self.calls if path.endswith('/inbound-orders')))
        self.assertEqual(self.errors, [])

    def test_no_eligible_session_is_empty(self):
        self.inbound_mode = 'empty'
        panel = self.open_overview()
        expect(panel.get_by_text('Chưa có phiên đang nhập hoặc đã hoàn thành')).to_be_visible()
        expect(panel.locator('.recharts-wrapper')).to_have_count(0)
        expect(panel.get_by_role('link', name='Xem nhập hàng')).to_be_visible()

    def test_polling_updates_progress(self):
        self.page.clock.install()
        panel = self.open_overview()
        self.assert_counts(panel, 1, 1, 2)
        self.details[0]['status'] = 'completed'
        self.page.clock.fast_forward(5_500)
        self.assert_counts(panel, 0, 1, 3)
        self.assertEqual(self.errors, [])

    def test_refresh_switches_sessions_without_reusing_previous_details(self):
        panel = self.open_overview()
        self.assert_counts(panel, 1, 1, 2)
        self.order = {**self.order, 'id': 8, 'order_code': 'IN-TEST-008'}
        self.details = [detail(8, 'in_progress', 8, 5)]
        panel.get_by_role('button', name='Làm mới tiến độ nhập hàng').click()
        expect(panel.get_by_text('IN-TEST-008', exact=True)).to_be_visible()
        self.assert_counts(panel, 0, 1, 0)

    def test_error_and_retry(self):
        self.inbound_mode = 'error'
        panel = self.open_overview()
        expect(panel.get_by_text('Không thể tải tiến độ nhập hàng')).to_be_visible(timeout=20_000)
        self.inbound_mode = 'active'
        panel.get_by_role('button', name='Thử lại').click()
        self.assert_counts(panel, 1, 1, 2)

    def test_tablet_has_no_progress_panel_overflow(self):
        self.page.set_viewport_size({'width': 1024, 'height': 768})
        panel = self.open_overview()
        expect(panel.get_by_text('IN-TEST-007', exact=True)).to_be_visible()
        self.assertTrue(panel.evaluate('(element) => element.scrollWidth <= element.clientWidth'))
        self.assertEqual(self.errors, [])


if __name__ == '__main__':
    unittest.main()
