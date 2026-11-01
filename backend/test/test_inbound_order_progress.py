"""Inbound overview progress aggregation (mirrors frontend inboundProgress.test.mjs)."""
import os
import unittest

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="inbound-progress-test",
)

from app.modules.warehouse.inbound_order.inbound_order_schema import (
    InboundOrderAllocationResponse,
    InboundOrderDetailResponse,
)
from app.modules.warehouse.inbound_order.inbound_order_progress_service import (
    build_inbound_progress_from_details,
    list_inbound_progress_item_details,
    progress_status,
)
from unittest.mock import patch


def _allocation(item_id, quantity, sku=None):
    sku = sku or (f"SKU-{item_id}" if item_id is not None else "SKU-A")
    return InboundOrderAllocationResponse(
        id=1,
        inbound_order_detail_id=1,
        item_stock_id=1,
        unit_id=1,
        quantity=quantity,
        status="active",
        item_id=item_id,
        sku=sku,
        item_name=f"Item {sku}",
        unit_name="Thùng",
    )


def _detail(detail_id, status, allocations=None, vehicle=None):
    return InboundOrderDetailResponse(
        id=detail_id,
        inbound_order_id=1,
        status=status,
        detail_type="auto",
        details={"vehicle_no": vehicle} if vehicle is not None else {},
        allocations=allocations or [],
    )


class InboundOrderProgressTests(unittest.TestCase):
    def test_progress_status_mapping(self):
        self.assertEqual(progress_status("in-progress"), "running")
        self.assertEqual(progress_status("completed"), "completed")
        self.assertEqual(progress_status("failed"), "attention")

    def test_counts_commands_quantities_and_items(self):
        result = build_inbound_progress_from_details(
            [
                _detail(1, "initialize", [_allocation(1, 20)], "51C-001"),
                _detail(2, "issued", [_allocation(2, 30), _allocation(2, 5)], "51C-001"),
                _detail(3, "in-progress", [_allocation(3, 40)], "51C-002"),
                _detail(4, "completed", [_allocation(4, 50)]),
            ]
        )
        self.assertEqual(result.commands.waiting, 1)
        self.assertEqual(result.commands.running, 2)
        self.assertEqual(result.commands.completed, 1)
        self.assertEqual(result.quantity.waiting, 20)
        self.assertEqual(result.quantity.running, 75)
        self.assertEqual(result.quantity.completed, 50)
        self.assertEqual(result.vehicles, ["51C-001", "51C-002"])
        self.assertEqual(len(result.items), 4)

    def test_item_completion_percent_by_quantity(self):
        result = build_inbound_progress_from_details(
            [
                _detail(1, "completed", [_allocation(1, 20)]),
                _detail(2, "initialize", [_allocation(1, 30)]),
            ]
        )
        item = next(row for row in result.items if row.item_id == 1)
        self.assertEqual(item.total_quantity, 50)
        self.assertEqual(item.completed_quantity, 20)
        self.assertEqual(item.waiting_quantity, 30)
        self.assertEqual(item.completion_percent, 40)

    def test_attention_buckets(self):
        result = build_inbound_progress_from_details(
            [
                _detail(1, "failed", [_allocation(1, 10)]),
                _detail(2, "cancelled", [_allocation(2, 20)]),
                _detail(3, "unexpected", [_allocation(3, 30)]),
                _detail(4, "completed", [_allocation(1, 5)]),
            ]
        )
        self.assertEqual(result.commands.attention, 3)
        self.assertEqual(result.quantity.attention, 60)
        item = next(row for row in result.items if row.item_id == 1)
        self.assertEqual(item.attention_quantity, 10)
        self.assertEqual(item.completed_quantity, 5)

    def test_item_details_filter_and_quantity(self):
        details = [
            _detail(1, "completed", [_allocation(1, 20)], "51C-001"),
            _detail(2, "initialize", [_allocation(1, 30), _allocation(2, 5)], "51C-002"),
        ]
        with patch(
            "app.modules.warehouse.inbound_order.inbound_order_progress_service.inbound_order_service.get_inbound_order_detail",
            return_value=details,
        ):
            rows = list_inbound_progress_item_details(
                None, "IN-TEST", item_id=1
            )
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].quantity, 20)
        self.assertEqual(rows[1].quantity, 30)
        self.assertEqual(rows[0].vehicle_no, "51C-001")


if __name__ == "__main__":
    unittest.main()
