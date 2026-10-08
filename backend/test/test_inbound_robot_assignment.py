"""Check robot assignment from the inbound API through Celery to the RCS JSON."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.modules.masan import masan_inbound_service
from app.modules.masan.masan_api import router
from app.modules.warehouse.inbound_order import inbound_celery_task, inbound_order_service
from app.modules.warehouse.inbound_order.inbound_order_schema import InboundOrderDetailResponse


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
                    self.db, [101, 102], assign_robot_id=robot_code
                )

    def test_existing_request_without_assignment_remains_supported(self):
        response = self.client.post(self.url, json={"location_ids": [101]})
        self.assertEqual(response.status_code, 202)
        self.caller.assert_called_once_with(self.db, [101], assign_robot_id=None)

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
    def test_each_queued_detail_keeps_the_selected_robot(self):
        for robot_code in (*ROBOT_CODES, None):
            with self.subTest(robot_code=robot_code):
                db = MagicMock()
                db.query.return_value.filter.return_value.order_by.return_value.first.side_effect = [
                    SimpleNamespace(id=10), None, SimpleNamespace(id=12)
                ]
                with patch.object(
                    masan_inbound_service.accept_inbound_task_task,
                    "apply_async",
                    side_effect=[SimpleNamespace(id="job-10"), SimpleNamespace(id="job-12")],
                ) as enqueue:
                    result = masan_inbound_service.caller_masan_inbound_order(
                        db, [101, 102, 103], assign_robot_id=robot_code
                    )
                self.assertEqual(result, {
                    "queued": 2, "detail_ids": [10, 12], "job_ids": ["job-10", "job-12"]
                })
                expected = [
                    {
                        "detail_id": detail_id,
                        **({"assign_robot_id": robot_code} if robot_code else {}),
                    }
                    for detail_id in (10, 12)
                ]
                self.assertEqual([call.kwargs["kwargs"] for call in enqueue.call_args_list], expected)

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


class InboundRobotAssignmentPayloadTests(unittest.TestCase):
    def test_rcs_payload_and_saved_task_contain_assignment_only_when_requested(self):
        scenarios = [("auto", code) for code in (*ROBOT_CODES, None)]
        scenarios.extend(("manual", code) for code in ROBOT_CODES)
        for detail_type, robot_code in scenarios:
            with self.subTest(detail_type=detail_type, robot_code=robot_code):
                db = MagicMock()
                detail = SimpleNamespace(
                    id=10,
                    inbound_order_id=1,
                    detail_type=detail_type,
                    status="initialize",
                    from_location_id=101,
                    to_location_id=201,
                    from_location=SimpleNamespace(location_code="SOURCE-01"),
                    to_location=SimpleNamespace(location_code="STORAGE-01"),
                    allocations=[SimpleNamespace(quantity=25)],
                    inbound_order=SimpleNamespace(created_by_id=1),
                )
                db.query.return_value.options.return_value.filter.return_value.first.return_value = detail
                detail_response = InboundOrderDetailResponse(
                    id=10, inbound_order_id=1, status="initialize", detail_type=detail_type
                )
                with (
                    patch.object(inbound_order_service, "selectinload"),
                    patch.object(inbound_order_service, "joinedload"),
                    patch.object(inbound_order_service, "History"),
                    patch.object(
                        inbound_order_service,
                        "RobotTask",
                        side_effect=lambda **fields: SimpleNamespace(id=1, **fields),
                    ),
                    patch.object(
                        inbound_order_service, "_build_detail_response", return_value=detail_response
                    ),
                    patch.object(inbound_order_service.settings, "inbound_process_code", "Supra_to_storage"),
                    patch.object(
                        inbound_order_service.uuid, "uuid4",
                        return_value=SimpleNamespace(hex="a1b2c3d4" + "0" * 24),
                    ),
                    patch.object(inbound_order_service.task_status_service, "add_task") as send_rcs,
                ):
                    result = inbound_order_service.execute_inbound_task(
                        db, 10, assign_robot_id=robot_code
                    )

                task_detail = {"taskPath": "SOURCE-01,STORAGE-01"}
                if robot_code:
                    task_detail["assignRobotIds"] = robot_code
                send_rcs.assert_called_once_with({
                    "orderId": "TDS_Inbound_a1b2c3d4",
                    "priority": 4,
                    "modelProcessCode": "Supra_to_storage",
                    "fromSystem": "Thadosoft",
                    "taskOrderDetail": [task_detail],
                })
                self.assertEqual(json.loads(result.robot_task.task_order_detail), [task_detail])
                self.assertEqual(result.robot_task.quantity, 25)
                self.assertEqual(detail.status, "issued")

    def test_manual_detail_without_assignment_still_completes_without_rcs(self):
        db = MagicMock()
        detail = SimpleNamespace(id=10, detail_type="manual", status="initialize")
        db.query.return_value.options.return_value.filter.return_value.first.return_value = detail
        db.query.return_value.filter.return_value.all.return_value = []
        detail_response = InboundOrderDetailResponse(
            id=10, inbound_order_id=1, status="completed", detail_type="manual"
        )
        with (
            patch.object(inbound_order_service, "selectinload"),
            patch.object(inbound_order_service, "joinedload"),
            patch.object(inbound_order_service, "_build_detail_response", return_value=detail_response),
            patch.object(inbound_order_service.task_status_service, "add_task") as send_rcs,
        ):
            result = inbound_order_service.execute_inbound_task(db, 10)
        send_rcs.assert_not_called()
        self.assertEqual(detail.status, "completed")
        self.assertIsNone(result.robot_task)


if __name__ == "__main__":
    unittest.main()
