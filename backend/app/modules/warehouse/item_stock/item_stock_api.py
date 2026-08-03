"""Item stock API."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.warehouse.item_stock import item_stock_service
from app.modules.warehouse.item_stock.item_stock_schema import (
    ItemStockCreate,
    ItemStockListResponse,
    ItemStockResponse,
    ItemStockUpdate,
)

router = APIRouter(tags=["ItemStock"])

DbSession = Annotated[Session, Depends(get_db)]


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
    dependencies=[Depends(require_permission("item_stock:update"))],
)
def update_item_stock(stock_id: int, body: ItemStockUpdate, db: DbSession):
    try:
        stock = item_stock_service.update_item_stock(db, stock_id, body)
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
