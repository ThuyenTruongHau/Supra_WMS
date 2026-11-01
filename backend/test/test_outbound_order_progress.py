"""Outbound overview progress aggregation."""
import os
import unittest

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="outbound-progress-test",
)

from app.modules.warehouse.outbound_order.outbound_order_schema import (
    OutboundOrderAllocationResponse,
    OutboundOrderDetailResponse,
)
from app.modules.warehouse.outbound_order.outbound_order_progress_service import (
    UNASSIGNED_SPLIT_POSITION_KEY,
    UNASSIGNED_SPLIT_ZONE_KEY,
    VEHICLE_SENTINEL,
    build_outbound_progress_from_details,
    list_outbound_progress_group_details_from_details,
    outbound_progress_status,
)


def _detail(
    detail_id: int,
    status: str,
    quantity: int,
    *,
    item_id: int = 1,
    sku: str = "SKU-A",
    vehicle: str | None = "51C-001",
    sorting_position: str | None = None,
    split_zone_code: str | None = None,
    customer_name: str | None = None,
    trip: str | None = None,
    from_location_name: str | None = None,
):
    details: dict = {}
    if vehicle is not None:
        details["vehicle_no"] = vehicle
    if customer_name is not None:
        details["customer_name"] = customer_name
    if trip is not None:
        details["trip"] = trip
    if sorting_position is not None:
        details["sorting_position"] = sorting_position
    if split_zone_code is not None:
        details["split_zone_code"] = split_zone_code
    allocations: list[OutboundOrderAllocationResponse] = []
    if from_location_name is not None:
        allocations.append(
            OutboundOrderAllocationResponse(
                id=detail_id,
                outbound_order_detail_id=detail_id,
                item_stock_id=1,
                quantity=quantity,
                status="completed",
                from_location_name=from_location_name,
            )
        )
    return OutboundOrderDetailResponse(
        id=detail_id,
        outbound_order_id=10,
        item_id=item_id,
        sku=sku,
        item_name=f"Item {sku}",
        quantity=quantity,
        unit="Thùng",
        unit_id=1,
        detail_type="auto",
        status=status,
        details=details,
        allocations=allocations,
    )


class OutboundOrderProgressTests(unittest.TestCase):
    def test_progress_status_mapping(self):
        self.assertEqual(outbound_progress_status("initialize"), "waiting")
        self.assertEqual(outbound_progress_status("reserved"), "running")
        self.assertEqual(outbound_progress_status("in_progress"), "running")
        self.assertEqual(outbound_progress_status("completed"), "completed")
        self.assertEqual(outbound_progress_status("failed"), "attention")

    def test_counts_commands_and_quantities(self):
        result = build_outbound_progress_from_details(
            [
                _detail(1, "initialize", 10, item_id=1, sku="SKU-1"),
                _detail(2, "in_progress", 20, item_id=2, sku="SKU-2"),
                _detail(3, "completed", 30, item_id=3, sku="SKU-3"),
            ]
        )
        self.assertEqual(result.commands.waiting, 1)
        self.assertEqual(result.commands.running, 1)
        self.assertEqual(result.commands.completed, 1)
        self.assertEqual(result.quantity.waiting, 10)
        self.assertEqual(result.quantity.running, 20)
        self.assertEqual(result.quantity.completed, 30)

    def test_group_dimensions(self):
        result = build_outbound_progress_from_details(
            [
                _detail(
                    1,
                    "completed",
                    10,
                    vehicle="51C-A",
                    sorting_position="BIN-1",
                    split_zone_code="Zone_CC_01",
                    item_id=1,
                    sku="SKU-1",
                ),
                _detail(
                    2,
                    "initialize",
                    5,
                    vehicle="51C-B",
                    sorting_position="BIN-2",
                    split_zone_code="Zone_CC_02",
                    item_id=2,
                    sku="SKU-2",
                ),
                _detail(3, "initialize", 3, vehicle=None, item_id=3, sku="SKU-3"),
            ]
        )
        self.assertEqual(len(result.by_vehicle), 3)
        self.assertEqual(len(result.by_sku), 3)
        self.assertEqual(len(result.by_split_position), 3)
        self.assertEqual(len(result.by_split_zone), 3)

        unassigned_pos = next(
            r for r in result.by_split_position if r.key == UNASSIGNED_SPLIT_POSITION_KEY
        )
        self.assertEqual(unassigned_pos.total_quantity, 3)

        unassigned_zone = next(
            r for r in result.by_split_zone if r.key == UNASSIGNED_SPLIT_ZONE_KEY
        )
        self.assertEqual(unassigned_zone.total_quantity, 3)

        vehicle_a = next(r for r in result.by_vehicle if r.key == "51C-A")
        self.assertEqual(vehicle_a.completed_quantity, 10)
        self.assertEqual(vehicle_a.completion_percent, 100)

    def test_group_details_filter_by_sku(self):
        details = [
            _detail(
                1,
                "completed",
                10,
                sorting_position="BIN-1",
                from_location_name="Kệ kho A",
                item_id=1,
                sku="SKU-1",
            ),
            _detail(
                2,
                "initialize",
                5,
                sorting_position="BIN-2",
                split_zone_code="Zone_CC_02",
                item_id=2,
                sku="SKU-2",
            ),
        ]
        details[0].details["sorting_location_name"] = "Ô chia 1"
        rows = list_outbound_progress_group_details_from_details(
            details,
            dimension="sku",
            key="item:1",
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].detail_id, 1)
        self.assertEqual(rows[0].split_position, "Ô chia 1")
        self.assertEqual(rows[0].from_location_name, "Kệ kho A")

    def test_vehicle_sentinel_grouping(self):
        result = build_outbound_progress_from_details(
            [_detail(1, "initialize", 4, vehicle=None)]
        )
        row = next(r for r in result.by_vehicle if r.key == VEHICLE_SENTINEL)
        self.assertEqual(row.label, "Chưa có xe")
        self.assertEqual(result.vehicle_count, 0)

    def test_split_position_uses_location_name_meta(self):
        details = [
            _detail(
                1,
                "completed",
                10,
                sorting_position="BIN-1",
                item_id=1,
                sku="SKU-1",
            ),
        ]
        details[0].details["sorting_location_name"] = "Ô chia A"
        rows = list_outbound_progress_group_details_from_details(
            details,
            dimension="sku",
            key="item:1",
        )
        self.assertEqual(rows[0].split_position, "Ô chia A")

    def test_distinct_vehicle_trip_customer_counts(self):
        result = build_outbound_progress_from_details(
            [
                _detail(
                    1,
                    "completed",
                    10,
                    vehicle="51C-A",
                    customer_name="KH-A",
                    trip="T1",
                ),
                _detail(
                    2,
                    "initialize",
                    5,
                    vehicle="51C-B",
                    customer_name="KH-B",
                    trip="T2",
                ),
                _detail(
                    3,
                    "initialize",
                    3,
                    vehicle="51C-A",
                    customer_name="KH-A",
                    trip="T1",
                ),
            ]
        )
        self.assertEqual(result.vehicle_count, 2)
        self.assertEqual(result.trip_count, 2)
        self.assertEqual(result.customer_count, 2)


if __name__ == "__main__":
    unittest.main()
