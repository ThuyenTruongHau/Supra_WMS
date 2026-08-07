"""Robot / ICS webhook API."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.robot.robot_service import task_status_service
from app.modules.robot.robot_model import TaskStatus  # noqa: F401

router = APIRouter(tags=["Robot"])

DbSession = Annotated[Session, Depends(get_db)]


@router.post("/receive-status", status_code=status.HTTP_201_CREATED)
def receive_task_status(payload: dict[str, Any], db: DbSession) -> dict[str, Any]:
    record = task_status_service.receive_task_status(db,payload)
    return {
        "id": record.id,
        "order_id": record.order_id,
        "sub_task_status": record.sub_task_status,
        "device_code": record.device_code,
        "device_num": record.device_num,
        "qr_code": record.qr_code,
        "shelf_number": record.shelf_number,
        "status": record.status,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }
