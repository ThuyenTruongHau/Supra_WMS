"""Item stock API."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_permission
from app.modules.auth.auth_model import User
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.item_stock import item_stock_service
from app.modules.warehouse.item_stock.item_stock_schema import (
    ItemStockCreate,
    ItemStockListResponse,
    ItemStockResponse,
    ItemStockSplitListResponse,
    ItemStockUpdate,
)

router = APIRouter(tags=["ItemStock"])

DbSession = Annotated[Session, Depends(get_db)]

_CHECK_STOCK_UPDATE = require_permission("item_stock:update")
_CHECK_INBOUND_UPDATE = require_permission("inbound:update")


def require_stock_update_permission(
    db: DbSession,
    current_user: Annotated[User, Depends(get_current_user)],
    inbound_buffer_location_id: Optional[int] = Query(None, gt=0),
) -> User:
    """Keep stock RBAC; let inbound staff edit staged goods in assigned warehouses."""
    try:
        return _CHECK_STOCK_UPDATE(current_user)
    except HTTPException as exc:
        if exc.status_code != 403 or inbound_buffer_location_id is None:
            raise

    _CHECK_INBOUND_UPDATE(current_user)
    location = db.get(Location, inbound_buffer_location_id)
    if location is None or not any(
        warehouse.id == location.warehouse_id
        for warehouse in (current_user.warehouses or [])
    ):
        raise HTTPException(status_code=403, detail="Warehouse access denied")
    # The scoped service below rechecks the real stock's location, inbound owner,
    # allowed fields and buffer zone before any update; the query cannot bypass it.
    return current_user


@router.get(
    "/item-stocks",
    response_model=ItemStockListResponse,
    dependencies=[Depends(require_permission("item_stock:read"))],
)
def list_item_stocks(
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    item_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
):
    return item_stock_service.list_item_stocks(
        db,
        page=page,
        page_size=page_size,
        item_id=item_id,
        location_id=location_id,
        status=status,
        is_active=is_active,
    )


@router.post(
    "/item-stocks",
    response_model=ItemStockResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("item_stock:create"))],
)
def create_item_stock(body: ItemStockCreate, db: DbSession):
    try:
        stock = item_stock_service.create_item_stock(db, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return ItemStockResponse.model_validate(stock)


@router.get(
    "/item-stocks/split",
    response_model=ItemStockSplitListResponse,
)
def get_stock_split(
    db: DbSession,
    item_id: int = Query(..., gt=0),
):
    return item_stock_service.get_stock_split(db, item_id)


@router.get(
    "/item-stocks/{stock_id}",
    response_model=ItemStockResponse,
    dependencies=[Depends(require_permission("item_stock:read"))],
)
def get_item_stock(stock_id: int, db: DbSession):
    stock = item_stock_service.get_item_stock_by_id(db, stock_id)
    if not stock:
        raise HTTPException(status_code=404, detail="Item stock not found")
    return ItemStockResponse.model_validate(stock)


@router.patch(
    "/item-stocks/{stock_id}",
    response_model=ItemStockResponse,
    dependencies=[Depends(require_stock_update_permission)],
)
def update_item_stock(
    stock_id: int, body: ItemStockUpdate, db: DbSession,
    inbound_buffer_location_id: Optional[int] = Query(None, gt=0),
):
    from app.modules.warehouse.item_stock.inbound_buffer_stock_service import (
        InboundBufferStockConflict, update_inbound_buffer_stock,
    )
    try:
        if inbound_buffer_location_id is not None:
            stock = update_inbound_buffer_stock(db, stock_id, body, inbound_buffer_location_id)
        else:
            stock = item_stock_service.update_item_stock(db, stock_id, body)
    except InboundBufferStockConflict as e:
        raise HTTPException(status_code=409, detail={"code": e.code, "message": str(e)}) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not stock:
        raise HTTPException(status_code=404, detail="Item stock not found")
    return ItemStockResponse.model_validate(stock)


@router.delete(
    "/item-stocks/{stock_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("item_stock:delete"))],
)
def delete_item_stock(stock_id: int, db: DbSession):
    try:
        deleted = item_stock_service.delete_item_stock(db, stock_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=404, detail="Item stock not found")
    return None
