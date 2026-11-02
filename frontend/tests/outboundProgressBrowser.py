"""Outbound Control Tower progress UI; run with local Vite on port 5187. APIs mocked."""
import copy
import json
import os
import unittest
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect
import robotPerformanceBrowser as fixture

BASE_URL = os.environ.get('OUTBOUND_PROGRESS_BROWSER_URL', os.environ.get('INBOUND_PROGRESS_BROWSER_URL', 'https://127.0.0.1:5187'))
OUTBOUND_ORDER = dict(
    id=9,
    order_code='OUT-TEST-009',
    status='in_progress',
    warehouse_id=1,
    created_at='2026-10-31T09:00:00+07:00',
    details={},
)

UNASSIGNED_POS = '__unassigned_split_position__'
UNASSIGNED_ZONE = '__unassigned_split_zone__'
VEHICLE_SENTINEL = 'no_vehicle'


def _progress_status(status):
    normalized = status.strip().lower().replace('-', '_')
    if normalized == 'initialize':
        return 'waiting'
    if normalized in {'reserved', 'in_progress'}:
        return 'running'
    if normalized == 'completed':
        return 'completed'
    return 'attention'


def outbound_detail(
    ident,
    status,
    quantity,
    *,
    item_id=1,
    sku='SKU-1',
    vehicle='51C-OUT',
    sorting_position=None,
    split_zone_code=None,
    from_location_name=None,
    customer_name=None,
    trip=None,
):
    details = {}
    if vehicle is not None:
        details['vehicle_no'] = vehicle
    if customer_name is not None:
        details['customer_name'] = customer_name
    if trip is not None:
        details['trip'] = trip
    if sorting_position is not None:
        details['sorting_position'] = sorting_position
    if split_zone_code is not None:
        details['split_zone_code'] = split_zone_code
    return dict(
        id=ident,
        status=status,
        quantity=quantity,
        item_id=item_id,
        sku=sku,
        unit='Thùng',
        details=details,
        from_location_name=from_location_name,
    )


def _bucket_row(key, label):
    return {
        'key': key,
        'label': label,
        'waiting_quantity': 0.0,
        'running_quantity': 0.0,
        'completed_quantity': 0.0,
        'attention_quantity': 0.0,
        'total_quantity': 0.0,
        'completion_percent': 0,
    }


def build_outbound_progress_payload(detail_rows):
    commands = {k: 0 for k in ('waiting', 'running', 'completed', 'attention')}
    quantity = {k: 0 for k in ('waiting', 'running', 'completed', 'attention')}
    vehicle_keys = set()
    trip_keys = set()
    customer_keys = set()
    by_vehicle = {}
    by_sku = {}
    by_split_position = {}
    by_split_zone = {}

    for row in detail_rows:
        prog = _progress_status(row['status'])
        qty = float(row.get('quantity') or 0)
        commands[prog] += 1
        quantity[prog] += qty
        meta = row.get('details') or {}
        vehicle = (meta.get('vehicle_no') or '').strip() or VEHICLE_SENTINEL
        vehicle_label = 'Chưa có xe' if vehicle == VEHICLE_SENTINEL else vehicle
        if vehicle != VEHICLE_SENTINEL:
            vehicle_keys.add(vehicle)
        trip = (meta.get('trip') or meta.get('trip_code') or '').strip()
        if trip:
            trip_keys.add(trip)
        customer = (meta.get('customer_name') or '').strip() or 'Unknown'
        if customer != 'Unknown':
            customer_keys.add(customer)
        sku = (row.get('sku') or '').strip() or f"#{row.get('item_id')}"
        sku_key = f"item:{row.get('item_id')}"
        pos = (meta.get('sorting_position') or '').strip()
        pos_key = pos or UNASSIGNED_POS
        pos_label = pos or 'Chưa gán vị trí'
        zone = (meta.get('split_zone_code') or '').strip()
        zone_key = zone or UNASSIGNED_ZONE
        zone_label = zone or 'Chưa gán zone'

        for store, key, label in (
            (by_vehicle, vehicle, vehicle_label),
            (by_sku, sku_key, sku),
            (by_split_position, pos_key, pos_label),
            (by_split_zone, zone_key, zone_label),
        ):
            entry = store.setdefault(key, _bucket_row(key, label))
            entry[f'{prog}_quantity'] += qty
            entry['total_quantity'] += qty

    def finalize(store):
        rows = []
        for entry in store.values():
            total = entry['total_quantity']
            completed = entry['completed_quantity']
            entry['completion_percent'] = round(completed / total * 100) if total else 0
            rows.append(entry)
        return sorted(rows, key=lambda r: r['label'].casefold())

    return {
        'commands': commands,
        'quantity': quantity,
        'vehicle_count': len(vehicle_keys),
        'trip_count': len(trip_keys),
        'customer_count': len(customer_keys),
        'by_vehicle': finalize(by_vehicle),
        'by_sku': finalize(by_sku),
        'by_split_position': finalize(by_split_position),
        'by_split_zone': finalize(by_split_zone),
    }


def build_outbound_group_details_payload(detail_rows, dimension, key):
    rows = []
    for row in detail_rows:
        meta = row.get('details') or {}
        vehicle = (meta.get('vehicle_no') or '').strip() or None
        sku = (row.get('sku') or '').strip() or None
        pos = (meta.get('sorting_location_name') or '').strip() or None
        from_loc = (row.get('from_location_name') or '').strip() or None
        sku_key = f"item:{row.get('item_id')}"
        vehicle_key = (meta.get('vehicle_no') or '').strip() or VEHICLE_SENTINEL
        pos_key = (meta.get('sorting_position') or '').strip() or UNASSIGNED_POS
        zone_key = (meta.get('split_zone_code') or '').strip() or UNASSIGNED_ZONE
        match = {
            'vehicle': vehicle_key == key,
            'sku': sku_key == key,
            'split_position': pos_key == key,
            'split_zone': zone_key == key,
        }.get(dimension, False)
        if not match:
            continue
        rows.append({
            'detail_id': row['id'],
            'status': row['status'],
            'progress_status': _progress_status(row['status']),
            'quantity': float(row.get('quantity') or 0),
            'unit': row.get('unit') or '',
            'sku': sku,
            'vehicle_no': vehicle,
            'split_position': pos,
            'from_location_name': from_loc,
        })
    return rows


