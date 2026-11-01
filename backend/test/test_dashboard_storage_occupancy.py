"""Storage occupancy for report card."""
import os
import unittest
from unittest.mock import MagicMock, patch

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="storage-occupancy-test",
)

from app.modules.warehouse.dashboard import dashboard_storage_occupancy_service


class DashboardStorageOccupancyTests(unittest.TestCase):
    @patch(
        "app.modules.warehouse.dashboard.dashboard_storage_occupancy_service._ensure_warehouse_exists"
    )
    @patch(
        "app.modules.warehouse.dashboard.dashboard_storage_occupancy_service.location_ids_with_assigned_qr",
        return_value=set(),
    )
    @patch("app.modules.warehouse.dashboard.dashboard_storage_occupancy_service.settings")
    def test_counts_occupied_locations(self, settings, _assigned, _ensure):
        settings.zone_storage = ["Zone_3"]
        loc_empty = MagicMock(status="empty", id=1)
        loc_stock = MagicMock(status="has_stock", id=2)
        loc_stock2 = MagicMock(status="has_stock", id=3)

        query = MagicMock()
        query.join.return_value = query
        query.filter.return_value = query
        query.all.return_value = [loc_empty, loc_stock, loc_stock2]

        db = MagicMock()
        db.query.return_value = query

        result = dashboard_storage_occupancy_service.get_report_storage_occupancy(
            db, warehouse_id=1
        )
        self.assertEqual(result.total_locations, 3)
        self.assertEqual(result.occupied_locations, 2)
        self.assertEqual(result.occupancy_percent, 67)


if __name__ == "__main__":
    unittest.main()
