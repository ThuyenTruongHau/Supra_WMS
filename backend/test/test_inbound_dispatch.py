"""Isolated database and fake RCS/broker. Never contacts a running WMS."""
import copy
import tempfile
import os
import uuid
import importlib.util
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from threading import Event
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from test import test_outbound_remaining_quantity as fixture
from sqlalchemy import create_engine, update, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.modules.masan import masan_inbound_dispatch_service as dispatch
from app.modules.masan import masan_inbound_dispatch_api as api
from app.modules.masan.masan_inbound_dispatch_model import InboundDispatchControl as Control, InboundDispatchBatch as Batch, InboundDispatchCommand as Command
from app.modules.robot.robot_model import RobotTask
from app.modules.robot.robot_service import task_status_service
from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrderDetail as Detail
from app.modules.warehouse.inbound_order.inbound_order_service import execute_inbound_task
from app.modules.warehouse.inbound_order.inbound_celery_task import dispatch_inbound_command_task
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.location_map.location_model import Location
from app.core.database import get_db


class InboundDispatchTests(unittest.TestCase):
    put = fixture.OutboundRemainingQuantityTests.put
    cache_details = fixture.OutboundRemainingQuantityTests.cache_details

    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="wms-inbound-test-")
        self.addCleanup(temporary.cleanup)
        self.url = f"sqlite+pysqlite:///{Path(temporary.name, 'test.db').as_posix()}"
        postgres_url = os.environ.get("INBOUND_DISPATCH_TEST_URL")
        if postgres_url:
            if make_url(postgres_url).database != "inbound_dispatch_test":
                raise RuntimeError("PostgreSQL tests require the dedicated inbound_dispatch_test database")
            schema = f"test_inbound_{uuid.uuid4().hex}"
            bootstrap = create_engine(postgres_url)
            with bootstrap.begin() as connection:
                connection.execute(text(f'CREATE SCHEMA "{schema}"'))
            def remove_schema():
                with bootstrap.begin() as connection:
                    connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
                bootstrap.dispose()
            self.addCleanup(remove_schema)
            self.engine = create_engine(postgres_url, connect_args={"options": f"-csearch_path={schema}"})
            self.addCleanup(self.engine.dispose)
            fixture.Base.metadata.create_all(self.engine)
            self.db = Session(self.engine)
            self.addCleanup(self.db.close)
            self.put("warehouse", id=1, code="TEST-1")
            self.put("warehouse", id=2, code="TEST-2")
            self.put("zone", id=1, warehouse_id=1, code="Zone_storage")
            self.put("unit", id=1, name="Thung")
            self.put("users", id=1, username="test", email="test@example.invalid", hashed_password="unused")
            self.put("item", id=1, sku="TEST", name="Test item", base_unit=1, max_quantity=9999, min_quantity=0, warehouse_id=1, supplier="TEST")
            for identifier, warehouse_id in ((101, 1), (104, 2)):
                self.put("location", id=identifier, location_name="G417", location_code=f"DEST-{identifier}", zone_id=1, warehouse_id=warehouse_id)
            self.cache = {}
            self.rpc = patch.object(task_status_service, "add_task", return_value={"code": 1000}).start()
            self.addCleanup(patch.stopall)
            self.db.commit()
        else:
            with patch.object(fixture, "create_engine", side_effect=lambda _: create_engine(self.url, connect_args={"check_same_thread": False})):
                fixture.OutboundRemainingQuantityTests.setUp(self)
        self.db.autoflush = False
        self.put("inbound_dispatch_control", warehouse_id=1, enabled=True, legacy_migrated=True)
        self.put("inbound_dispatch_control", warehouse_id=2, enabled=True, legacy_migrated=True)
        self.put("inbound_order", id=1, order_code="IN-TEST", warehouse_id=1, created_by_id=1)
        for i, suffix in enumerate(("01", "02", "03", "04", "05", "08"), 1):
            self.put("location", id=300+i, location_name=f"IN{suffix}", location_code=f"IN-NODE-{suffix}", zone_id=1, warehouse_id=1)
            self.put("inbound_order_detail", id=i, inbound_order_id=1, from_location_id=300+i, to_location_id=101,
                     detail_type="auto", status="initialize")
            self.put("item_stock", id=100+i, item_id=1, unit_id=1, location_id=300+i, quantity=10,
                     status="available", is_active=True, inbound_order_detail_id=i)
            self.put("inbound_order_allocation", id=i, inbound_order_detail_id=i, item_stock_id=100+i, unit_id=1, quantity=10)
        self.db.commit()
        self.jobs = []
        def enqueue(**kwargs):
            self.jobs.append(copy.deepcopy(kwargs["kwargs"]))
            return SimpleNamespace(id=f"job-{len(self.jobs)}")
        for target, replacement in (
            ("app.modules.masan.masan_inbound_dispatch_service.cache_get", lambda key: copy.deepcopy(self.cache.get(key))),
            ("app.modules.masan.masan_inbound_dispatch_service.cache_delete", lambda key: self.cache.pop(key, None)),
            ("app.modules.masan.masan_inbound_dispatch_service.wake", lambda: None),
            ("app.modules.warehouse.inbound_order.inbound_celery_task.dispatch_inbound_command_task.apply_async", enqueue),
            ("app.modules.robot.robot_service.publish_robot_task_completed", lambda *args: None),
        ):
            mock = patch(target, side_effect=replacement)
            mock.start()
            self.addCleanup(mock.stop)
        mock = patch.object(task_status_service, "_distance_m", return_value=12.5)
        mock.start()
        self.addCleanup(mock.stop)

    def start(self, **kwargs):
        return dispatch.create_batch(self.db, list(range(301, 307)), **kwargs)

    def run_jobs(self):
        jobs, self.jobs = self.jobs, []
        for job in jobs:
            dispatch.dispatch_one(self.db, **job)

    def callback(self, command, code="8"):
        return task_status_service.receive_task_status(self.db, {"orderId": command.order_id, "status": code, "deviceNum": "TEST"})

    def rows(self):
        self.db.expire_all()
        return self.db.query(Command).order_by(Command.position, Command.id).all()

    def test_order_capacity_assignment_and_duplicate_jobs(self):
        result = self.start(assign_robot_id="EE49822BAK00001", sorting_persons="test")
        self.assertEqual(result["detail_ids"], [4, 6])
        self.assertEqual([r.detail_id for r in self.rows()], [4, 6, 3, 2, 1, 5])
        self.assertEqual(len(self.jobs), 2)
        original = copy.deepcopy(self.jobs)
        self.run_jobs()
        for job in original:
            dispatch.dispatch_one(self.db, **job)
        dispatch.tick(self.db, 1)
        self.assertEqual(self.rpc.call_count, 2)
        self.assertEqual(dispatch.status(self.db, 1)["issued_count"], 2)
        for call in self.rpc.call_args_list:
            self.assertEqual(call.args[0]["taskOrderDetail"][0]["assignRobotIds"], "EE49822BAK00001")

    def test_pause_before_worker_preserves_queue_and_stale_tokens_cannot_send(self):
        self.start()
        old = copy.deepcopy(self.jobs)
        state = dispatch.pause(self.db, 1, 1)
        self.assertEqual((state["waiting_count"], state["issued_count"]), (6, 0))
        self.run_jobs()
        self.rpc.assert_not_called()
        dispatch.resume(self.db, 1, 1)
        dispatch.tick(self.db, 1)
        for job in old:
            dispatch.dispatch_one(self.db, **job)
        self.rpc.assert_not_called()
        self.run_jobs()
        self.assertEqual(self.rpc.call_count, 2)

    def test_callbacks_while_paused_settle_stock_without_sending(self):
        self.start()
        self.run_jobs()
        dispatch.pause(self.db, 1, 1)
        row = next(r for r in self.rows() if r.state == "accepted")
        self.callback(row)
        self.callback(row)
        dispatch.tick(self.db, 1)
        self.assertEqual(self.rpc.call_count, 2)
        self.assertEqual(self.db.get(ItemStock, 100+row.detail_id).location_id, 101)
        state = dispatch.status(self.db, 1)
        self.assertEqual((state["issued_count"], state["waiting_count"]), (1, 4))
        dispatch.resume(self.db, 1, 1)
        dispatch.tick(self.db, 1)
        self.assertEqual(len(self.jobs), 1)
        self.run_jobs()
        self.assertEqual(self.rpc.call_count, 3)

    def test_resume_with_zero_outstanding_fills_two_and_is_idempotent(self):
        self.start()
        self.run_jobs()
        dispatch.pause(self.db, 1, 1)
        for row in [r for r in self.rows() if r.state == "accepted"]:
            self.callback(row)
        dispatch.resume(self.db, 1, 1)
        dispatch.resume(self.db, 1, 1)
        dispatch.tick(self.db, 1)
        dispatch.tick(self.db, 1)
        self.assertEqual(len(self.jobs), 2)
        self.run_jobs()
        self.assertEqual(self.rpc.call_count, 4)

    def test_new_batch_cannot_replace_running_or_paused_batch(self):
        self.start()
        with self.assertRaisesRegex(dispatch.DispatchConflict, "chưa kết thúc"):
            self.start()
        dispatch.pause(self.db, 1, 1)
        with self.assertRaisesRegex(dispatch.DispatchConflict, "tạm dừng"):
            self.start()
        self.assertEqual(self.db.query(Batch).count(), 1)

    def test_paused_direct_executor_and_low_level_sender_cannot_bypass_gate(self):
        dispatch.pause(self.db, 1, 1)
        with self.assertRaisesRegex(dispatch.DispatchConflict, "tạm dừng"):
            execute_inbound_task(self.db, 1)
        task = RobotTask(inbound_order_detail_id=1, order_id="TEST-BYPASS", quantity=10,
                         process_code="test", system_code="test", task_order_detail="[]")
        with self.assertRaisesRegex(dispatch.DispatchConflict, "tạm dừng"):
            task_status_service.create_robot_task(self.db, task)
        self.rpc.assert_not_called()

    def test_timeout_is_unknown_and_callback_resolves_without_auto_resume(self):
        self.start()
        self.rpc.side_effect = TimeoutError("RCS timeout")
        self.run_jobs()
        state = dispatch.status(self.db, 1)
        self.assertFalse(state["enabled"])
        self.assertEqual(state["review_count"], 1)
        row = next(r for r in self.rows() if r.state == "unknown")
        self.assertIsNotNone(self.db.get(RobotTask, row.robot_task_id))
        with self.assertRaisesRegex(dispatch.DispatchConflict, "đối soát"):
            dispatch.resume(self.db, 1, 1)
        self.callback(row)
        self.assertEqual(dispatch.status(self.db, 1)["review_count"], 0)
        self.assertFalse(dispatch.status(self.db, 1)["enabled"])

    def test_confirmed_unsent_reuses_order_id_after_explicit_resume(self):
        self.start()
        self.rpc.side_effect = TimeoutError("RCS timeout")
        self.run_jobs()
        row = next(r for r in self.rows() if r.state == "unknown")
        order_id = row.order_id
        dispatch.verify_unsent(self.db, 1, row.id, 1, "Checked RCS order search: absent")
        self.rpc.side_effect = None
        dispatch.resume(self.db, 1, 1)
        dispatch.tick(self.db, 1)
        self.run_jobs()
        self.assertEqual(self.db.get(Command, row.id).order_id, order_id)
        self.assertEqual(self.rpc.call_args_list[1].args[0]["orderId"], order_id)

    def test_lost_worker_sending_marker_is_never_replayed(self):
        self.start()
        row = self.rows()[0]
        row.state, row.order_id = "sending", "TDS_Inbound_INTERRUPTED"
        self.db.commit()
        dispatch.tick(self.db, 1)
        self.run_jobs()
        self.rpc.assert_not_called()
        self.assertEqual(dispatch.status(self.db, 1)["state"], "needs_review")

    def test_broker_outage_retains_reserved_work_for_periodic_retry(self):
        with patch.object(dispatch_inbound_command_task, "apply_async", side_effect=ConnectionError("broker offline")):
            self.start()
        self.assertEqual(sum(r.state == "reserved" for r in self.rows()), 2)
        dispatch.tick(self.db, 1)
        self.assertEqual(len(self.jobs), 2)
        self.run_jobs()
        self.assertEqual(self.rpc.call_count, 2)

    def test_deleted_or_completed_pending_rows_are_skipped(self):
        self.start()
        dispatch.pause(self.db, 1, 1)
        self.db.execute(update(Detail).where(Detail.id == 4).values(status="completed"))
        self.db.commit()
        dispatch.resume(self.db, 1, 1)
        dispatch.tick(self.db, 1)
        self.assertEqual(self.rows()[0].state, "skipped")

    def test_invalid_destination_blocks_and_repaired_detail_can_continue(self):
        self.start()
        self.db.execute(update(Detail).where(Detail.id == 4).values(to_location_id=None))
        self.db.commit()
        self.run_jobs()
        self.rpc.assert_not_called()
        self.assertEqual(dispatch.status(self.db, 1)["state"], "needs_review")
        self.db.execute(update(Detail).where(Detail.id == 4).values(to_location_id=101))
        self.db.commit()
        dispatch.resume(self.db, 1, 1)
        dispatch.tick(self.db, 1)
        self.run_jobs()
        self.assertEqual(self.rpc.call_count, 2)

    def test_legacy_cache_is_imported_once_paused_and_survives_session_restart(self):
        self.db.get(Control, 1).legacy_migrated = False
        self.db.commit()
        self.cache["inbound:caller_masan_inbound_order:1"] = {"list_details": [6, 3, 2], "assign_robot_id": "EE49822BAK00002"}
        state = dispatch.status(self.db, 1)
        self.assertFalse(state["enabled"])
        self.assertEqual(state["waiting_count"], 3)
        with Session(self.engine) as other:
            self.assertEqual(dispatch.status(other, 1)["batch_id"], state["batch_id"])
        self.assertEqual(self.db.query(Batch).count(), 1)
        self.rpc.assert_not_called()

    def test_pause_waits_for_inflight_http_then_blocks_remaining_job(self):
        self.start()
        first, second = self.jobs
        entered, release = Event(), Event()
        def http(_payload):
            entered.set()
            if not release.wait(5):
                raise TimeoutError("test failed to release RCS")
            return {"code": 1000}
        self.rpc.side_effect = http
        def send():
            with Session(self.engine) as db:
                dispatch.dispatch_one(db, **first)
        def pause():
            with Session(self.engine) as db:
                return dispatch.pause(db, 1, 1)
        with ThreadPoolExecutor(max_workers=2) as pool:
            sender = pool.submit(send)
            self.assertTrue(entered.wait(5))
            stopper = pool.submit(pause)
            self.assertFalse(stopper.done())
            release.set()
            sender.result(timeout=10)
            self.assertFalse(stopper.result(timeout=10)["enabled"])
        dispatch.dispatch_one(self.db, **second)
        self.assertEqual(self.rpc.call_count, 1)

    def test_warehouse_scope_validation_and_no_waiting_rows(self):
        with self.assertRaises(dispatch.DispatchConflict):
            dispatch.create_batch(self.db, [301, 104])
        self.assertEqual(dispatch.create_batch(self.db, [101])["queued"], 0)
        dispatch.pause(self.db, 1, 1)
        self.assertTrue(dispatch.status(self.db, 2)["enabled"])

    def test_manual_completion_and_assigned_manual_robot_keep_original_behavior(self):
        self.db.execute(update(Detail).where(Detail.id.in_([1, 2])).values(detail_type="manual"))
        self.db.commit()
        result = execute_inbound_task(self.db, 1)
        self.assertIsNone(result.robot_task)
        self.rpc.assert_not_called()
        dispatch.create_batch(self.db, [302], assign_robot_id="EE49822BAK00002")
        self.run_jobs()
        self.assertEqual(self.rpc.call_count, 1)
        payload = self.rpc.call_args.args[0]
        self.assertEqual(payload["taskOrderDetail"], [{"taskPath": "IN-NODE-02,DEST-101" if os.environ.get("INBOUND_DISPATCH_TEST_URL") else "IN-NODE-02,SOURCE-NODE", "assignRobotIds": "EE49822BAK00002"}])

    def test_legacy_jobs_are_retained_but_new_http_call_is_rejected(self):
        dispatch.pause(self.db, 1, 1)
        self.assertTrue(dispatch.retain_legacy_job(self.db, 1, "EE49822BAK00002"))
        self.assertTrue(dispatch.retain_legacy_job(self.db, 1, "EE49822BAK00002"))
        self.assertEqual(self.db.query(Command).count(), 1)
        with self.assertRaises(dispatch.DispatchConflict):
            execute_inbound_task(self.db, 2)
        self.assertEqual(self.db.query(Command).count(), 1)
        dispatch.resume(self.db, 1, 1)
        dispatch.tick(self.db, 1)
        self.run_jobs()
        self.assertEqual(self.rpc.call_count, 1)

    def test_failed_and_cancelled_callbacks_do_not_free_capacity_twice(self):
        self.start()
        self.run_jobs()
        for command, code in zip([r for r in self.rows() if r.state == "accepted"], ("7", "3")):
            self.callback(command, code)
            self.callback(command, code)
        dispatch.tick(self.db, 1)
        dispatch.tick(self.db, 1)
        self.assertEqual(len(self.jobs), 2)
        self.run_jobs()
        self.assertEqual(self.rpc.call_count, 4)

    def test_existing_issued_work_is_counted_and_two_workers_cannot_overfill(self):
        execute_inbound_task(self.db, 1)
        self.start()
        self.assertEqual(len(self.jobs), 1)
        def tick():
            with Session(self.engine) as db:
                dispatch.tick(db, 1)
        with ThreadPoolExecutor(max_workers=2) as pool:
            a, b = pool.submit(tick), pool.submit(tick)
            a.result(timeout=10)
            b.result(timeout=10)
        self.assertEqual(len(self.jobs), 1)
        self.run_jobs()
        self.assertEqual(self.rpc.call_count, 2)

    def test_new_rows_are_not_added_to_snapshot_and_batch_can_finish(self):
        self.start()
        dispatch.pause(self.db, 1, 1)
        self.put("inbound_order_detail", id=10, inbound_order_id=1, from_location_id=301, to_location_id=101, detail_type="auto", status="initialize")
        self.db.commit()
        dispatch.resume(self.db, 1, 1)
        for _ in range(4):
            dispatch.tick(self.db, 1)
            self.run_jobs()
            for row in [r for r in self.rows() if r.state == "accepted"]:
                self.callback(row)
        state = dispatch.status(self.db, 1)
        self.assertIsNone(state["batch_id"])
        self.assertEqual(self.rpc.call_count, 6)
        self.assertEqual(self.db.get(Detail, 10).status, "initialize")

    @unittest.skipUnless(os.environ.get("INBOUND_DISPATCH_TEST_URL"), "dedicated PostgreSQL only")
    def test_advisory_gate_is_held_across_commits_on_another_connection(self):
        with dispatch.warehouse_gate(self.db, 1):
            self.db.commit()
            with self.engine.connect() as connection:
                acquired = connection.execute(text("SELECT pg_try_advisory_lock(103001, 1)")).scalar()
                if acquired:
                    connection.execute(text("SELECT pg_advisory_unlock(103001, 1)"))
                connection.commit()
                self.assertFalse(acquired)

    def test_migration_defaults_to_paused_and_refuses_to_drop_live_queue(self):
        from alembic.migration import MigrationContext
        from alembic.operations import Operations
        migration_path = Path(__file__).resolve().parents[1] / "alembic/versions/20261030_0100_a83001in0001_inbound_dispatch.py"
        spec = importlib.util.spec_from_file_location("inbound_migration_test", migration_path)
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        self.db.close()
        for table in (Command.__table__, Batch.__table__, Control.__table__):
            table.drop(self.engine)
        with self.engine.begin() as connection:
            with patch.object(migration, "op", Operations(MigrationContext.configure(connection))):
                migration.upgrade()
        self.assertEqual([row.enabled for row in self.db.query(Control).all()], [False, False])
        self.db.add(Command(warehouse_id=1, detail_id=1, state="pending"))
        self.db.commit()
        # PostgreSQL EXISTS syntax is used by the production downgrade guard.
        if self.engine.dialect.name == "postgresql":
            with self.engine.begin() as connection:
                with patch.object(migration, "op", Operations(MigrationContext.configure(connection))):
                    with self.assertRaisesRegex(RuntimeError, "reconcile"):
                        migration.downgrade()


