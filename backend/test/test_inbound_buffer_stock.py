"""Buffer editing regressions: isolated SQLite, fake cache/ICS, no live services."""
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.update(
    DEBUG="false", DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0", CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://", APP_NAME="inbound-buffer-edit-test",
)

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert, update
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects import postgresql

from app.main import app as registered_app  # Register all ORM relationships.
from app.core.database import Base, get_db
from app.core.dependencies import get_current_user
from app.modules.robot.robot_model import RobotTask
from app.modules.robot import robot_service
from app.modules.warehouse.inbound_order import inbound_order_service
from app.modules.warehouse.inbound_order.inbound_lock import lock_inbound_detail
from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrderAllocation, InboundOrderDetail
from app.modules.warehouse.item_stock import item_stock_api as api
from app.modules.warehouse.item_stock import inbound_buffer_stock_service as service
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.item_stock.item_stock_schema import ItemStockUpdate


class InboundBufferStockTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:", poolclass=StaticPool,
                                    connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.put("warehouse", id=1, code="TEST")
        self.put("zone", id=1, warehouse_id=1, code="Zone_1.1")
        self.put("zone", id=2, warehouse_id=1, code="Zone_storage")
        for identifier, name in [(1, "Base"), (2, "Box")]:
            self.put("unit", id=identifier, name=name)
        self.put("users", id=1, username="test", email="test@example.invalid", hashed_password="unused")
        self.put("item", id=1, sku="SKU-TEST", name="Test item", base_unit=1,
                 max_quantity=9999, min_quantity=0, warehouse_id=1, supplier="TEST")
        self.put("item_unit", id=1, item_id=1, unit_id=2, conversion_factor=10)
        for identifier, name, zone in [(101, "BP01", 1), (201, "G01", 2)]:
            self.put("location", id=identifier, location_name=name, location_code=name,
                     zone_id=zone, warehouse_id=1, is_active=True)
        self.put("inbound_order", id=1, order_code="IN-TEST", warehouse_id=1, created_by_id=1)
        self.put("inbound_order_detail", id=1, inbound_order_id=1,
                 from_location_id=101, to_location_id=201, detail_type="auto", status="initialize")
        for identifier, qty in [(1, 100), (2, 20)]:
            self.put("item_stock", id=identifier, item_id=1, unit_id=1, location_id=101,
                     inbound_order_detail_id=1, quantity=qty, status="in_transit", is_active=True,
                     stock_level=1, lot_number_from="011026", lot_number_to="011026",
                     expiry_date="01/10/2027")
            self.put("inbound_order_allocation", id=identifier, inbound_order_detail_id=1,
                     item_stock_id=identifier, unit_id=1, quantity=qty)
        self.db.commit()
        self.app = FastAPI()
        self.app.include_router(api.router, prefix="/api/v1")
        self.app.dependency_overrides[get_db] = lambda: self.db
        route = next(r for r in api.router.routes if r.path == "/item-stocks/{stock_id}" and "PATCH" in r.methods)
        self.permission = route.dependencies[0].dependency
        self.app.dependency_overrides[self.permission] = lambda: None
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

    def put(self, table, **values):
        self.db.execute(insert(Base.metadata.tables[table]).values(**values))

    def edit(self, body, **kwargs):
        return self.client.patch("/api/v1/item-stocks/1", json=body,
                                 params={"inbound_buffer_location_id": 101}, **kwargs)

    def stock(self, identifier=1):
        self.db.expire_all()
        return self.db.get(ItemStock, identifier)

    def add_task(self, identifier=1, status=None):
        self.put("robot_task", id=identifier, inbound_order_detail_id=1,
                 order_id=f"TASK-{identifier}", quantity=120, process_code="TEST",
                 system_code="TEST", task_order_detail='[{"taskPath":"BP01,G01"}]')
        if status:
            self.put("task_status", order_id=f"TASK-{identifier}", status=status)
        self.db.commit()

    def callback(self):
        with (
            patch("app.modules.masan.masan_auto_service.receive_callback", return_value=(False, None)),
            patch.object(robot_service, "cache_get", return_value=None),
            patch.object(robot_service, "check_and_create_notifications_under_over_min_max"),
            patch.object(robot_service.task_status_service, "_distance_m", return_value=0),
            patch.object(robot_service.robot_telemetry, "get_robot_data", return_value=None),
            patch.object(robot_service, "publish_robot_task_completed"),
        ):
            return robot_service.task_status_service._receive_task_status(
                self.db, {"orderId": "TASK-1", "status": "8", "deviceNum": "TEST"})

    def test_edit_before_dispatch_updates_only_selected_stock_and_allocation(self):
        response = self.edit({"quantity": 90, "lot_number_from": "071026",
                              "lot_number_to": "081026", "expiry_date": None})
        self.assertEqual(response.status_code, 200, response.text)
        stock = self.stock()
        self.assertEqual((stock.quantity, stock.lot_number_from, stock.lot_number_to, stock.expiry_date),
                         (90, "071026", "081026", None))
        self.assertEqual(self.db.get(InboundOrderAllocation, 1).quantity, 90)
        self.assertEqual(self.stock(2).quantity, 20)

    def test_issued_and_running_tasks_are_retotalled_without_sending_ics(self):
        self.add_task()
        self.add_task(2, "6")
        self.add_task(3, "7")
        self.add_task(4, "3")
        self.db.execute(update(InboundOrderDetail).values(status="issued"))
        self.db.commit()
        with patch.object(robot_service.task_status_service, "add_task") as send:
            response = self.edit({"quantity": 90})
        self.assertEqual(response.status_code, 200, response.text)
        send.assert_not_called()
        self.assertEqual([self.db.get(RobotTask, i).quantity for i in range(1, 5)], [110, 110, 120, 120])

    def test_unit_conversion_and_zero_are_exact(self):
        self.db.execute(update(InboundOrderAllocation).where(InboundOrderAllocation.id == 1).values(unit_id=2, quantity=10))
        self.db.commit()
        self.assertEqual(self.edit({"quantity": 90}).status_code, 200)
        self.assertEqual(self.db.get(InboundOrderAllocation, 1).quantity, 9)
        self.assertEqual(self.edit({"quantity": 0}).status_code, 200)
        self.assertEqual(self.stock().quantity, 0)
        self.assertEqual(self.db.get(InboundOrderAllocation, 1).quantity, 0)

    def test_dispatch_after_edit_uses_new_total(self):
        self.assertEqual(self.edit({"quantity": 90}).status_code, 200)
        with (
            patch("app.modules.masan.masan_auto_service.guarded_robot_submission",
                  side_effect=lambda db, task, operation: operation()),
            patch.object(robot_service.task_status_service, "add_task", return_value={"code": 1000}) as send,
        ):
            result = inbound_order_service.execute_inbound_task(self.db, 1)
        self.assertEqual(result.robot_task.quantity, 110)
        self.assertEqual(send.call_count, 1)
        self.assertNotIn("quantity", send.call_args.args[0])

    def test_completed_task_history_keeps_original_quantity(self):
        self.add_task(1, "8")
        self.assertEqual(self.edit({"quantity": 90}).status_code, 200)
        self.assertEqual(self.db.get(RobotTask, 1).quantity, 120)

    def test_inexact_conversion_rejects_the_entire_edit(self):
        self.db.execute(update(InboundOrderAllocation).where(InboundOrderAllocation.id == 1).values(unit_id=2, quantity=10))
        self.db.commit()
        response = self.edit({"quantity": 91, "expiry_date": "changed"})
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual((self.stock().quantity, self.stock().expiry_date), (100, "01/10/2027"))
        self.assertEqual(self.db.get(InboundOrderAllocation, 1).quantity, 10)

    def test_lot_and_expiry_can_be_cleared_without_changing_quantity(self):
        self.assertEqual(self.edit({"lot_number_from": None, "lot_number_to": None, "expiry_date": None}).status_code, 200)
        stock = self.stock()
        self.assertEqual((stock.lot_number_from, stock.lot_number_to, stock.expiry_date, stock.quantity), (None, None, None, 100))

    def test_no_scope_parameter_preserves_legacy_stock_only_update(self):
        response = self.client.patch("/api/v1/item-stocks/1", json={"quantity": 90})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stock().quantity, 90)
        self.assertEqual(self.db.get(InboundOrderAllocation, 1).quantity, 100)

    def test_hierarchical_and_ambiguous_stocks_are_not_changed(self):
        self.put("item_stock_relation", parent_stock_id=1, child_stock_id=2, relation_type="packing")
        self.db.commit()
        response = self.edit({"quantity": 90})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "inbound_stock_conflict")
        self.assertEqual(self.stock().quantity, 100)
        self.db.execute(Base.metadata.tables["item_stock_relation"].delete())
        self.put("inbound_order_allocation", id=3, inbound_order_detail_id=1, item_stock_id=1, quantity=5, unit_id=1)
        self.db.commit()
        self.assertEqual(self.edit({"quantity": 90}).status_code, 409)

    def test_invalid_fields_and_quantities_are_rejected(self):
        for body, status in [({"item_id": 1}, 400), ({"status": "available"}, 400),
                             ({"location_id": 201}, 400), ({"quantity": None}, 400),
                             ({"quantity": 1.5}, 400), ({"quantity": -1}, 422)]:
            with self.subTest(body=body):
                self.assertEqual(self.edit(body).status_code, status)
                self.assertEqual(self.stock().quantity, 100)

    def test_buffer_location_and_active_stock_are_revalidated(self):
        for values in [{"location_id": 201}, {"is_active": False}]:
            self.db.execute(update(ItemStock).where(ItemStock.id == 1).values(**values))
            self.db.commit()
            response = self.edit({"quantity": 90})
            self.assertEqual(response.status_code, 409)
            self.assertEqual(response.json()["detail"]["code"], "inbound_buffer_changed")
            self.db.execute(update(ItemStock).where(ItemStock.id == 1).values(location_id=101, is_active=True))
            self.db.commit()

    def test_permission_is_still_required(self):
        def denied():
            raise HTTPException(status_code=403, detail="Permission denied")
        self.app.dependency_overrides[self.permission] = denied
        self.assertEqual(self.edit({"quantity": 90}).status_code, 403)
        self.assertEqual(self.stock().quantity, 100)

    def use_authenticated_user(self, role, *, permissions=(), warehouses=(1,)):
        # Exercise the real permission dependency, not a blanket permission mock.
        self.app.dependency_overrides.pop(self.permission, None)
        user = SimpleNamespace(
            roles=[SimpleNamespace(name=role, permissions=[SimpleNamespace(code=p) for p in permissions])],
            warehouses=[SimpleNamespace(id=identifier) for identifier in warehouses],
        )
        self.app.dependency_overrides[get_current_user] = lambda: user

    def test_inbound_worker_can_edit_buffer_without_general_stock_permission(self):
        self.use_authenticated_user("inbound", permissions=("inbound:read", "inbound:update"))
        response = self.edit({"quantity": 90, "expiry_date": None})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.stock().quantity, 90)
        self.assertEqual(self.db.get(InboundOrderAllocation, 1).quantity, 90)

    def test_inbound_permission_cannot_edit_stock_without_buffer_scope(self):
        self.use_authenticated_user("inbound", permissions=("inbound:update",))
        response = self.client.patch("/api/v1/item-stocks/1", json={"quantity": 90})
        self.assertEqual(response.status_code, 403, response.text)
        self.assertEqual(self.stock().quantity, 100)

    def test_inbound_worker_cannot_edit_unassigned_warehouse(self):
        for warehouses in ((), (2,)):
            with self.subTest(warehouses=warehouses):
                self.use_authenticated_user("inbound", permissions=("inbound:update",), warehouses=warehouses)
                response = self.edit({"quantity": 90})
                self.assertEqual(response.status_code, 403, response.text)
                self.assertEqual(self.stock().quantity, 100)

    def test_inbound_permission_cannot_change_sku_location_unit_or_status(self):
        self.use_authenticated_user("inbound", permissions=("inbound:update",))
        for body in ({"item_id": 1}, {"location_id": 201}, {"unit_id": 2}, {"status": "available"}):
            with self.subTest(body=body):
                self.assertEqual(self.edit(body).status_code, 400)
                self.assertEqual(self.stock().quantity, 100)

    def test_scope_cannot_be_forged_to_edit_stock_in_storage_or_another_buffer(self):
        self.use_authenticated_user("inbound", permissions=("inbound:update",))
        self.db.execute(update(ItemStock).where(ItemStock.id == 1).values(location_id=201))
        self.db.commit()
        for location_id in (101, 201):
            with self.subTest(location_id=location_id):
                response = self.client.patch("/api/v1/item-stocks/1", json={"quantity": 90},
                                             params={"inbound_buffer_location_id": location_id})
                self.assertEqual(response.status_code, 409, response.text)
                self.assertEqual(self.stock().quantity, 100)

    def test_other_roles_and_read_only_inbound_are_still_denied(self):
        for role, permissions in (("inbound", ("inbound:read",)), ("outbound", ("outbound:update",)),
                                  ("stocktake", ("stocktake:update",)), ("viewer", ())):
            with self.subTest(role=role):
                self.use_authenticated_user(role, permissions=permissions)
                self.assertEqual(self.edit({"quantity": 90}).status_code, 403)
                self.assertEqual(self.stock().quantity, 100)

    def test_existing_admin_operator_and_stock_editor_access_is_preserved(self):
        for role, permissions in (("admin", ()), ("operator", ()), ("stock_editor", ("item_stock:update",))):
            with self.subTest(role=role):
                self.use_authenticated_user(role, permissions=permissions, warehouses=())
                response = self.client.patch("/api/v1/item-stocks/1", json={"quantity": 90})
                self.assertEqual(response.status_code, 200, response.text)

    def test_buffer_edit_still_requires_authentication(self):
        self.app.dependency_overrides.pop(self.permission, None)
        self.assertEqual(self.edit({"quantity": 90}).status_code, 403)
        self.assertEqual(self.stock().quantity, 100)

    def test_failure_after_flush_rolls_back_stock_and_allocation(self):
        with patch.object(self.db, "commit", side_effect=RuntimeError("simulated failure")):
            with self.assertRaises(RuntimeError):
                service.update_inbound_buffer_stock(self.db, 1, ItemStockUpdate(quantity=90), 101)
        self.assertEqual(self.stock().quantity, 100)
        self.assertEqual(self.db.get(InboundOrderAllocation, 1).quantity, 100)

    def test_edit_then_callback_moves_the_new_quantity_and_records_it(self):
        self.add_task()
        self.assertEqual(self.edit({"quantity": 90}).status_code, 200)
        self.callback()
        self.assertEqual((self.stock().quantity, self.stock().location_id), (90, 201))
        rows = self.db.execute(Base.metadata.tables["transaction"].select()).all()
        self.assertEqual(sorted(row.quantity for row in rows), [20, 90])

    def test_callback_then_edit_cannot_change_already_received_stock(self):
        self.add_task()
        self.callback()
        response = self.edit({"quantity": 90})
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.stock().quantity, 100)
        self.assertEqual(self.db.get(InboundOrderAllocation, 1).quantity, 100)

    def test_stale_stock_in_identity_map_is_refreshed_before_edit(self):
        stale = self.stock()
        self.db.execute(update(ItemStock).where(ItemStock.id == 1).values(location_id=201),
                        execution_options={"synchronize_session": False})
        self.db.flush()
        self.assertEqual(stale.location_id, 101)
        with self.assertRaises(service.InboundBufferStockConflict):
            service.update_inbound_buffer_stock(self.db, 1, ItemStockUpdate(quantity=90), 101)

    def test_detail_lock_uses_postgres_for_update_without_nullable_joins(self):
        lock_inbound_detail(self.db, 1)
        # A real PostgreSQL compilation catches outer-join locking regressions.
        from sqlalchemy.orm import lazyload
        statement = self.db.query(InboundOrderDetail).options(lazyload("*")).with_for_update(of=InboundOrderDetail).statement
        sql = str(statement.compile(dialect=postgresql.dialect()))
        self.assertIn("FOR UPDATE OF inbound_order_detail", sql)
        self.assertNotIn("JOIN", sql)


if __name__ == "__main__":
    unittest.main()
