import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.robot.robot_model import RobotTask, TaskStatus, MAPPING_STATUS
from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrderDetail
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderDetail
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.core.logger import get_logger
logger = get_logger("main")

ICS_ADD_TASK_PATH = f"{settings.ics_base_url.rstrip('/')}:7000/ics/taskOrder/addTask"

class TaskStatusService:
    def __init__(self):
        self.current = None

    def add_task(self, payload: dict) -> dict:
        try:
            logger.info(f"ICS addTask payload: {payload}")
            logger.info(f"ICS address: {ICS_ADD_TASK_PATH}")
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

    def _settle_inbound_stock(self, db: Session, detail: InboundOrderDetail) -> None:
        """Move stock created at the pickup location to its destination."""
        if not detail.to_location_id:
            return

        stocks = (
            db.query(ItemStock)
            .filter(ItemStock.inbound_order_detail_id == detail.id)
            .all()
        )
        for stock in stocks:
            stock.location_id = detail.to_location_id
            stock.status = "available"
            stock.is_active = True

    def receive_task_status(self, db: Session, payload: dict) -> TaskStatus:
        order_id = payload.get("orderId")
        if not order_id:
            raise HTTPException(status_code=400, detail="orderId is required")

        robot_task = db.query(RobotTask).filter(RobotTask.order_id == order_id).first()
        if not robot_task:
            raise HTTPException(status_code=404, detail="Robot task not found")

        is_inbound = robot_task.inbound_order_detail_id is not None
        if is_inbound:
            detail = (
                db.query(InboundOrderDetail)
                .filter(InboundOrderDetail.id == robot_task.inbound_order_detail_id)
                .first()
            )
        elif robot_task.outbound_order_detail_id is not None:
            detail = (
                db.query(OutboundOrderDetail)
                .filter(OutboundOrderDetail.id == robot_task.outbound_order_detail_id)
                .first()
            )
        else:
            raise HTTPException(status_code=400, detail="Order not found")

        if not detail:
            raise HTTPException(status_code=404, detail="Order detail not found")

        ics_status = payload.get("status")
        if ics_status in MAPPING_STATUS:
            detail.status = MAPPING_STATUS[ics_status]
            if is_inbound and detail.status == "completed":
                self._settle_inbound_stock(db, detail)

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