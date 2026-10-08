"""WebSocket endpoints for warehouse realtime events."""

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.logger import get_logger
from app.core.security import decode_access_token
from app.modules.auth.auth_model import User
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
    await websocket.accept()

    username = _user_from_token(token)
    if not username:
        logger.warning(
            "WS rejected warehouse_id=%s: missing or invalid access token",
            warehouse_id,
        )
        await websocket.close(code=4401, reason="Unauthorized")
        return

    db: Session = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user is None or not user.is_active:
            logger.warning(
                "WS rejected warehouse_id=%s: user missing or inactive (%s)",
                warehouse_id,
                username,
            )
            await websocket.close(code=4403, reason="Forbidden")
            return

        connected = await ws_manager.connect(
            db, websocket, warehouse_id, already_accepted=True
        )
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

@router.websocket("/ws/masan/sorting-zone")
async def masan_sorting_zone_websocket(
    websocket: WebSocket,
    warehouse_id: int = Query(..., gt=0),
    zone: str = Query(..., min_length=1, max_length=50),
    token: str | None = Query(default=None),
):
    await websocket.accept()

    username = _user_from_token(token)
    if not username:
        logger.warning(
            "WS rejected masan zone warehouse_id=%s zone=%s: invalid token",
            warehouse_id,
            zone,
        )
        await websocket.close(code=4401, reason="Unauthorized")
        return

    db: Session = SessionLocal()
    zone_norm = zone.strip()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user is None or not user.is_active:
            await websocket.close(code=4403, reason="Forbidden")
            return

        connected = await ws_manager.connect_masan_zone(
            db,
            websocket,
            warehouse_id,
            zone_norm,
            already_accepted=True,
        )
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
        await ws_manager.disconnect_masan_zone(websocket)
        db.close()
