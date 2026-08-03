"""Location API."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.warehouse.location_map import location_service
from app.modules.warehouse.location_map.location_schema import (
    LocationCreate,
    LocationListResponse,
    LocationResponse,
    LocationUpdate,
)

router = APIRouter(tags=["Location"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get(
    "/locations",
    response_model=LocationListResponse,
    dependencies=[Depends(require_permission("location:read"))],
)
def list_locations(
    db: DbSession,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    warehouse_id: Optional[int] = Query(None),
    zone_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
):
    return location_service.list_locations(
        db,
        page=page,
        page_size=page_size,
        warehouse_id=warehouse_id,
        zone_id=zone_id,
        q=q,
    )


@router.post(
    "/locations",
    response_model=LocationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("location:create"))],
)
def create_location(body: LocationCreate, db: DbSession):
    try:
        location = location_service.create_location(db, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return LocationResponse.model_validate(location)


@router.get(
    "/locations/{location_id}",
    response_model=LocationResponse,
    dependencies=[Depends(require_permission("location:read"))],
)
def get_location(location_id: int, db: DbSession):
    location = location_service.get_location_by_id(db, location_id)
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return LocationResponse.model_validate(location)


@router.patch(
    "/locations/{location_id}",
    response_model=LocationResponse,
    dependencies=[Depends(require_permission("location:update"))],
)
def update_location(location_id: int, body: LocationUpdate, db: DbSession):
    try:
        location = location_service.update_location(db, location_id, body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not location:
        raise HTTPException(status_code=404, detail="Location not found")
    return LocationResponse.model_validate(location)


@router.delete(
    "/locations/{location_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("location:delete"))],
)
def delete_location(location_id: int, db: DbSession):
    try:
        deleted = location_service.delete_location(db, location_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=404, detail="Location not found")
    return None
