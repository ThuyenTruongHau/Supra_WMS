"""Robot telemetry API tests using an isolated app and an expiring Redis fake."""

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError

from app.core import cache
from app.core.config import Settings, settings
from app.core.dependencies import get_current_user
from app.modules.robot.robot_api import router


class ExpiringRedis:
    def __init__(self):
        self.now = 0
        self.values = {}
        self.unavailable = False

    def _check_connection(self):
        if self.unavailable:
            raise ConnectionError("Redis unavailable in test")

    def setex(self, key, ttl, value):
        self._check_connection()
        self.values[key] = (value, self.now + ttl)

    def get(self, key):
        self._check_connection()
        value, expiry = self.values.get(key, (None, 0))
        return value if self.now < expiry else None


class RobotDataApiTests(unittest.TestCase):
    def setUp(self):
        self.redis = ExpiringRedis()
        self.redis_patch = patch.object(cache, "_redis", self.redis)
        self.redis_patch.start()
        self.addCleanup(self.redis_patch.stop)
        self.ttl_patch = patch.object(settings, "robot_data_ttl_seconds", 30)
        self.ttl_patch.start()
        self.addCleanup(self.ttl_patch.stop)

        self.app = FastAPI()
        self.app.include_router(router, prefix="/api/v1")
        self.app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
        self.client = TestClient(self.app)
        self.addCleanup(self.client.close)
        self.url = "/api/v1/robot_data"
        self.robots = [
            {
                "deviceCode": "EE49822BAK00001",
                "deviceName": "FL1",
                "state": "Idle",
                "deviceStatus": 1,
                "battery": "65",
                "devicePostionRec": [121840, 46581],
                "vendorField": {"value": "retained"},
            },
            {
                "deviceCode": "EE49822BAK00002",
                "deviceName": "FL2",
                "state": "Offline",
                "deviceStatus": 0,
            },
        ]

    def test_unauthenticated_post_and_authenticated_get_round_trip(self):
        response = self.client.post(self.url, json=self.robots)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"code": 1000})
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), self.robots)
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_get_requires_authentication_but_post_does_not(self):
        self.app.dependency_overrides.clear()
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.assertEqual(self.client.post(self.url, json=self.robots).status_code, 200)

    def test_snapshot_replaces_previous_robots_and_can_be_cleared(self):
        self.client.post(self.url, json=self.robots)
        replacement = [{"deviceCode": "EE49822BAK00002", "state": "InCharging"}]
        self.assertEqual(self.client.post(self.url, json=replacement).status_code, 200)
        self.assertEqual(self.client.get(self.url).json(), replacement)
        self.client.post(self.url, json=[])
        self.assertEqual(self.client.get(self.url).json(), [])

    def test_no_data_and_expired_data_return_empty_list(self):
        self.assertEqual(self.client.get(self.url).json(), [])
        self.client.post(self.url, json=self.robots)
        self.redis.now = 29
        self.assertEqual(self.client.get(self.url).json(), self.robots)
        self.redis.now = 30
        self.assertEqual(self.client.get(self.url).json(), [])

    def test_new_snapshot_renews_configurable_ttl(self):
        with patch.object(settings, "robot_data_ttl_seconds", 10):
            self.client.post(self.url, json=self.robots)
            self.redis.now = 9
            self.client.post(self.url, json=self.robots)
            self.redis.now = 10
            self.assertEqual(self.client.get(self.url).json(), self.robots)
            self.redis.now = 19
            self.assertEqual(self.client.get(self.url).json(), [])

    def test_invalid_payload_does_not_replace_valid_data(self):
        self.client.post(self.url, json=self.robots)
        for invalid in [
            {},
            ["not a robot"],
            [{"state": "Idle"}],
            [{"deviceCode": ""}],
            [{"deviceCode": "   "}],
            [{"deviceCode": None}],
            [{"deviceCode": 123}],
            [self.robots[0], {"deviceCode": ""}],
        ]:
            with self.subTest(payload=invalid):
                self.assertEqual(self.client.post(self.url, json=invalid).status_code, 422)
                self.assertEqual(self.client.get(self.url).json(), self.robots)

    def test_device_code_is_trimmed_and_unknown_states_are_preserved(self):
        payload = [{"deviceCode": " EE49822BAK00001 ", "state": "Paused", "deviceStatus": 9}]
        self.client.post(self.url, json=payload)
        self.assertEqual(
            self.client.get(self.url).json(),
            [{"deviceCode": "EE49822BAK00001", "state": "Paused", "deviceStatus": 9}],
        )

    def test_redis_failure_returns_503_without_success_acknowledgement(self):
        self.redis.unavailable = True
        for response in [
            self.client.post(self.url, json=self.robots),
            self.client.get(self.url),
        ]:
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("code", response.json())

    def test_robot_ttl_setting_must_be_positive(self):
        for ttl in [0, -1]:
            with self.subTest(ttl=ttl), self.assertRaises(ValueError):
                Settings(_env_file=None, robot_data_ttl_seconds=ttl)


if __name__ == "__main__":
    unittest.main()
