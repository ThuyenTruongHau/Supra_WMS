"""Location API."""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.warehouse.location_map import location_service
from app.modules.warehouse.location_map.location_schema import (
    LocationDetailResponse,
    LocationListResponse,
    LocationResponse,
    LocationsForMapResponse,
    MapDataResponse,
)

router = APIRouter(tags=["Location_Map"])

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


@router.get(
    "/locations/for-map",
    response_model=LocationsForMapResponse,
    dependencies=[Depends(require_permission("location:read"))],
)
def list_locations_for_map(
    db: DbSession,
    warehouse_id: int = Query(...),
):
    try:
        return location_service.list_locations_for_map(db, warehouse_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.get(
    "/locations/{location_id}/detail",
    response_model=LocationDetailResponse,
    dependencies=[Depends(require_permission("location:read"))],
)
def get_location_detail(location_id: int, db: DbSession):
    try:
        return location_service.get_location_detail(db, location_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


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


@router.post(
    "/warehouse-maps/import",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("map:import_map"))],
)
async def import_warehouse_map(
    db: DbSession,
    warehouse_id: int = Form(...),
    file: UploadFile = File(...),
):
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Please upload a .zip file.",
        )
    try:
        await location_service.import_warehouse_map(
            db=db,
            warehouse_id=warehouse_id,
            upload=file,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"message": "Map imported successfully"}


@router.get(
    "/warehouse-maps/{warehouse_id}/map-data",
    response_model=MapDataResponse,
    response_model_by_alias=True,
    dependencies=[Depends(require_permission("map:read"))],
)
def get_map_data(warehouse_id: int, db: DbSession):
    try:
        return location_service.get_map_data(db, warehouse_id)
    except ValueError as e:
        msg = str(e)
        status_code = (
            404 if "No active map" in msg or "not found" in msg.lower() else 400
        )
        raise HTTPException(status_code=status_code, detail=msg) from e


@router.get(
    "/warehouse-maps/{warehouse_id}/export",
    dependencies=[Depends(require_permission("map:export_map"))],
)
def export_warehouse_map(warehouse_id: int, db: DbSession):
    try:
        content, filename = location_service.export_warehouse_map(db, warehouse_id)
    except ValueError as e:
        msg = str(e)
        status_code = (
            404 if "No active map" in msg or "not found" in msg.lower() else 400
        )
        raise HTTPException(status_code=status_code, detail=msg) from e
    return Response(
        content=content,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
