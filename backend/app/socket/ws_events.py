"""Redis pub/sub events for WebSocket broadcast (Celery-safe)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Literal

from app.core.cache import get_redis
from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger("main")

RobotFlow = Literal["inbound", "outbound"]

EVENT_ROBOT_TASK_COMPLETED = "robot.task.completed"


def warehouse_ws_channel(warehouse_id: int) -> str:
    prefix = settings.redis_key_prefix.strip(":")
    return f"{prefix}:ws:warehouse:{warehouse_id}"


def warehouse_ws_pubsub_pattern() -> str:
    prefix = settings.redis_key_prefix.strip(":")
    return f"{prefix}:ws:warehouse:*"


def publish_robot_task_completed(
    warehouse_id: int,
    order_id: str,
    flow: RobotFlow,
) -> None:
    if warehouse_id <= 0:
        return
    payload = {
        "type": EVENT_ROBOT_TASK_COMPLETED,
        "warehouse_id": warehouse_id,
        "order_id": order_id,
        "flow": flow,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    channel = warehouse_ws_channel(warehouse_id)
    try:
        get_redis().publish(channel, json.dumps(payload))
        logger.info(
            "WS publish robot.task.completed warehouse_id=%s order_id=%s flow=%s",
            warehouse_id,
            order_id,
            flow,
        )
    except Exception as exc:
        logger.error("Failed to publish WS event: %s", exc)


# --- Masan sorting zone (CC) ---

MasanSortingZoneEvent = Literal[
    "masan.sorting.stock_ready",
    "masan.sorting.allocation_confirmed",
    "masan.cc.assign_updated",
]

EVENT_MASAN_SORTING_STOCK_READY = "masan.sorting.stock_ready"


def normalize_masan_zone(zone: str) -> str:
    return (zone or "").strip()


def masan_zone_ws_channel(warehouse_id: int, zone: str) -> str:
    prefix = settings.redis_key_prefix.strip(":")
    z = normalize_masan_zone(zone)
    return f"{prefix}:ws:masan-zone:{warehouse_id}:{z}"


def masan_zone_ws_pubsub_pattern() -> str:
    prefix = settings.redis_key_prefix.strip(":")
    return f"{prefix}:ws:masan-zone:*"


def publish_masan_sorting_zone(
    warehouse_id: int,
    zone: str,
    *,
    event_type: str,
    data: dict | None = None,
) -> None:
    if warehouse_id <= 0:
        return
    z = normalize_masan_zone(zone)
    if not z:
        return
    payload = {
        "type": event_type,
        "warehouse_id": warehouse_id,
        "zone": z,
        "data": data or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    channel = masan_zone_ws_channel(warehouse_id, z)
    try:
        get_redis().publish(channel, json.dumps(payload, default=str))
        logger.info(
            "WS publish masan zone warehouse_id=%s zone=%s type=%s",
            warehouse_id,
            z,
            event_type,
        )
    except Exception as exc:
        logger.error("Failed to publish Masan zone WS event: %s", exc)