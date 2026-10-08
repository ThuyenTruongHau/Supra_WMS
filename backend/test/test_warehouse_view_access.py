"""Warehouse viewer authorization tests without a database or live warehouse."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.modules.warehouse.location_map import location_service
from app.modules.warehouse.location_map.location_api import router


def make_user(role_name, *, warehouses=(1,), permissions=()):
    return SimpleNamespace(
        roles=[
            SimpleNamespace(
                name=role_name,
                permissions=[SimpleNamespace(code=code) for code in permissions],
            )
        ],
        warehouses=[SimpleNamespace(id=warehouse_id) for warehouse_id in warehouses],
    )


class WarehouseViewAccessTests(unittest.TestCase):
    def setUp(self):
        self.user = make_user("inbound", permissions=("inbound:read",))
        self.app = FastAPI()
        self.app.include_router(router, prefix="/api/v1")
        self.app.dependency_overrides[get_current_user] = lambda: self.user
        self.app.dependency_overrides[get_db] = lambda: object()
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)

        self.map_data = {
            "width": 2000,
            "height": 1000,
            "nodeKeys": ["x", "y", "type", "content", "name"],
            "lineKeys": [],
            "nodeArr": [[300, 300, 12, "ST01", "Kệ 01"]],
            "lineArr": [],
        }
        map_patch = patch.object(location_service, "get_map_data", return_value=self.map_data)
        self.map_service = map_patch.start()
        self.addCleanup(map_patch.stop)
        status_patch = patch.object(
            location_service,
            "list_locations_for_map",
            side_effect=lambda _db, warehouse_id: {
                "warehouse_id": warehouse_id,
                "location_codes": [],
                "locations": [],
            },
        )
        self.status_service = status_patch.start()
        self.addCleanup(status_patch.stop)

    def get_view(self, warehouse_id):
        return (
            self.client.get(f"/api/v1/warehouse-maps/{warehouse_id}/map-data"),
            self.client.get(
                "/api/v1/locations/for-map", params={"warehouse_id": warehouse_id}
            ),
        )

    def test_inbound_module_can_read_map_and_status_without_admin_map_permissions(self):
        map_response, status_response = self.get_view(1)
        self.assertEqual(map_response.status_code, 200)
        self.assertEqual(map_response.json(), {**self.map_data, "type": None, "xAttrMin": None, "yAttrMin": None})
        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(status_response.json()["warehouse_id"], 1)

    def test_all_assigned_warehouses_are_readable(self):
        self.user = make_user("inbound", warehouses=(1, 2))
        for warehouse_id in (1, 2):
            with self.subTest(warehouse_id=warehouse_id):
                for response in self.get_view(warehouse_id):
                    self.assertEqual(response.status_code, 200)

    def test_inbound_cannot_read_unassigned_warehouse_even_with_map_permissions(self):
        self.user = make_user("inbound", permissions=("map:read", "location:read"))
        for response in self.get_view(2):
            self.assertEqual(response.status_code, 403)
            self.assertEqual(response.json(), {"detail": "Warehouse access denied"})
        self.map_service.assert_not_called()
        self.status_service.assert_not_called()

    def test_no_warehouse_assignment_does_not_grant_access(self):
        self.user = make_user("inbound", warehouses=())
        for response in self.get_view(1):
            self.assertEqual(response.status_code, 403)

    def test_map_path_warehouse_cannot_be_overridden_by_query_string(self):
        response = self.client.get(
            "/api/v1/warehouse-maps/2/map-data", params={"warehouse_id": 1}
        )
        self.assertEqual(response.status_code, 403)
        self.map_service.assert_not_called()

    def test_read_access_does_not_grant_import_preview_import_or_export(self):
        for path in ("/warehouse-maps/import/preview", "/warehouse-maps/import"):
            with self.subTest(path=path):
                response = self.client.post(
                    "/api/v1" + path,
                    data={"warehouse_id": "1"},
                    files={"file": ("map.zip", b"fake zip", "application/zip")},
                )
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json(), {"detail": "Insufficient permissions"})
        response = self.client.get("/api/v1/warehouse-maps/1/export")
        self.assertEqual(response.status_code, 403)

    def test_admin_and_wildcard_access_are_unchanged(self):
        for role, permissions in (("admin", ()), ("custom_admin", ("*",))):
            with self.subTest(role=role):
                self.user = make_user(role, warehouses=(), permissions=permissions)
                for response in self.get_view(2):
                    self.assertEqual(response.status_code, 200)

    def test_existing_read_permissions_and_legacy_operator_still_work(self):
        for user in (
            make_user("viewer", permissions=("map:read", "location:read")),
            make_user("operator", permissions=("location:read",)),
        ):
            with self.subTest(role=user.roles[0].name):
                self.user = user
                for response in self.get_view(1):
                    self.assertEqual(response.status_code, 200)

    def test_other_roles_without_read_permissions_are_denied(self):
        for role in ("viewer", "outbound", "stocktake"):
            with self.subTest(role=role):
                self.user = make_user(role)
                for response in self.get_view(1):
                    self.assertEqual(response.status_code, 403)
        self.map_service.assert_not_called()
        self.status_service.assert_not_called()

    def test_authentication_is_still_required(self):
        del self.app.dependency_overrides[get_current_user]
        for response in self.get_view(1):
            self.assertEqual(response.status_code, 403)
        self.map_service.assert_not_called()
        self.status_service.assert_not_called()


if __name__ == "__main__":
    unittest.main()
