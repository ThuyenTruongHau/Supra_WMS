from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set, Optional
from app.core.logger import get_logger
from sqlalchemy.orm import Session
import asyncio

logger = get_logger("main")

class WebsocketManager:
    def __init__(self):
        self._consumer_task: Optional[asyncio.Task] = None
        self.active_connections: Set[WebSocket] = set()
        self.notification_by_warehouse: Dict[str, Set[WebSocket]] = {}

    async def start(self):
        if self._consumer_task is None:
            self._consumer_task = asyncio.create_task(self._consumer_loop())

    async def stop(self) -> None:
        if self._consumer_task:
            self._consumer_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._consumer_task
            self._consumer_task = None

    async def _consumer_loop(self):
        while True:
            await asyncio.sleep(30)

            if not self.active_connections:
                continue

            heartbeat_message = json.dumps({
                "type": "heartbeat",
                "timestamp": asyncio.get_event_loop().time()
            })

            for connection in list(self.active_connections):
                try:
                    await connection.send_text(heartbeat_message)
                except Exception as e:
                    logger.error(f"Error sending heartbeat message to connection: {e}")
                except Exception:
                    self.active_connections.discard(connection)

    async def connect(self, db: Session, websocket: WebSocket, warehouse_id: Optional[int] = None):
        await websocket.accept()
        self.active_connections.add(websocket)
        warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not warehouse:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        if warehouse_id not in self.notification_by_warehouse:
            self.notification_by_warehouse[warehouse_id] = set()
        self.notification_by_warehouse[warehouse_id].add(websocket)
        logger.info(f"Connected to notification channel for warehouse {warehouse_id}")

    async def disconnect(self, websocket: WebSocket, warehouse_id: Optional[int] = None):
        self.active_connections.discard(websocket)

        if warehouse_id is not None and warehouse_id in self.notification_by_warehouse:
            self.notification_by_warehouse[warehouse_id].discard(websocket)
            if not self.notification_by_warehouse[warehouse_id]:
                del self.notification_by_warehouse[warehouse_id]
        logger.info(f"Disconnected from notification channel for warehouse {warehouse_id}")


ws_manager = WebsocketManager()