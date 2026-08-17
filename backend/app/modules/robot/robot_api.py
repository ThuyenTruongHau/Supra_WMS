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
        record = run_logic_task(persist_task_status, payload=payload)
    except ValueError as e:
        msg = str(e)
        code = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=code, detail=msg) from e
    return {
        "id": record["id"],
        "order_id": record["order_id"],
        "sub_task_status": record.get("sub_task_status"),
        "device_code": record.get("device_code"),
        "device_num": record.get("device_num"),
        "qr_code": record.get("qr_code"),
        "shelf_number": record.get("shelf_number"),
        "status": record.get("status"),
        "created_at": record.get("created_at"),
    }
