import os
import unittest

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="operator-board-test",
)

from app.modules.warehouse.outbound_order.outbound_operator_board_service import (  # noqa: E402
    _derive_order_list_status,
    _new_progress_bucket,
)


class DeriveOrderListStatusTests(unittest.TestCase):
    def test_empty(self):
        self.assertEqual(_derive_order_list_status(_new_progress_bucket()), "initialize")

    def test_all_completed(self):
        b = _new_progress_bucket()
        b["total_detail_count"] = 3
        b["done_detail_count"] = 3
        b["pending_detail_count"] = 0
        b["all_detail_statuses"] = {"completed"}
        self.assertEqual(_derive_order_list_status(b), "completed")

    def test_all_reserved(self):
        b = _new_progress_bucket()
        b["total_detail_count"] = 2
        b["pending_detail_count"] = 2
        b["all_detail_statuses"] = {"reserved"}
        self.assertEqual(_derive_order_list_status(b), "reserved")

    def test_partial_done(self):
        b = _new_progress_bucket()
        b["total_detail_count"] = 4
        b["done_detail_count"] = 1
        b["pending_detail_count"] = 3
        b["all_detail_statuses"] = {"completed", "initialize"}
        self.assertEqual(_derive_order_list_status(b), "in_progress")


if __name__ == "__main__":
    unittest.main()
