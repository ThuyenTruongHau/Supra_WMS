"""Check robot assignment from the inbound API through Celery to the RCS JSON."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from test import test_outbound_remaining_quantity as isolated_fixture  # config/model registration
from app.core.database import get_db
from app.modules.masan import masan_inbound_service
from app.modules.masan.masan_api import router
from app.modules.warehouse.inbound_order import inbound_celery_task, inbound_order_service


ROBOT_CODES = ("EE49822BAK00001", "EE49822BAK00002")


class InboundRobotAssignmentApiTests(unittest.TestCase):
    def setUp(self):
        self.db = object()
        self.app = FastAPI()
        self.app.include_router(router, prefix="/api/v1")
        self.app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.url = "/api/v1/masan/inbound-orders/caller"
        caller_patch = patch.object(
            masan_inbound_service,
            "caller_masan_inbound_order",
            return_value={"queued": 1, "detail_ids": [10], "job_ids": ["job-10"]},
        )
        self.caller = caller_patch.start()
        self.addCleanup(caller_patch.stop)

    def test_both_robot_codes_are_passed_to_the_dispatcher(self):
        for robot_code in ROBOT_CODES:
            with self.subTest(robot_code=robot_code):
                response = self.client.post(
                    self.url,
                    json={"location_ids": [101, 102], "assign_robot_id": robot_code},
                )
                self.assertEqual(response.status_code, 202)
                self.caller.assert_called_with(
                    self.db, [101, 102], assign_robot_id=robot_code, sorting_persons=None
                )

    def test_existing_request_without_assignment_remains_supported(self):
        response = self.client.post(self.url, json={"location_ids": [101]})
        self.assertEqual(response.status_code, 202)
        self.caller.assert_called_once_with(self.db, [101], assign_robot_id=None, sorting_persons=None)

    def test_invalid_robot_and_empty_locations_are_rejected_before_queueing(self):
        for body in (
            {"location_ids": [101], "assign_robot_id": "unknown"},
            {"location_ids": [101], "assign_robot_id": ""},
            {"location_ids": [101], "assign_robot_id": list(ROBOT_CODES)},
            {"location_ids": [], "assign_robot_id": ROBOT_CODES[0]},
        ):
            with self.subTest(body=body):
                self.assertEqual(self.client.post(self.url, json=body).status_code, 422)
        self.caller.assert_not_called()


class InboundRobotAssignmentQueueTests(unittest.TestCase):
    def test_worker_passes_assignment_to_execution_and_accepts_old_jobs(self):
        for robot_code in (*ROBOT_CODES, None):
            with self.subTest(robot_code=robot_code):
                with patch.object(inbound_celery_task, "db_session") as session, patch.object(
                    inbound_order_service, "execute_inbound_task", return_value={"ok": True}
                ) as execute:
                    kwargs = {"assign_robot_id": robot_code} if robot_code else {}
                    result = inbound_celery_task.accept_inbound_task_task.run(detail_id=10, **kwargs)
                    execute.assert_called_once_with(
                        session.return_value.__enter__.return_value,
                        10,
                        assign_robot_id=robot_code,
                    )
                    self.assertEqual(result, {"ok": True})


if __name__ == "__main__":
    unittest.main()