class InboundDispatchApiTests(unittest.TestCase):
    setUp = InboundDispatchTests.setUp
    put = InboundDispatchTests.put
    cache_details = InboundDispatchTests.cache_details
    def test_permissions_scope_and_idempotent_endpoints(self):
        app = FastAPI()
        app.include_router(api.router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: self.db
        # Reuse the exact permission dependency objects registered by the router.
        for route in api.router.routes:
            for dependency in route.dependant.dependencies:
                if dependency.name == "user":
                    app.dependency_overrides[dependency.call] = lambda: SimpleNamespace(id=1, warehouses=[])
        with TestClient(app) as client, patch.object(api, "user_is_admin", return_value=False):
            base = "/api/v1/masan/inbound-orders/auto-dispatch"
            self.assertEqual(client.get(f"{base}/status", params={"warehouse_id": 1}).status_code, 403)
        with TestClient(app) as client, patch.object(api, "user_is_admin", return_value=True):
            for _ in range(2):
                self.assertEqual(client.post(f"{base}/pause", json={"warehouse_id": 1}).status_code, 200)
                self.assertEqual(client.post(f"{base}/resume", json={"warehouse_id": 1}).status_code, 200)
            self.assertEqual(client.get(f"{base}/status", params={"warehouse_id": 999}).status_code, 404)


if __name__ == "__main__":
    unittest.main()
