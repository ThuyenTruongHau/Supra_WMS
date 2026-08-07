import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.robot.robot_model import RobotTask, TaskStatus
from app.core.logger import get_logger
logger = get_logger("main")

ICS_ADD_TASK_PATH = f"{settings.ics_base_url.rstrip('/')}/ics/taskOrder/addTask"

class TaskStatusService:
    def __init__(self):
        self.current = None

    def add_task(self, payload: dict) -> dict:
        try:
            with httpx.Client(timeout=httpx.Timeout(5.0)) as client:
                response = client.post(ICS_ADD_TASK_PATH, json=payload)
                response.raise_for_status()
                data = response.json()
            logger.info(f"ICS addTask response: {data}")
            return data
        except httpx.HTTPStatusError as e:
            logger.error(f"ICS HTTP error: {e.response.text}")
            raise HTTPException(status_code=502, detail="ICS server error") from e
        except httpx.RequestError as e:
            logger.error(f"ICS connection error: {e}")
            raise HTTPException(status_code=503, detail="Cannot reach ICS server") from e

    def create_robot_task(self, db: Session, task: RobotTask) -> RobotTask:
        payload = {
            "orderId": task.order_id,
            "modelProcessCode": task.process_code,
            "fromSystem": task.system_code,
            "taskOrderDetail": task.task_order_detail,
        }
        try:
            self.add_task(payload)
            db.add(task)
            db.commit()
            db.refresh(task)
            return task
        except Exception:
            db.rollback()
            raise

    def receive_task_status(self, db: Session, payload: dict) -> TaskStatus:
        order_id = payload.get("orderId")
        if not order_id:
            raise HTTPException(status_code=400, detail="orderId is required")

        record = TaskStatus(
            sub_task_status=payload.get("subTaskStatus"),
            order_id=str(order_id),
            device_code=payload.get("deviceCode"),
            device_num=payload.get("deviceNum"),
            qr_code=payload.get("qrCode"),
            shelf_number=payload.get("shelfNumber"),
            status=payload.get("status"),
        )
        try:
            db.add(record)
            db.commit()
            db.refresh(record)
            return record
        except Exception:
            db.rollback()
            raise

task_status_service = TaskStatusService()