"""Warehouse and Zone API."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.warehouse.warehouse_zone import warehouse_service
from app.modules.warehouse.warehouse_zone.warehouse_schema import (
    WarehouseCreate,
    WarehouseListResponse,
    WarehouseResponse,
    WarehouseUpdate,
    ZoneCreate,
    ZoneListResponse,
    ZoneLocationAssign,
    ZoneResponse,
    ZoneUpdate,
)

router = APIRouter(tags=["Warehouse"])

DbSession = Annotated[Session, Depends(get_db)]


# --- Warehouse ---

@router.get(
    "/warehouses",
    response_model=WarehouseListResponse,
    dependencies=[Depends(require_permission("warehouse:read"))],
)
def list_warehouses(
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    return warehouse_service.list_warehouses(db, page=page, page_size=page_size)


@router.post(
    "/warehouses",
    response_model=WarehouseResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("warehouse:create"))],
)
def create_warehouse(body: WarehouseCreate, db: DbSession):
    try:
        warehouse = warehouse_service.create_warehouse(db, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return WarehouseResponse.model_validate(warehouse)


@router.get(
    "/warehouses/{warehouse_id}",
    response_model=WarehouseResponse,
    dependencies=[Depends(require_permission("warehouse:read"))],
)
def get_warehouse(warehouse_id: int, db: DbSession):
    warehouse = warehouse_service.get_warehouse_by_id(db, warehouse_id)
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return WarehouseResponse.model_validate(warehouse)


@router.patch(
    "/warehouses/{warehouse_id}",
    response_model=WarehouseResponse,
    dependencies=[Depends(require_permission("warehouse:update"))],
)
def update_warehouse(warehouse_id: int, body: WarehouseUpdate, db: DbSession):
    try:
        warehouse = warehouse_service.update_warehouse(db, warehouse_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return WarehouseResponse.model_validate(warehouse)


@router.delete(
    "/warehouses/{warehouse_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("warehouse:delete"))],
)
def delete_warehouse(warehouse_id: int, db: DbSession):
    try:
        deleted = warehouse_service.delete_warehouse(db, warehouse_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return None


# --- Zone ---

@router.get(
    "/zones",
    response_model=ZoneListResponse,
    dependencies=[Depends(require_permission("zone:read"))],
)
def list_zones(
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    warehouse_id: Optional[int] = Query(None),
):
    return warehouse_service.list_zones(
        db, page=page, page_size=page_size, warehouse_id=warehouse_id
    )


@router.post(
    "/zones",
    response_model=ZoneResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("zone:create"))],
)
def create_zone(body: ZoneCreate, db: DbSession):
    try:
        zone = warehouse_service.create_zone(db, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return ZoneResponse.model_validate(zone)


@router.get(
    "/zones/{zone_id}",
    response_model=ZoneResponse,
    dependencies=[Depends(require_permission("zone:read"))],
)
def get_zone(zone_id: int, db: DbSession):
    zone = warehouse_service.get_zone_by_id(db, zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return ZoneResponse.model_validate(zone)


@router.patch(
    "/zones/{zone_id}",
    response_model=ZoneResponse,
    dependencies=[Depends(require_permission("zone:update"))],
)
def update_zone(zone_id: int, body: ZoneUpdate, db: DbSession):
    try:
        zone = warehouse_service.update_zone(db, zone_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not zone:
        raise HTTPException(status_code=404, detail="Zone not found")
    return ZoneResponse.model_validate(zone)


@router.delete(
    "/zones/{zone_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("zone:delete"))],
)
def delete_zone(zone_id: int, db: DbSession):
    try:
        deleted = warehouse_service.delete_zone(db, zone_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=404, detail="Zone not found")
    return None


@router.put(
    "/zones/{zone_id}/locations",
    dependencies=[Depends(require_permission("zone:update"))],
)
def assign_zone_locations(zone_id: int, body: ZoneLocationAssign, db: DbSession):
    try:
        return warehouse_service.assign_locations_to_zone(
            db, zone_id, body.location_ids
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
