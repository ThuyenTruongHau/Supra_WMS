"""Item API."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.warehouse.item import item_service
from app.modules.warehouse.item.item_schema import (
    ItemCreate,
    ItemListResponse,
    ItemResponse,
    ItemUpdate,
)

router = APIRouter(tags=["Item"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get(
    "/items",
    response_model=ItemListResponse,
    dependencies=[Depends(require_permission("item:read"))],
)
def list_items(
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    warehouse_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
):
    return item_service.list_items(
        db,
        page=page,
        page_size=page_size,
        warehouse_id=warehouse_id,
        q=q,
        is_active=is_active,
    )


@router.post(
    "/items",
    response_model=ItemResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("item:create"))],
)
def create_item(body: ItemCreate, db: DbSession):
    try:
        item = item_service.create_item(db, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return ItemResponse.model_validate(item)


@router.get(
    "/items/{item_id}",
    response_model=ItemResponse,
    dependencies=[Depends(require_permission("item:read"))],
)
def get_item(item_id: int, db: DbSession):
    item = item_service.get_item_by_id(db, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemResponse.model_validate(item)


@router.patch(
    "/items/{item_id}",
    response_model=ItemResponse,
    dependencies=[Depends(require_permission("item:update"))],
)
def update_item(item_id: int, body: ItemUpdate, db: DbSession):
    try:
        item = item_service.update_item(db, item_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemResponse.model_validate(item)


@router.delete(
    "/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("item:delete"))],
)
def delete_item(item_id: int, db: DbSession):
    try:
        deleted = item_service.delete_item(db, item_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=404, detail="Item not found")
    return None
