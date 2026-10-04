import asyncio
import contextlib
import json
import re
from typing import Dict, Optional, Set

from fastapi import WebSocket
from sqlalchemy.orm import Session

from app.core.cache import get_redis
from app.core.logger import get_logger
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse
from app.socket.ws_events import warehouse_ws_pubsub_pattern

logger = get_logger("main")

_WAREHOUSE_CHANNEL_RE = re.compile(r":ws:warehouse:(\d+)$")


class WebsocketManager:
    def __init__(self):
        self._pubsub_task: Optional[asyncio.Task] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        self.active_connections: Set[WebSocket] = set()
        self.notification_by_warehouse: Dict[int, Set[WebSocket]] = {}

    async def start(self):
        if self._pubsub_task is None:
            self._pubsub_task = asyncio.create_task(self._redis_pubsub_loop())
        if self._heartbeat_task is None:
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def stop(self) -> None:
        for task in (self._pubsub_task, self._heartbeat_task):
            if task:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
        self._pubsub_task = None
        self._heartbeat_task = None

    async def _heartbeat_loop(self):
        while True:
            await asyncio.sleep(30)
            if not self.active_connections:
                continue
            heartbeat_message = json.dumps({
                "type": "heartbeat",
                "timestamp": asyncio.get_event_loop().time(),
            })
            for connection in list(self.active_connections):
                try:
                    await connection.send_text(heartbeat_message)
                except Exception as e:
                    logger.error("Error sending heartbeat: %s", e)
                    self.active_connections.discard(connection)

    async def _redis_pubsub_loop(self):
        pattern = warehouse_ws_pubsub_pattern()

        def listen_once(pubsub, timeout: float = 1.0):
            return pubsub.get_message(ignore_subscribe_messages=True, timeout=timeout)

        while True:
            pubsub = get_redis().pubsub()
            try:
                pubsub.psubscribe(pattern)
                logger.info("WS Redis pub/sub subscribed: %s", pattern)
                while True:
                    message = await asyncio.to_thread(listen_once, pubsub, 1.0)
                    if not message or message.get("type") not in ("message", "pmessage"):
                        continue
                    raw = message.get("data")
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    if not raw:
                        continue
                    try:
                        payload = json.loads(raw)
                    except json.JSONDecodeError:
                        logger.warning("WS pub/sub invalid JSON: %s", raw[:200])
                        continue
                    warehouse_id = payload.get("warehouse_id")
                    if warehouse_id is None:
                        channel = message.get("channel") or message.get("pattern")
                        if isinstance(channel, bytes):
                            channel = channel.decode("utf-8")
                        if channel:
                            match = _WAREHOUSE_CHANNEL_RE.search(str(channel))
                            if match:
                                warehouse_id = int(match.group(1))
                    if warehouse_id is not None:
                        await self.broadcast_to_warehouse(int(warehouse_id), payload)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.exception("WS pub/sub loop error, retry in 3s: %s", exc)
                await asyncio.sleep(3)
            finally:
                with contextlib.suppress(Exception):
                    pubsub.close()

    async def broadcast_to_warehouse(self, warehouse_id: int, message: dict) -> None:
        connections = self.notification_by_warehouse.get(warehouse_id)
        if not connections:
            return
        text = json.dumps(message)
        dead: list[WebSocket] = []
        for connection in list(connections):
            try:
                await connection.send_text(text)
            except Exception as exc:
                logger.error("WS send failed warehouse_id=%s: %s", warehouse_id, exc)
                dead.append(connection)
        for connection in dead:
            await self.disconnect(connection, warehouse_id)

    async def connect(
        self,
        db: Session,
        websocket: WebSocket,
        warehouse_id: Optional[int] = None,
    ) -> bool:
        await websocket.accept()
        if warehouse_id is None:
            await websocket.close(code=4400)
            return False
        warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not warehouse:
            await websocket.close(code=4404)
            return False
        self.active_connections.add(websocket)
        if warehouse_id not in self.notification_by_warehouse:
            self.notification_by_warehouse[warehouse_id] = set()
        self.notification_by_warehouse[warehouse_id].add(websocket)
        logger.info("WS connected warehouse_id=%s", warehouse_id)
        return True

    async def disconnect(self, websocket: WebSocket, warehouse_id: Optional[int] = None):
        self.active_connections.discard(websocket)
        if warehouse_id is not None and warehouse_id in self.notification_by_warehouse:
            self.notification_by_warehouse[warehouse_id].discard(websocket)
            if not self.notification_by_warehouse[warehouse_id]:
                del self.notification_by_warehouse[warehouse_id]
        logger.info("WS disconnected warehouse_id=%s", warehouse_id)


ws_manager = WebsocketManager()
