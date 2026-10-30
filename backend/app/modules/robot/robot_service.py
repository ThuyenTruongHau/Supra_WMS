import httpx
from sqlalchemy.orm import Session, joinedload
import json
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.location_map.map_graph_service import (
    MapDistanceNotFound,
    calculate_distance,
)
from app.modules.warehouse.location_map.map_route_algo import RouteError

from app.core.config import settings
from app.socket.ws_events import publish_robot_task_completed
from app.modules.robot.robot_model import RobotTask, TaskStatus, MAPPING_STATUS
from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrderDetail
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.inbound_order.inbound_order_schema import InboundOrderDetailResponse
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrderAllocation,
    OutboundOrderDetail,
)
from app.modules.robot.robot_telemetry_service import robot_telemetry
from app.modules.warehouse.transaction_history.history_model import Transaction, History
from app.modules.warehouse.notificcation.notification_service import check_and_create_notifications_under_over_min_max
from app.core.logger import get_logger
from datetime import datetime

logger = get_logger("main")

ICS_ADD_TASK_PATH = f"{settings.ics_base_url.rstrip('/')}:7000/ics/taskOrder/addTask"

class IcsError(Exception):
    def __init__(self, message: str, *, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable

class TaskStatusService:
    def __init__(self):
        self.current = None

    def add_task(self, payload: dict) -> dict:
        order_id = payload.get("orderId")
        logger.info(
            "ICS addTask request order_id=%s url=%s payload=%s",
            order_id,
            ICS_ADD_TASK_PATH,
            json.dumps(payload, ensure_ascii=False),
        )
        try:
            with httpx.Client(timeout=httpx.Timeout(5.0)) as client:
                response = client.post(ICS_ADD_TASK_PATH, json=payload)
                response.raise_for_status()
                data = response.json()
            logger.info("ICS addTask response order_id=%s body=%s", order_id, data)
            return data
        except httpx.HTTPStatusError as e:
            logger.error(
                "ICS addTask HTTP error order_id=%s status=%s body=%s",
                order_id,
                e.response.status_code,
                e.response.text[:2000],
            )
            retryable = e.response.status_code >= 500
            raise IcsError("ICS server error", retryable=retryable) from e
        except httpx.RequestError as e:
            logger.error("ICS addTask connection error order_id=%s error=%s", order_id, e)
            raise IcsError("Cannot reach ICS server", retryable=True) from e

    def create_robot_task(self, db: Session, task: RobotTask, not_inserted: bool = True) -> RobotTask:
        from app.modules.masan.masan_auto_service import guarded_robot_submission
        if task.inbound_order_detail_id:
            from app.modules.masan.masan_inbound_dispatch_service import guarded_submission
            return guarded_submission(db, task, lambda: guarded_robot_submission(
                db, task, lambda: self._create_robot_task(db, task, False)))
        return guarded_robot_submission(db, task, lambda: self._create_robot_task(db, task, not_inserted))

    def _create_robot_task(self, db: Session, task: RobotTask, not_inserted: bool = True) -> RobotTask:
        payload = {
            "orderId": task.order_id,
            "priority": 6,
            "modelProcessCode": task.process_code,
            "fromSystem": task.system_code,
            "taskOrderDetail": json.loads(task.task_order_detail),
        }
        try:
            from app.modules.masan.masan_return_journal import http_started, http_response
            from app.modules.masan import masan_inbound_dispatch_service as inbound_dispatch
            inbound_dispatch.http_started(db, task)
            http_started(db, task)
            response = self.add_task(payload)
            inbound_dispatch.validate_ack(task, response)
            http_response(db, task, response)
            from app.modules.masan.masan_auto_manual_service import validate_ack
            validate_ack(db, response)
            if not_inserted:
                db.add(task)
                db.commit()
                db.refresh(task)
            return task
        except Exception:
            db.rollback()
            raise

    def _settle_inbound_stock(self, db: Session, detail: InboundOrderDetail) -> None:
        if not detail.to_location_id:
            return

        stocks = (
            db.query(ItemStock)
            .filter(
                ItemStock.inbound_order_detail_id == detail.id,
                ItemStock.is_active.is_(True),
                ItemStock.status != "virtual",
            )
            .populate_existing()
            .all()
        )

        check_and_create_notifications_under_over_min_max(db, stocks[0].item, "under")

        for stock in stocks:
            logger.info(f"Current status: {stock.status}")
            stock.location_id = detail.to_location_id
            if stock.status != "split":
                stock.status = "available"
            logger.info(f"New status: {stock.status}")

            db.add(Transaction(
                    from_location_id=detail.from_location_id,
                    to_location_id=detail.to_location_id,
                    transaction_type="inbound",
                    item_stock_id=stock.id,
                    quantity=int(stock.quantity),
                    created_by_id=detail.inbound_order.created_by_id,
                ))

        db.add(History(
            inbound_order_id=detail.inbound_order_id,
            old_status="in_progress",
            new_status="completed",
            description=f"Inbound order detail {detail.id} completed",
            details=InboundOrderDetailResponse.model_validate(detail).model_dump(mode="json"),
            created_by_id=detail.inbound_order.created_by_id,
        ))
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

    def _distance_m(
        self,
        db: Session,
        warehouse_id: int,
        from_location: Location | None,
        to_location: Location | None,
    ) -> float | None:
        """Never raises: a failure here must not make Celery retry an already settled callback."""
        if from_location is None or to_location is None:
            return None
        try:
            result = calculate_distance(
                db,
                warehouse_id,
                from_location.location_code,
                to_location.location_code,
            )
        except (MapDistanceNotFound, RouteError) as exc:
            logger.warning(
                "Cannot calculate distance %s -> %s: %s",
                from_location.location_code,
                to_location.location_code,
                exc,
            )
            return None
        except Exception:
            logger.exception(
                "Distance calculation failed %s -> %s",
                from_location.location_code,
                to_location.location_code,
            )
            return None
        return result["distance_m"]

    def receive_task_status(self, db: Session, payload: dict) -> TaskStatus:
        from app.modules.masan.masan_auto_service import cycle_for_task, warehouse_lock, wake
        from app.modules.masan.masan_auto_manual_service import is_shared, callback
        task = db.query(RobotTask).filter_by(order_id=payload.get("orderId")).first()
        if task and is_shared(cycle_for_task(db, task.id)):
            return callback(db, task, payload, lambda: self._receive_task_status(db, payload))
        if task and task.outbound_order_allocations:
            from app.modules.masan import masan_return_adoption_service as adoption
            from app.modules.masan.masan_return_journal import callback as journal_callback
            warehouse_id = task.outbound_order_allocations[0].outbound_order_detail.outbound_order.warehouse_id
            with warehouse_lock(db, warehouse_id):
                protected = adoption.protected_pick_rows(db, task)
                if protected[0] and protected[0] == {row.id for row in task.outbound_order_allocations}:
                    return None
                previous = db.info.get(adoption._CALLBACK_KEY)
                db.info[adoption._CALLBACK_KEY] = protected
                try:
                    result = self._receive_task_status(db, payload)
                    journal_callback(db, task, MAPPING_STATUS.get(str(payload.get("status"))))
                finally:
                    if previous is None:
                        db.info.pop(adoption._CALLBACK_KEY, None)
                    else:
                        db.info[adoption._CALLBACK_KEY] = previous
            wake()
            return result
        return self._receive_task_status(db, payload)

    def _receive_task_status(self, db: Session, payload: dict) -> TaskStatus:
        order_id = payload.get("orderId")
        if not order_id:
            raise ValueError("orderId is required")

        robot_task = (
            db.query(RobotTask)
            .options(
                joinedload(RobotTask.inbound_order_detail).joinedload(
                    InboundOrderDetail.inbound_order
                ),
                joinedload(RobotTask.outbound_order_allocations)
                .joinedload(OutboundOrderAllocation.outbound_order_detail)
                .joinedload(OutboundOrderDetail.outbound_order),
            )
            .filter(RobotTask.order_id == order_id)
            .first()
        )
        if not robot_task:
            raise ValueError("Robot task not found")

        if robot_task.inbound_order_detail_id is not None:
            from app.modules.warehouse.inbound_order.inbound_lock import lock_inbound_detail
            lock_inbound_detail(db, robot_task.inbound_order_detail_id)
            db.refresh(robot_task, attribute_names=["quantity", "status"])

        from app.modules.masan.masan_auto_service import receive_callback
        handled, automatic_record = receive_callback(db, robot_task, payload)
        if handled:
            return automatic_record

        if robot_task.status == "completed" or (robot_task.inbound_order_detail_id and robot_task.status in {"failed", "cancelled"}):
            if robot_task.inbound_order_detail_id:
                db.commit()
                from app.modules.masan.masan_inbound_dispatch_service import record_callback
                record_callback(db, robot_task, robot_task.status)
            return

        notify_ws: tuple[int, str] | None = None

        if robot_task.inbound_order_detail_id is not None:
            detail = robot_task.inbound_order_detail
            sub_task_status = payload.get("subTaskStatus")
            sub_task_sequence = payload.get("subTaskSeq")
            if detail.device is None:
                detail.device = payload.get("deviceNum")
            
            if sub_task_status == "2" and sub_task_sequence == "2":
                if detail.start_time is None:
                    detail.start_time = datetime.now()
                    robot_data = robot_telemetry.get_robot_data(payload.get("deviceNum"))
                    if robot_data is not None:
                        detail.start_battery = robot_data.get("battery")

        elif robot_task.outbound_order_allocations:
            allocations = robot_task.outbound_order_allocations
            from app.modules.masan.masan_return_adoption_service import protected_callback
            protected_ids, _ = protected_callback(db)
            if protected_ids:
                allocations = [row for row in allocations if row.id not in protected_ids]
            outbound_order = allocations[0].outbound_order_detail.outbound_order
        else:
            raise ValueError("Order not found")

        ics_status = str(payload.get("status"))
        logger.info(f"ICS status: {ics_status}, order_id: {order_id}")
        mapped_status = MAPPING_STATUS.get(ics_status)
        notify_completed = mapped_status == "completed"

        if ics_status in MAPPING_STATUS:
            if robot_task.inbound_order_detail_id is not None:
                detail.status = MAPPING_STATUS[ics_status]
                warehouse_id = detail.inbound_order.warehouse_id

                if MAPPING_STATUS[ics_status] == "completed":
                    logger.info(f"Receive completed for {order_id}")
                    # Before settling: _settle_inbound_stock commits, so distance is saved with it.
                    if detail.distance is None:
                        detail.distance = self._distance_m(
                            db, warehouse_id, detail.from_location, detail.to_location
                        )
                    self._settle_inbound_stock(db, detail)

                    if detail.end_time is None:
                        detail.end_time = datetime.now()
                        robot_data = robot_telemetry.get_robot_data(payload.get("deviceNum"))
                        if robot_data is not None:
                            detail.end_battery = robot_data.get("battery")

            else:
                sub_task_status = payload.get("subTaskStatus")
                sub_task_sequence = payload.get("subTaskSeq")
                distances: dict[tuple[int | None, int | None], float | None] = {}
                for allocation in allocations:
                    if allocation.device is None:
                        allocation.device = payload.get("deviceNum")
                    if sub_task_status == "2" and sub_task_sequence == "2":
                        if allocation.start_time is None:
                            allocation.start_time = datetime.now()
                            robot_data = robot_telemetry.get_robot_data(payload.get("deviceNum"))
                            if robot_data is not None:
                                allocation.start_battery = robot_data.get("battery")

                    if allocation.distance is None:
                        key = (allocation.from_location_id, allocation.to_location_id)
                        if key not in distances:
                            distances[key] = self._distance_m(
                                db,
                                outbound_order.warehouse_id,
                                allocation.from_location,
                                allocation.to_location,
                            )
                        allocation.distance = distances[key]
                    # allocation.status = (
                    #     "pre_completed"
                    #     if MAPPING_STATUS[ics_status] == "completed" and allocation.allocation_type == "outbound"
                    #     else MAPPING_STATUS[ics_status]
                    # )
                    if MAPPING_STATUS[ics_status] == "completed" and allocation.allocation_type == "outbound":
                        allocation.status = "pre_completed"
                        if allocation.end_time is None:
                            allocation.end_time = datetime.now()
                            robot_data = robot_telemetry.get_robot_data(payload.get("deviceNum"))
                            if robot_data is not None:
                                allocation.end_battery = robot_data.get("battery")

                    else:
                        allocation.status = MAPPING_STATUS[ics_status]

                    if allocation.status == "completed":
                        from app.modules.warehouse.outbound_order.outbound_order_service import (
                            _settle_outbound_stock,
                        )
                        _settle_outbound_stock(db, [allocation])
                        if allocation.end_time is None:
                            allocation.end_time = datetime.now()
                            robot_data = robot_telemetry.get_robot_data(payload.get("deviceNum"))
                            if robot_data is not None:
                                allocation.end_battery = robot_data.get("battery")

                if MAPPING_STATUS[ics_status] == "completed":
                    from_location = allocations[0].from_location
                    to_location = allocations[0].to_location
                    if not from_location or not to_location:
                        raise ValueError("From location or to location not found")
                    stocks = db.query(ItemStock).filter(ItemStock.location_id == from_location.id, ItemStock.is_active.is_(True)).all()
                    from app.modules.masan.masan_return_adoption_service import protected_callback
                    _, protected_stocks = protected_callback(db)
                    if protected_stocks:
                        stocks = [stock for stock in stocks if stock.id not in protected_stocks]
                    from app.modules.masan.masan_auto_manual_service import context
                    ctx = context(db)
                    if ctx and ctx.action == "callback" and ctx.cycle:
                        stocks = [stock for stock in stocks if stock.id in ctx.cycle.stock_ids]
                    for stock in stocks:
                        stock.location_id = to_location.id
                    
                    from app.modules.masan.masan_outbound_service import (
                        _send_taking_stock, _clear_cc_cache_if_order_completed,
                    )
                    
                    _send_taking_stock(db, robot_task.id, allocations)
                    _clear_cc_cache_if_order_completed(db, outbound_order.warehouse_id, outbound_order.id)


            if notify_completed:
                if robot_task.inbound_order_detail_id is not None:
                    wh_id = detail.inbound_order.warehouse_id
                    notify_ws = (wh_id, "inbound")
                else:
                    wh_id = (
                        allocations[0]
                        .outbound_order_detail.outbound_order.warehouse_id
                    )
                    notify_ws = (wh_id, "outbound")

        record = TaskStatus(
            sub_task_status=payload.get("subTaskStatus"),
            order_id=str(order_id),
            device_code=payload.get("deviceCode"),
            device_num=payload.get("deviceNum"),
            qr_code=payload.get("qrCode"),
            shelf_number=payload.get("shelfNumber"),
            status=str(payload.get("status")),
        )
        try:
            db.add(record)
            db.commit()
            db.refresh(record)
            if robot_task.inbound_order_detail_id:
                from app.modules.masan.masan_inbound_dispatch_service import record_callback
                record_callback(db, robot_task, MAPPING_STATUS.get(str(payload.get("status"))))
            if notify_ws is not None:
                publish_robot_task_completed(
                    notify_ws[0],
                    str(order_id),
                    notify_ws[1],
                )
            return record
        except Exception:
            db.rollback()
            raise

    
task_status_service = TaskStatusService()
