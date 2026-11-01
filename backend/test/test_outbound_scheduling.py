"""Coordinator/callback contention regressions; no live DB, Redis or robot calls."""
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from threading import Event, Lock, RLock
import unittest
from unittest.mock import Mock, patch

# Installs isolated environment settings before importing the application.
from test import test_outbound_remaining_quantity as fixture  # noqa: F401
from app.core import cache
from app.modules.masan import masan_auto_service as auto
from app.modules.masan import masan_celery_task as tasks


def session(dialect="sqlite", acquired=True):
    db = Mock()
    db.info = {}
    engine = db.get_bind.return_value
    engine.dialect.name = dialect
    engine.connect.return_value.execute.return_value.scalar.return_value = acquired
    return db


class OutboundSchedulingTests(unittest.TestCase):
    def setUp(self):
        for name, value in {
            "_locks": defaultdict(RLock),
            "_lock_waiters": defaultdict(int),
            "_waiters_guard": Lock(),
            "_coordinator_lock": Lock(),
        }.items():
            self.enterContext(patch.object(auto, name, value))

    def test_busy_background_tick_returns_without_querying_or_sending(self):
        entered, release = Event(), Event()

        def foreground():
            with auto.warehouse_lock(session(), 1) as acquired:
                self.assertTrue(acquired)
                entered.set()
                self.assertTrue(release.wait(3))

        db = session()
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(foreground)
            try:
                self.assertTrue(entered.wait(3))
                auto.tick_zone(db, 1, 8)
                db.query.assert_not_called()
                db.flush.assert_not_called()
                db.expire_all.assert_not_called()
            finally:
                release.set()
            pending.result(timeout=3)

    def test_waiting_callback_has_priority_even_when_local_lock_becomes_free(self):
        waiting, allow_callback = Event(), Event()
        raw_lock = RLock()

        class PausedForegroundLock:
            def acquire(self, blocking=True):
                if blocking:
                    waiting.set()
                    if not allow_callback.wait(3):
                        raise RuntimeError("test callback was not released")
                return raw_lock.acquire(blocking=blocking)

            def release(self):
                raw_lock.release()

        auto._locks[1] = PausedForegroundLock()
        foreground_db = session()

        def callback():
            with auto.warehouse_lock(foreground_db, 1) as acquired:
                return acquired

        background_db = session()
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(callback)
            try:
                self.assertTrue(waiting.wait(3))
                # The lock itself is free, but a foreground callback has queued.
                with auto.warehouse_lock(background_db, 1, wait=False) as acquired:
                    self.assertFalse(acquired)
                background_db.flush.assert_not_called()
            finally:
                allow_callback.set()
            self.assertTrue(pending.result(timeout=3))
        self.assertEqual(auto._lock_waiters[1], 0)

    def test_nested_lock_does_not_release_outer_warehouse_ownership(self):
        db = session()
        with auto.warehouse_lock(db, 1):
            with auto.warehouse_lock(db, 1, wait=False) as acquired:
                self.assertTrue(acquired)
            self.assertIn(1, db.info["outbound_auto_locks"])
            db.flush.assert_called_once()
        self.assertEqual(db.info["outbound_auto_locks"], set())

    def test_pg_busy_background_does_not_unlock_another_owners_lock(self):
        db = session("postgresql", acquired=False)
        connection = db.get_bind.return_value.connect.return_value
        with auto.warehouse_lock(db, 1, wait=False) as acquired:
            self.assertFalse(acquired)
        statements = [str(call.args[0]) for call in connection.execute.call_args_list]
        self.assertEqual(statements, ["SELECT pg_try_advisory_lock(827010, :warehouse)"])
        connection.close.assert_called_once()
        db.flush.assert_not_called()
        self.assertTrue(auto._locks[1].acquire(blocking=False))
        auto._locks[1].release()

    def test_pg_warehouse_lock_releases_on_operation_failure(self):
        db = session("postgresql")
        connection = db.get_bind.return_value.connect.return_value
        with self.assertRaisesRegex(RuntimeError, "callback failed"):
            with auto.warehouse_lock(db, 1):
                raise RuntimeError("callback failed")
        self.assertIn("pg_advisory_unlock(827010", str(connection.execute.call_args.args[0]))
        connection.close.assert_called_once()
        self.assertEqual(db.info["outbound_auto_locks"], set())
        with auto.warehouse_lock(session(), 1, wait=False) as acquired:
            self.assertTrue(acquired)

    def test_pg_warehouse_lock_releases_when_flush_fails_before_body(self):
        db = session("postgresql")
        db.flush.side_effect = RuntimeError("flush failed")
        connection = db.get_bind.return_value.connect.return_value
        with self.assertRaisesRegex(RuntimeError, "flush failed"):
            with auto.warehouse_lock(db, 1):
                self.fail("failed flush must not enter the operation")
        self.assertIn("pg_advisory_unlock(827010", str(connection.execute.call_args.args[0]))
        connection.close.assert_called_once()
        with auto.warehouse_lock(session(), 1, wait=False) as acquired:
            self.assertTrue(acquired)

    def test_coordinator_overlap_skips_entire_run_before_loading_zones(self):
        first_db, duplicate_db = session(), session()

        @contextmanager
        def db_session():
            yield duplicate_db

        with auto.coordinator_run_lock(first_db) as acquired:
            self.assertTrue(acquired)
            with patch.object(tasks, "db_session", db_session):
                tasks.coordinate_outbound_auto_task.run()
            duplicate_db.query.assert_not_called()
        with auto.coordinator_run_lock(session()) as acquired:
            self.assertTrue(acquired)

    def test_pg_coordinator_contention_closes_connection_without_unlocking(self):
        db = session("postgresql", acquired=False)
        connection = db.get_bind.return_value.connect.return_value
        with auto.coordinator_run_lock(db) as acquired:
            self.assertFalse(acquired)
        self.assertEqual(connection.execute.call_count, 1)
        self.assertIn("pg_try_advisory_lock(827011, 0)", str(connection.execute.call_args.args[0]))
        connection.close.assert_called_once()
        with auto.coordinator_run_lock(session()) as acquired:
            self.assertTrue(acquired)

    def test_pg_coordinator_guard_releases_after_task_failure(self):
        db = session("postgresql")
        connection = db.get_bind.return_value.connect.return_value
        with self.assertRaisesRegex(RuntimeError, "worker operation failed"):
            with auto.coordinator_run_lock(db) as acquired:
                self.assertTrue(acquired)
                raise RuntimeError("worker operation failed")
        self.assertIn("pg_advisory_unlock(827011, 0)", str(connection.execute.call_args.args[0]))
        connection.close.assert_called_once()
        with auto.coordinator_run_lock(session()) as acquired:
            self.assertTrue(acquired)

    def test_pg_acquisition_errors_invalidate_before_close_and_release_local_guard(self):
        guards = {
            "warehouse": lambda db: auto.warehouse_lock(db, 1),
            "coordinator": auto.coordinator_run_lock,
        }
        for name, guard in guards.items():
            for failed_method in ("execute", "commit"):
                with self.subTest(guard=name, failure=failed_method):
                    db = session("postgresql")
                    connection = db.get_bind.return_value.connect.return_value
                    getattr(connection, failed_method).side_effect = RuntimeError("acquisition failed")
                    with self.assertRaisesRegex(RuntimeError, "acquisition failed"):
                        with guard(db):
                            self.fail("failed acquisition must not enter the operation")
                    connection.invalidate.assert_called_once()
                    connection.close.assert_called_once()
                    methods = [call[0] for call in connection.method_calls]
                    self.assertLess(methods.index("invalidate"), methods.index("close"))
                    unlocks = [call for call in connection.execute.call_args_list
                               if "pg_advisory_unlock" in str(call.args[0])]
                    self.assertEqual(unlocks, [])
                    self.assertEqual(db.info.get("outbound_auto_locks", set()), set())
                    with guard(session()) as acquired:
                        self.assertTrue(acquired)

    def test_pg_unlock_failures_invalidate_connection_and_release_local_guard(self):
        guards = {
            "warehouse": lambda db: auto.warehouse_lock(db, 1),
            "coordinator": auto.coordinator_run_lock,
        }
        for name, guard in guards.items():
            for failure in ("rollback", "unlock", "unlock_commit"):
                with self.subTest(guard=name, failure=failure):
                    db = session("postgresql")
                    connection = db.get_bind.return_value.connect.return_value
                    if failure == "rollback":
                        connection.rollback.side_effect = RuntimeError("cleanup failed")
                    elif failure == "unlock":
                        locked = Mock()
                        locked.scalar.return_value = True
                        connection.execute.side_effect = [locked, RuntimeError("cleanup failed")]
                    else:
                        connection.commit.side_effect = [None, RuntimeError("cleanup failed")]
                    with self.assertRaisesRegex(RuntimeError, "cleanup failed"):
                        with guard(db) as acquired:
                            self.assertTrue(acquired)
                    connection.invalidate.assert_called_once()
                    connection.close.assert_called_once()
                    methods = [call[0] for call in connection.method_calls]
                    self.assertLess(methods.index("invalidate"), methods.index("close"))
                    self.assertEqual(db.info.get("outbound_auto_locks", set()), set())
                    with guard(session()) as acquired:
                        self.assertTrue(acquired)

    def test_pg_cleanup_rolls_back_before_unlocking_session_lock(self):
        guards = {
            "warehouse": lambda db: auto.warehouse_lock(db, 1),
            "coordinator": auto.coordinator_run_lock,
        }
        for name, guard in guards.items():
            with self.subTest(guard=name):
                db = session("postgresql")
                connection = db.get_bind.return_value.connect.return_value
                with guard(db) as acquired:
                    self.assertTrue(acquired)
                self.assertEqual(
                    [call[0] for call in connection.method_calls],
                    ["execute", "commit", "rollback", "execute", "commit", "close"],
                )
                statements = [str(call.args[0]) for call in connection.execute.call_args_list]
                self.assertIn("pg_advisory_unlock", statements[-1])
                connection.invalidate.assert_not_called()

    def test_coordinator_releases_read_transaction_before_zones_and_continues_after_zone_error(self):
        coordinator_db = session()
        coordinator_db.query.return_value.all.return_value = [(1, 8), (1, 9)]
        calls = []
        coordinator_db.rollback.side_effect = lambda: calls.append("read_released")
        remaining = [coordinator_db, session(), session()]

        @contextmanager
        def db_session():
            yield remaining.pop(0)

        def tick(db, warehouse_id, zone_id):
            calls.append(zone_id)
            if zone_id == 8:
                raise RuntimeError("first zone failed")

        with patch.object(tasks, "db_session", db_session), patch.object(auto, "tick_zone", side_effect=tick), patch.object(tasks.logger, "exception") as log:
            tasks.coordinate_outbound_auto_task.run()
        self.assertEqual(calls, ["read_released", 8, 9])
        log.assert_called_once()
        self.assertEqual(remaining, [])
        with auto.coordinator_run_lock(session()) as acquired:
            self.assertTrue(acquired)

    def test_wakes_coalesce_and_new_wake_can_be_published_after_expiry(self):
        redis = Mock()
        redis.set.side_effect = [True, False, True]
        with patch.object(auto, "get_redis", return_value=redis), patch.object(tasks.coordinate_outbound_auto_task, "apply_async") as publish:
            auto.wake()
            auto.wake()
            auto.wake()  # Redis reports that the prior NX key has expired.
        self.assertEqual(publish.call_count, 2)
        self.assertEqual(publish.call_args.kwargs, {"expires": 5, "retry": False})
        for call in redis.set.call_args_list:
            self.assertTrue(call.kwargs["nx"])
            self.assertEqual(call.kwargs["ex"], 5)
            self.assertTrue(call.args[0].endswith("outbound:auto:wake"))

    def test_broker_failure_does_not_escape_completed_callback_or_leave_permanent_debounce(self):
        redis = Mock()
        redis.set.return_value = True
        with patch.object(auto, "get_redis", return_value=redis), patch.object(tasks.coordinate_outbound_auto_task, "apply_async", side_effect=RuntimeError("broker unavailable")), patch.object(auto.logger, "exception") as log:
            auto.wake()
        log.assert_called_once()
        # Even when publication fails, the debounce key expires; Beat can retry.
        self.assertEqual(redis.set.call_args.kwargs["ex"], auto.COORDINATOR_WAKE_TTL)

    def test_redis_failure_uses_beat_fallback_without_publishing_or_raising(self):
        with patch.object(auto, "get_redis", side_effect=RuntimeError("Redis unavailable")), patch.object(tasks.coordinate_outbound_auto_task, "apply_async") as publish, patch.object(auto.logger, "exception") as log:
            auto.wake()
        publish.assert_not_called()
        log.assert_called_once()

    def test_redis_response_timeout_bounds_cache_calls_inside_warehouse_lock(self):
        with patch.object(cache, "_redis", None), patch.object(cache.redis, "from_url") as factory:
            cache.get_redis()
        self.assertEqual(factory.call_args.kwargs["socket_connect_timeout"], 5)
        self.assertEqual(factory.call_args.kwargs["socket_timeout"], 5)


if __name__ == "__main__":
    unittest.main()
