"""Latest fleet snapshot shared by API workers through Redis."""

from typing import Any

from app.core.cache import cache_get, cache_set
from app.core.config import settings
from app.modules.robot.robot_schema import RobotTelemetry

ROBOT_TELEMETRY_CACHE_KEY = "robot:telemetry"


def save_robot_data(robots: list[RobotTelemetry]) -> None:
    cache_set(
        ROBOT_TELEMETRY_CACHE_KEY,
        [robot.model_dump() for robot in robots],
        ttl=settings.robot_data_ttl_seconds,
    )

    robot_telemetry.update_robot_data(robots)


def get_robot_data() -> list[dict[str, Any]]:
    return cache_get(ROBOT_TELEMETRY_CACHE_KEY) or []


class RobotTelemetryStore:
    def __init__(self):
        self.device: dict[str, dict[str, Any]] = {}

    def update_robot_data(self, robots: list[RobotTelemetry]) -> None:
        snapshot = [robot.model_dump() for robot in robots]
        self.device = {
            row["deviceName"]: row
            for row in snapshot
            if row.get("deviceName")
        }

    def get_robot_data(self, device_name: str) -> dict[str, Any] | None:
        return self.device.get(device_name)

robot_telemetry = RobotTelemetryStore()