def fulfill_outbound_api_route(test_case, route):
    """Mock outbound list/progress endpoints for Control Tower tests."""
    url = urlparse(route.request.url)
    query = parse_qs(url.query)
    path = url.path
    if path.rstrip('/').endswith('/outbound-orders') and '/id/' not in path:
        mode = getattr(test_case, 'outbound_mode', 'active')
        if mode == 'error':
            route.fulfill(status=503, json={'detail': 'Test unavailable'})
            return True
        status = query.get('status', [''])[0]
        order = getattr(test_case, 'outbound_order', OUTBOUND_ORDER)
        rows = []
        if status == 'in_progress' and mode == 'active':
            rows = [order]
        elif status == 'completed' and mode == 'completed':
            rows = [{**order, 'status': 'completed'}]
        route.fulfill(json=dict(items=rows, total=len(rows), page=1, page_size=1, summary={}))
        return True
    if path.endswith('/progress/group-details') and '/outbound-orders/id/' in path:
        dimension = query.get('dimension', [''])[0]
        key = query.get('key', [''])[0]
        details = getattr(test_case, 'outbound_details', [])
        payload = build_outbound_group_details_payload(details, dimension, key)
        route.fulfill(json=payload)
        return True
    if '/outbound-orders/id/' in path and path.endswith('/progress'):
        details = getattr(test_case, 'outbound_details', [])
        route.fulfill(json=build_outbound_progress_payload(details))
        return True
    return None


class OutboundProgressBrowserTests(unittest.TestCase):
    setUpClass = classmethod(fixture.RobotPerformanceBrowserTests.setUpClass.__func__)
    tearDownClass = classmethod(fixture.RobotPerformanceBrowserTests.tearDownClass.__func__)

    def setUp(self):
        self.outbound_mode = 'active'
        self.outbound_order = copy.deepcopy(OUTBOUND_ORDER)
        self.outbound_details = [
            outbound_detail(1, 'completed', 10, item_id=1, sku='SKU-A', vehicle='51C-A', sorting_position='BIN-1', customer_name='KH-A', trip='TRIP-1', from_location_name='Kệ A'),
            outbound_detail(2, 'in_progress', 5, item_id=2, sku='SKU-B', vehicle='51C-B', sorting_position='BIN-2', customer_name='KH-B', trip='TRIP-2', from_location_name='Kệ B'),
        ]
        fixture.RobotPerformanceBrowserTests.setUp(self)
        user = copy.deepcopy(fixture.USER)
        user['access']['is_admin'] = False
        user['roles'] = [{'id': 2, 'name': 'operator'}]
        self.context.add_init_script('localStorage.setItem("user_data", ' + json.dumps(json.dumps(user)) + ');')

    def api(self, route):
        outbound = fulfill_outbound_api_route(self, route)
        if outbound is not None:
            return outbound
        return fixture.RobotPerformanceBrowserTests.api(self, route)

    def open_outbound_panel(self):
        self.page.goto(f'{BASE_URL}/control-tower')
        return self.page.get_by_role('region', name='Tiến độ xuất hàng', exact=True)

    def test_outbound_metadata_and_quantity_dimensions(self):
        panel = self.open_outbound_panel()
        expect(panel.get_by_text('OUT-TEST-009', exact=True)).to_be_visible()
        expect(panel.get_by_text('Thông số', exact=True)).to_be_visible()
        expect(panel.get_by_text('Thông số', exact=True).locator('..').locator('dd')).to_have_text('2 xe - 2 trip - 2 khách hàng')
        panel.get_by_text('Số lượng', exact=True).click()
        expect(panel.get_by_label('Chọn chiều tiến độ xuất hàng')).to_be_visible()
        expect(panel.get_by_text('Vị trí chia', exact=True)).to_have_count(0)
        expect(panel.get_by_text('Zone chia', exact=True)).to_have_count(0)
        panel.get_by_text('Mã hàng', exact=True).click()
        expect(panel.get_by_label('Tiến độ theo Mã hàng').get_by_text('SKU-A', exact=True)).to_be_visible()
        expect(panel.get_by_role('link', name='Xem xuất hàng')).to_have_attribute('href', '/export')
        self.assertEqual(self.errors, [])

    def test_sku_drill_down_table(self):
        panel = self.open_outbound_panel()
        panel.get_by_text('Số lượng', exact=True).click()
        panel.get_by_text('Mã hàng', exact=True).click()
        panel.get_by_role('button', name='SKU-A').click()
        expect(panel.get_by_role('table', name='Chi tiết nhóm tiến độ xuất')).to_be_visible()
        expect(panel.get_by_role('columnheader', name='Vị trí chia', exact=True)).to_be_visible()
        expect(panel.get_by_role('columnheader', name='Vị trí lấy', exact=True)).to_be_visible()
        expect(panel.get_by_role('columnheader', name='Xe', exact=True)).to_be_visible()
        expect(panel.get_by_text('10 Thùng', exact=True)).to_be_visible()
        panel.get_by_role('button', name='Mã hàng').click()
        expect(panel.get_by_label('Tiến độ theo Mã hàng')).to_be_visible()


if __name__ == '__main__':
    unittest.main()
