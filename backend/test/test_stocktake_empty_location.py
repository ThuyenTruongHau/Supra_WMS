"""Stocktake regression tests: SQLite only, no lifespan, Redis or robot calls."""

import os
import unittest

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="stocktake-regression-test",
)

from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, insert
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.database import Base, get_db
from app.modules.warehouse.stocktake import stocktake_api as api
from app.modules.warehouse.stocktake import stocktake_service as service
from app.modules.warehouse.stocktake.stocktake_model import Stocktake, StocktakeItemStock
from app.modules.warehouse.stocktake.stocktake_schema import (
    StocktakeAddItemRequest, StocktakeCreate, StocktakeRecordCountRequest,
)
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.auth.auth_model import User


class EmptyLocationStocktakeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite+pysqlite:///:memory:", poolclass=StaticPool,
                                    connect_args={"check_same_thread": False})
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.addCleanup(self.engine.dispose)
        self.addCleanup(self.db.close)
        self.put("warehouse", id=1, code="TEST")
        self.put("warehouse", id=2, code="OTHER")
        self.put("unit", id=1, name="Thung")
        self.put("users", id=1, username="counter", email="counter@example.invalid", hashed_password="unused")
        for identifier, warehouse, active in [(1, 1, True), (2, 2, True), (3, 1, False)]:
            self.put("item", id=identifier, sku=f"SKU-{identifier}", name="Test item", base_unit=1,
                     warehouse_id=warehouse, is_active=active, max_quantity=9999, min_quantity=0, supplier="TEST")
            self.put("location", id=identifier, location_name=f"VT{identifier}", location_code=f"NODE{identifier}",
                     warehouse_id=warehouse, is_active=active)
        # A cleared stock retains historical quantity, but must never be reused.
        self.put("item_stock", id=1, item_id=1, location_id=1, unit_id=1, quantity=88,
                 lot_number_from="011026", lot_number_to="011026", status="available", is_active=False)
        self.db.commit()

    def put(self, table, **values):
        return self.db.execute(insert(Base.metadata.tables[table]).values(**values))

    def create(self, locations=None, **filters):
        locations = [1] if locations is None else locations
        body = StocktakeCreate(warehouse_id=1, location_ids=locations, **filters)
        return service.create_stocktake(self.db, body, location_ids=body.location_ids,
            item_ids=body.item_ids, lot_numbers=body.lot_numbers, created_by_id=1)

    def add(self, stocktake_id, **values):
        data = dict(item_id=1, location_id=1, lot_number="011026", actual_quantity=12)
        data.update(values)
        return service.add_stocktake_item(self.db, stocktake_id, StocktakeAddItemRequest(**data))

    def test_empty_location_creates_empty_checklist_without_restoring_history(self):
        header = self.create()
        self.assertEqual(service.get_stocktake_detail(self.db, header.id).items, [])
        old = self.db.get(ItemStock, 1)
        self.assertEqual(old.quantity, 88)
        self.assertFalse(old.is_active)

    def test_invalid_inactive_or_other_warehouse_location_is_rejected(self):
        for location_ids in ([99], [2], [3], [1, 2]):
            with self.subTest(locations=location_ids), self.assertRaises(ValueError):
                self.create(location_ids)
            self.assertEqual(self.db.query(Stocktake).count(), 0)

    def test_item_scope_still_reports_no_stock(self):
        with self.assertRaisesRegex(ValueError, "No stock found for the selected product codes"):
            self.create([], item_ids=[1])

    def test_mixed_scope_keeps_existing_stock_and_allows_empty_location(self):
        self.put("location", id=4, location_name="VT4", location_code="NODE4", warehouse_id=1)
        self.put("item_stock", id=2, item_id=1, location_id=4, unit_id=1, quantity=5, is_active=True)
        self.db.commit()
        header = self.create([1, 4])
        detail = service.get_stocktake_detail(self.db, header.id)
        self.assertEqual([(row.location_id, row.desired_quantity) for row in detail.items], [(4, 5)])
        self.assertEqual(self.add(header.id).desired_quantity, 0)

    def test_add_then_confirm_activates_only_new_stock(self):
        header = self.create()
        row = self.add(header.id)
        self.assertEqual((row.desired_quantity, row.actual_quantity, row.status), (0, 12, "in_progress"))
        stock = self.db.get(ItemStock, row.item_stock_id)
        self.assertEqual((stock.quantity, stock.is_active, stock.unit_id), (0, False, 1))
        confirmed = service.confirm_quantity_for_stock(self.db, header.id, row.id)
        self.assertEqual(confirmed.status, "discrepancy")
        self.db.refresh(stock)
        self.assertEqual((stock.quantity, stock.is_active), (12, True))
        self.assertEqual((self.db.get(ItemStock, 1).quantity, self.db.get(ItemStock, 1).is_active), (88, False))
        with self.assertRaisesRegex(ValueError, "not pending"):
            service.confirm_quantity_for_stock(self.db, header.id, row.id)

    def test_zero_count_stays_inactive(self):
        header = self.create()
        row = self.add(header.id, actual_quantity=0)
        result = service.confirm_quantity_for_stock(self.db, header.id, row.id)
        self.assertEqual(result.status, "completed")
        self.assertFalse(self.db.get(ItemStock, row.item_stock_id).is_active)

    def test_old_pending_count_cannot_restore_stock_cleared_after_counting(self):
        old = self.db.get(ItemStock, 1)
        old.is_active = True
        self.db.commit()
        header = self.create()
        row = service.get_stocktake_detail(self.db, header.id).items[0]
        service.record_stocktake_item_count(self.db, header.id, row.id, StocktakeRecordCountRequest(actual_quantity=88))
        old.is_active = False
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "đã được clear"):
            service.confirm_quantity_for_stock(self.db, header.id, row.id)
        self.assertFalse(old.is_active)
        # A fresh physical count is allowed without reusing that historical row.
        new_row = self.add(header.id)
        self.assertNotEqual(new_row.item_stock_id, old.id)

    def test_duplicate_pending_count_across_sessions_is_rejected(self):
        first = self.create()
        self.add(first.id)
        second = self.create()
        with self.assertRaisesRegex(ValueError, "chưa xác nhận"):
            self.add(second.id)
        self.assertEqual(self.db.query(StocktakeItemStock).count(), 1)

    def test_existing_active_sku_lot_is_rejected_but_other_lot_is_allowed(self):
        first = self.create()
        row = self.add(first.id)
        service.confirm_quantity_for_stock(self.db, first.id, row.id)
        with self.assertRaisesRegex(ValueError, "đã có tồn"):
            self.add(first.id)
        self.assertEqual(self.add(first.id, lot_number="021026").lot_number, "02/10/26")

    def test_stock_arriving_before_confirmation_does_not_get_duplicated(self):
        header = self.create()
        row = self.add(header.id)
        self.put("item_stock", item_id=1, location_id=1, unit_id=1, quantity=9, is_active=True,
                 lot_number_from="011026", lot_number_to="011026")
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "đã có tồn mới"):
            service.confirm_quantity_for_stock(self.db, header.id, row.id)
        self.assertEqual(self.db.get(ItemStock, row.item_stock_id).quantity, 0)

    def test_add_rejects_wrong_warehouse_inactive_item_and_invalid_location(self):
        header = self.create()
        for values in ({"item_id": 2}, {"item_id": 3}, {"location_id": 2}, {"location_id": 3}):
            with self.subTest(values=values), self.assertRaises(ValueError):
                self.add(header.id, **values)
            self.db.rollback()
        self.assertEqual(self.db.query(ItemStock).count(), 1)

    def test_existing_stock_count_and_confirm_still_work(self):
        old = self.db.get(ItemStock, 1)
        old.is_active = True
        self.db.commit()
        header = self.create()
        row = service.get_stocktake_detail(self.db, header.id).items[0]
        service.record_stocktake_item_count(self.db, header.id, row.id, StocktakeRecordCountRequest(actual_quantity=80))
        service.confirm_quantity_for_stock(self.db, header.id, row.id)
        self.db.refresh(old)
        self.assertEqual((old.quantity, old.is_active), (80, True))

    def test_payload_validation(self):
        for values in ({"actual_quantity": -1}, {"lot_number": " "}, {"status": "in_transit"}):
            with self.subTest(values=values), self.assertRaises(ValidationError):
                StocktakeAddItemRequest(**(dict(item_id=1, location_id=1, lot_number="011026", actual_quantity=2) | values))

    def test_api_create_add_get_confirm_roundtrip(self):
        overrides = dict(app.dependency_overrides)
        self.addCleanup(lambda: (app.dependency_overrides.clear(), app.dependency_overrides.update(overrides)))
        app.dependency_overrides[get_db] = lambda: self.db
        for dependency in (api._STOCKTAKE_READ, api._STOCKTAKE_CREATE, api._STOCKTAKE_UPDATE):
            app.dependency_overrides[dependency] = lambda: self.db.get(User, 1)
        client = TestClient(app)
        self.addCleanup(client.close)
        response = client.post("/api/v1/stocktakes", json={"warehouse_id": 1, "location_ids": [1]})
        self.assertEqual(response.status_code, 201, response.text)
        identifier = response.json()["id"]
        response = client.post(f"/api/v1/stocktakes/{identifier}/items", json={
            "item_id": 1, "location_id": 1, "lot_number": "011026", "actual_quantity": 12,
        })
        self.assertEqual(response.status_code, 201, response.text)
        row = response.json()
        self.assertEqual(client.get(f"/api/v1/stocktakes/{identifier}").json()["items"][0]["actual_quantity"], 12)
        response = client.post(f"/api/v1/stocktakes/{identifier}/items/{row['id']}/confirm-quantity", json={})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(self.db.get(ItemStock, row["item_stock_id"]).is_active)
        response = client.post(f"/api/v1/stocktakes/{identifier}/items", json={
            "item_id": 1, "location_id": 1, "lot_number": "011026", "actual_quantity": -1,
        })
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
