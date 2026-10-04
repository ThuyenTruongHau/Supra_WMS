"""WebSocket endpoints for warehouse realtime events."""

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.logger import get_logger
from app.core.security import decode_access_token
from app.socket.ws_manager import ws_manager

logger = get_logger("main")
router = APIRouter(tags=["WebSocket"])


def _user_from_token(token: str | None):
    if not token:
        return None
    payload = decode_access_token(token)
    if payload is None:
        return None
    return payload.get("sub")


@router.websocket("/ws/warehouse/{warehouse_id}")
async def warehouse_websocket(
    websocket: WebSocket,
    warehouse_id: int,
    token: str | None = Query(default=None),
):
    username = _user_from_token(token)
    if not username:
        logger.warning(
            "WS rejected warehouse_id=%s: missing or invalid access token",
            warehouse_id,
        )
        await websocket.close(code=4401)
        return

    db: Session = SessionLocal()
    try:
        connected = await ws_manager.connect(db, websocket, warehouse_id)
    except Exception:
        db.close()
        await websocket.close(code=1011)
        return

    if not connected:
        db.close()
        return

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket, warehouse_id)
        db.close()
