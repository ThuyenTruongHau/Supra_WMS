"""Robot / ICS webhook API."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from redis.exceptions import RedisError

from app.core.celery_app import run_logic_task
from app.core.dependencies import get_current_user
from app.modules.robot.robot_celery_task import persist_task_status
from app.modules.robot.robot_schema import RobotTelemetry
from app.modules.robot import robot_telemetry_service
from app.core.logger import get_logger

logger = get_logger("main")
router = APIRouter(tags=["Robot"])


@router.post("/robot_data", status_code=status.HTTP_200_OK)
def receive_robot_data(payload: list[RobotTelemetry]) -> dict[str, int]:
    """RCS sends a complete fleet snapshot, replacing the previous one."""
    try:
        robot_telemetry_service.save_robot_data(payload)
    except RedisError as exc:
        logger.warning("Cannot store robot telemetry: %s", exc)
        raise HTTPException(status_code=503, detail="Robot telemetry unavailable") from exc
    return {"code": 1000}


@router.get(
    "/robot_data",
    response_model=list[RobotTelemetry],
    dependencies=[Depends(get_current_user)],
)
def read_robot_data(response: Response) -> list[dict[str, Any]]:
    """Return fresh telemetry, or an empty list when its Redis TTL expires."""
    response.headers["Cache-Control"] = "no-store"
    try:
        return robot_telemetry_service.get_robot_data()
    except RedisError as exc:
        logger.warning("Cannot read robot telemetry: %s", exc)
        raise HTTPException(status_code=503, detail="Robot telemetry unavailable") from exc


@router.post("/receive-status", status_code=status.HTTP_200_OK)
def receive_task_status(payload: dict[str, Any]) -> dict[str, int]:
    if not payload.get("orderId"):
        return {"code": 1000}
    logger.info(f"Payload: {payload}")
    try:
        result = run_logic_task(persist_task_status, payload=payload)
        if result:
            return {"code": 1000}
        else:
            logger.info(f"Status fail for order_id={payload.get('orderId')}")
            return {"code": 1000}
    except ValueError as e:
        msg = str(e)
        code = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=code, detail=msg) from e
