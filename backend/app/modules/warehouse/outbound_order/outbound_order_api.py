from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.celery_app import run_logic_task
from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.robot.robot_service import IcsError
from app.modules.auth.auth_model import User
from app.modules.warehouse.outbound_order import outbound_order_model  
from app.modules.warehouse.outbound_order.outbound_order_schema import (
    OutboundOrderCreate,
    OutboundOrderCreateResponse,
    OutboundOrderUpdate,
    OutboundOrderUpdateResponse,
    OutboundOrderDetailResponse,
    OutboundOrderDeleteResponse,
    OutboundOrderListResponse,
    CalculateOutboundDetail,
    CalculateOutboundResponse,
    LackedDetailResponse,
    OutboundRobotTaskResponse,
    OutboundRobotTaskCreate,
)
from app.modules.warehouse.outbound_order import outbound_order_service
from app.modules.warehouse.outbound_order.outbound_celery_task import (
    calculate_outbound_order_task,
    create_outbound_order_task,
    execute_outbound_task_task,
    get_outbound_lacked_details_task,
    get_outbound_order_by_id_task,
    get_outbound_order_details_task,
    get_outbound_robot_tasks_task,
    update_outbound_order_task,
)

_OUTBOUND_READ = require_permission("outbound:read")
_OUTBOUND_CREATE = require_permission("outbound:create")
_OUTBOUND_UPDATE = require_permission("outbound:update")
_OUTBOUND_DELETE = require_permission("outbound:delete")

router = APIRouter(tags=["Outbound Order"])

DbSession = Annotated[Session, Depends(get_db)]

__all__ = [
    "router",
    "DbSession",
    "_OUTBOUND_READ",
    "_OUTBOUND_CREATE",
    "_OUTBOUND_UPDATE",
    "_OUTBOUND_DELETE",
]


@router.post(
    "/outbound-orders",
    response_model=OutboundOrderCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_OUTBOUND_CREATE)],
)
def create_outbound_order(
    body: OutboundOrderCreate,
    db: DbSession,
    current_user: Annotated[User, Depends(_OUTBOUND_CREATE)],
    outbound_type: str,
):
    try:
        return run_logic_task(
            create_outbound_order_task,
            body=body.model_dump(mode="json"),
            user_id=current_user.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get(
    "/outbound-orders",
    response_model=OutboundOrderListResponse,
    dependencies=[Depends(_OUTBOUND_READ)],
)
def list_outbound_orders(
    db: DbSession,
    warehouse_id: int = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    q: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    orders, total, summary = outbound_order_service.get_outbound_order(
        db,
        warehouse_id=warehouse_id,
        page=page,
        page_size=page_size,
        q=q,
        status=status,
    )
    return OutboundOrderListResponse(
        items=[OutboundOrderCreateResponse.model_validate(o) for o in orders],
        total=total,
        page=page,
        page_size=page_size,
        summary=summary,
    )


@router.get(
    "/outbound-orders/id/{order_id}",
    response_model=OutboundOrderUpdateResponse,
    dependencies=[Depends(_OUTBOUND_READ)],
)
def get_outbound_order_by_id(db: DbSession, order_id: int):
    try:
        order = run_logic_task(get_outbound_order_by_id_task, order_id=order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not order:
        raise HTTPException(status_code=404, detail="Outbound order not found")
    return OutboundOrderUpdateResponse.model_validate(order)

@router.get(
    "/robot-tasks/{order_id}",
    response_model=list[OutboundRobotTaskResponse],
    dependencies=[Depends(_OUTBOUND_READ)],
)
def get_outbound_robot_tasks(db: DbSession, order_id: int):
    try:
        robot_tasks = run_logic_task(get_outbound_robot_tasks_task, order_id=order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not robot_tasks:
        raise HTTPException(status_code=404, detail="Robot tasks not found")
    return robot_tasks


@router.get(
    "/outbound-orders/id/{order_id}/details",
    response_model=list[OutboundOrderDetailResponse],
    dependencies=[Depends(_OUTBOUND_READ)],
)
def get_outbound_order_details(db: DbSession, order_id: int):
    try:
        details = run_logic_task(get_outbound_order_details_task, order_id=order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if details is None:
        raise HTTPException(status_code=404, detail="Outbound order not found")
    return details


@router.get(
    "/outbound-orders/id/{order_id}/lacked",
    response_model=list[LackedDetailResponse],
    dependencies=[Depends(_OUTBOUND_READ)],
)
def get_outbound_lacked_details(db: DbSession, order_id: int):
    try:
        lacked = run_logic_task(get_outbound_lacked_details_task, order_id=order_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if lacked is None:
        raise HTTPException(status_code=404, detail="Outbound order not found")
    return lacked


@router.post(
    "/outbound-orders/calculate",
    response_model=CalculateOutboundResponse,
    dependencies=[Depends(_OUTBOUND_UPDATE)],
)
def calculate_outbound_order(
    body: CalculateOutboundDetail,
    db: DbSession,
    strategy: str = Query("fefo"),
):
    try:
        return run_logic_task(
            calculate_outbound_order_task,
            body=body.model_dump(mode="json"),
            strategy=strategy,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

@router.post(
    "/outbound-orders/execute",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(_OUTBOUND_UPDATE)],
)
def execute_outbound_task(
    body: OutboundRobotTaskCreate,
    db: DbSession,
    detail_type: str = Query("auto"),
):
    try:
        run_logic_task(
            execute_outbound_task_task,
            body=body.model_dump(mode="json"),
            detail_type=detail_type,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except IcsError as e:
        raise HTTPException(status_code=503 if "reach" in str(e).lower() else 502, detail=str(e)) from e


@router.patch(
    "/outbound-orders/id/{order_id}",
    response_model=OutboundOrderUpdateResponse,
    dependencies=[Depends(_OUTBOUND_UPDATE)],
)
def update_outbound_order(
    order_id: int,
    body: OutboundOrderUpdate,
    db: DbSession,
    outbound_type: str,
    current_user: Annotated[User, Depends(_OUTBOUND_UPDATE)],
):
    try:
        order = run_logic_task(
            update_outbound_order_task,
            order_id=order_id,
            body=body.model_dump(mode="json"),
            outbound_type=outbound_type,
            user_id=current_user.id,
        )
    except ValueError as e:
        msg = str(e)
        code = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=code, detail=msg) from e
    return OutboundOrderUpdateResponse.model_validate(order)


@router.delete(
    "/outbound-orders/{order_code}",
    response_model=OutboundOrderDeleteResponse,
    dependencies=[Depends(_OUTBOUND_DELETE)],
)
def delete_outbound_order(order_code: str, db: DbSession):
    try:
        outbound_order_service.delete_outbound_order(db, order_code)
    except ValueError as e:
        msg = str(e)
        code = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=code, detail=msg) from e
    return OutboundOrderDeleteResponse(
        order_code=order_code,
        status="deleted",
        message="Outbound order deleted",
    )
