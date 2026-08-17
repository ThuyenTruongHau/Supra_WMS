"""Robot / ICS webhook API."""

from typing import Any
from app.core.celery_app import run_logic_task
from fastapi import APIRouter, HTTPException, status

from app.modules.robot.robot_celery_task import persist_task_status

router = APIRouter(tags=["Robot"])


@router.post("/receive-status", status_code=status.HTTP_202_ACCEPTED)
def receive_task_status(payload: dict[str, Any]) -> dict[str, Any]:
    if not payload.get("orderId"):
        raise HTTPException(status_code=400, detail="orderId is required")
    try:
        order_id = run_logic_task(persist_task_status, payload=payload)
    except ValueError as e:
        msg = str(e)
        code = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=code, detail=msg) from e
    return {"order_id": order_id}
