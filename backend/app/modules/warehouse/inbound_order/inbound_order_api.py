from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.auth.auth_model import User
from app.modules.warehouse.inbound_order import inbound_order_model
from app.modules.warehouse.inbound_order.inbound_order_schema import (
    InboundSuggestAllocation,
    InboundSuggestAllocationResponse,
    InboundReleaseLocationsRequest,
    InboundReleaseLocationsResponse,
    InboundOrderCreate,
    InboundOrderResponse,
    InboundOrderListResponse,
    InboundOrderDetailResponse,
    InboundOrderUpdate,
    InboundOrderDeleteResponse,
)
from app.modules.warehouse.inbound_order import inbound_order_service

_INBOUND_READ = require_permission("inbound:read")
_INBOUND_CREATE = require_permission("inbound:create")
_INBOUND_UPDATE = require_permission("inbound:update")
_INBOUND_DELETE = require_permission("inbound:delete")

router = APIRouter(tags=["Inbound Order"])

DbSession = Annotated[Session, Depends(get_db)]

__all__ = [
    "router",
    "DbSession",
    "_INBOUND_READ",
    "_INBOUND_CREATE",
    "_INBOUND_UPDATE",
    "_INBOUND_DELETE",
]

@router.post(
    "/inbound-orders/suggest-allocation",
    response_model=InboundSuggestAllocationResponse,
)
def suggest_inbound_allocation(body: InboundSuggestAllocation, db: DbSession):
    try:
        return inbound_order_service.suggest_allocation_inbound(db, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post(
    "/inbound-orders/release-locations",
    response_model=InboundReleaseLocationsResponse,
    dependencies=[Depends(_INBOUND_CREATE)],
)
def release_inbound_locations(body: InboundReleaseLocationsRequest):
    deleted = inbound_order_service.delete_allocated_locations(body.location_ids)
    return InboundReleaseLocationsResponse(deleted=deleted)


@router.post(
    "/inbound-orders",
    response_model=InboundOrderResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_INBOUND_CREATE)],
)
def create_inbound_order(
    body: InboundOrderCreate,
    db: DbSession,
    current_user: Annotated[User, Depends(_INBOUND_CREATE)],
    inbound_type: str,
):
    try:
        order = inbound_order_service.create_inbound_order(
            db, body, user_id=current_user.id, inbound_type=inbound_type
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return InboundOrderResponse.model_validate(order)


@router.get(
    "/inbound-orders",
    response_model=InboundOrderListResponse,
    dependencies=[Depends(_INBOUND_READ)],
)
def list_inbound_orders(
    db: DbSession,
    warehouse_id: int = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    q: Optional[str] = Query(None, description="Tìm theo mã đơn hoặc người tạo"),
    status: Optional[str] = Query(None, description="Lọc trạng thái đơn"),
):
    orders, total, summary = inbound_order_service.get_inbound_order(
        db,
        warehouse_id=warehouse_id,
        page=page,
        page_size=page_size,
        q=q,
        status=status,
    )
    return InboundOrderListResponse(
        items=[InboundOrderResponse.model_validate(o) for o in orders],
        total=total,
        page=page,
        page_size=page_size,
        summary=summary,
    )


@router.get(
    "/inbound-orders/{order_code}/details",
    response_model=list[InboundOrderDetailResponse],
    dependencies=[Depends(_INBOUND_READ)],
)
def get_inbound_order_details(db: DbSession, order_code: str):
    details = inbound_order_service.get_inbound_order_detail(db, order_code)
    if details is None:
        raise HTTPException(status_code=404, detail="Inbound order not found")
    return details

@router.post(
    "/inbound-allocations/{detail_id}/accept-task",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_INBOUND_UPDATE)],
)
def accept_inbound_task(db: DbSession, detail_id: int):
    try:
        task = inbound_order_service.execute_inbound_task(db, detail_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e 
    return task

@router.patch(
    "/inbound-orders/{order_code}",
    response_model=InboundOrderResponse,
    dependencies=[Depends(_INBOUND_UPDATE)],
)
def update_inbound_order(order_code: str, body: InboundOrderUpdate, db: DbSession, inbound_type: str, current_user: Annotated[User, Depends(_INBOUND_UPDATE)],):
    try:
        order = inbound_order_service.update_inbound_order(db, order_code, body, inbound_type, user_id=current_user.id)
    except ValueError as e:
        msg = str(e)
        code = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=code, detail=msg) from e
    return InboundOrderResponse.model_validate(order)

@router.delete(
    "/inbound-orders/{order_code}",
    response_model=InboundOrderDeleteResponse,
    dependencies=[Depends(_INBOUND_DELETE)],
)
def delete_inbound_order(
    order_code: str,
    db: DbSession,
):
    try:
        inbound_order_service.delete_inbound_order(db, order_code)
    except ValueError as e:
        msg = str(e)
        code = 404 if "not found" in msg.lower() else 400
        raise HTTPException(status_code=code, detail=msg) from e
    return InboundOrderDeleteResponse(
        order_code=order_code,
        message="Inbound order deleted",
    )

@router.post(
    "/inbound-orders/caller",
    status_code=status.HTTP_201_CREATED,
)
def caller_inbound_order(
    body: InboundOrderCreate,
    db: DbSession,
    current_user: Annotated[User, Depends(_INBOUND_CREATE)],
    inbound_type: str,
):
    try:
        order = inbound_order_service.caller_inbound_order(
            db, body, user_id=current_user.id, inbound_type=inbound_type
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return InboundOrderResponse.model_validate(order)
