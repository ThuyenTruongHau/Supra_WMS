from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.celery_app import run_logic_task
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.masan import (
    masan_inbound_service,
    masan_outbound_service,
    masan_picking_list_service,
)
from app.modules.masan.masan_celery_task import sending_masan_outbound_task_task
from app.modules.masan.masan_schema import (
    MasanClearInboundZoneRequest,
    MasanClearInboundZoneResponse,
    MasanInboundCallerRequest,
    MasanInboundBulkExportRequest,
    MasanInboundCallerResponse,
    MasanInboundParseResponse,
    MasanOutboundParseResponse,
    MasanCcLocationResponse,
    MasanSortingZoneCcLocationsResponse,
    MasanSortingItemsNeededResponse,
    MasanSortingOutboundDispatchRequest,
    MasanSortingOutboundDispatchResponse,
    MasanConfirmAllocationOutboundRequest,
    MasanConfirmAllocationOutboundResponse,
    MasanSortingZonePendingStockResponse,
    MasanPickingListCreateRequest,
    MasanPickingListListResponse,
    MasanPickingListSummary,
)
from app.modules.warehouse.inbound_order.inbound_order_schema import (
    InboundOrderDetailResponse,
)
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrderAllocation,
    OutboundOrderDetail,
)

router = APIRouter(tags=["Masan"])

DbSession = Annotated[Session, Depends(get_db)]


def _picking_list_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, (RuntimeError, NotImplementedError)):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc)
            if str(exc)
            else masan_picking_list_service.PLAYWRIGHT_INSTALL_HINT,
        )
    message = str(exc)
    if any(
        token in message
        for token in (
            "Không tìm thấy",
            "Không có dòng",
            "Không còn dòng",
        )
    ):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)


@router.post(
    "/masan/inbound-orders/parse-preview",
    response_model=MasanInboundParseResponse,
)
async def parse_masan_inbound_preview(
    db: DbSession,
    warehouse_id: int = Form(...),
    inbound_type: Literal["manual", "auto"] = Form("auto"),
    file: UploadFile = File(...),
):
    filename = (file.filename or "").lower()
    if not filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File phải là Excel (.xlsx hoặc .xls)",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File rỗng",
        )

    try:
        return await run_in_threadpool(
            masan_inbound_service.parse_masan_inbound_preview,
            db,
            warehouse_id=warehouse_id,
            content=content,
            inbound_type=inbound_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/masan/outbound-orders/parse-preview",
    response_model=MasanOutboundParseResponse,
    dependencies=[Depends(require_permission("outbound:create"))],
)
async def parse_masan_outbound_preview(
    db: DbSession,
    warehouse_id: int = Form(...),
    outbound_type: Literal["manual", "auto"] = Form("auto"),
    file: UploadFile = File(...),
):
    filename = (file.filename or "").lower()
    if not filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File phải là Excel (.xlsx hoặc .xls)",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File rỗng",
        )

    try:
        return await run_in_threadpool(
            masan_outbound_service.parse_masan_outbound_preview,
            db,
            warehouse_id=warehouse_id,
            content=content,
            outbound_type=outbound_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get(
    "/masan/outbound-orders/{order_id}/export-so",
    dependencies=[Depends(require_permission("outbound:read"))],
)
def export_masan_outbound_order_so(db: DbSession, order_id: int):
    try:
        content, filename = masan_outbound_service.export_outbound_order_so(db, order_id)
    except ValueError as exc:
        message = str(exc)
        if "not found" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from exc

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get(
    "/masan/outbound-orders/cc-locations/{location_id}",
    response_model=MasanCcLocationResponse,
    dependencies=[Depends(require_permission("outbound:read"))],
)
def get_masan_cc_location(
    location_id: int,
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
):
    location = (
        db.query(Location)
        .filter(Location.id == location_id, Location.warehouse_id == warehouse_id)
        .first()
    )
    location_name = (location.location_name or "").strip() if location else None
    bucket = masan_outbound_service.get_sorting_data_for_zone(
        db, warehouse_id, location_id
    )
    if not bucket:
        return MasanCcLocationResponse(
            warehouse_id=warehouse_id,
            location_id=location_id,
            assigned=False,
            location_name=location_name or None,
        )
    return MasanCcLocationResponse(
        warehouse_id=warehouse_id,
        location_id=location_id,
        assigned=True,
        location_name=location_name or None,
        zone=bucket.get("zone"),
        vehicle_number=bucket.get("vehicle_number"),
        lines=bucket.get("lines") or [],
    )


@router.get(
    "/masan/outbound-orders/sorting-zone/cc-locations",
    response_model=MasanSortingZoneCcLocationsResponse,
    dependencies=[Depends(require_permission("outbound:read"))],
)
def list_masan_sorting_zone_cc_locations(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
    zone: str = Query(
        ...,
        min_length=1,
        max_length=50,
        description="Mã zone CC (Zone.code, vd. Zone_CC_01)",
    ),
):
    try:
        payload = masan_outbound_service.list_sorting_zone_cc_locations(
            db,
            warehouse_id,
            zone.strip(),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return MasanSortingZoneCcLocationsResponse.model_validate(payload)


@router.get(
    "/masan/outbound-orders/sorting-items-needed",
    response_model=MasanSortingItemsNeededResponse,
    dependencies=[Depends(require_permission("outbound:read"))],
)
def get_masan_sorting_items_needed(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
    zone: str = Query(
        ...,
        min_length=1,
        max_length=50,
        description="Mã zone CC trong cache (vd. Zone_CC_01)",
    ),
):
    payload = masan_outbound_service.get_item_needed_to_sorting(
        db, warehouse_id, zone.strip()
    )
    return MasanSortingItemsNeededResponse.model_validate(payload)


@router.post(
    "/masan/outbound-orders/sorting-dispatch",
    response_model=MasanSortingOutboundDispatchResponse,
    dependencies=[Depends(require_permission("outbound:update"))],
)
def masan_sorting_outbound_dispatch(
    body: MasanSortingOutboundDispatchRequest,
):
    """Calculate + execute robot cho SKU đã chọn trong zone CC (chạy trên Celery logic)."""
    try:
        payload = run_logic_task(
            sending_masan_outbound_task_task,
            warehouse_id=body.warehouse_id,
            zone=body.zone.strip(),
            item_id=body.item_id,
            to_location_id=body.to_location_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if payload is None:
        return MasanSortingOutboundDispatchResponse(
            warehouse_id=body.warehouse_id,
            zone=body.zone.strip(),
            item_id=body.item_id,
            lacked=[],
        )
    return MasanSortingOutboundDispatchResponse.model_validate(payload)


@router.get(
    "/masan/outbound-orders/sorting-zone/pending-stock",
    response_model=MasanSortingZonePendingStockResponse,
    dependencies=[Depends(require_permission("outbound:read"))],
)
def get_masan_sorting_zone_pending_stock(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
    zone: str = Query(
        ...,
        min_length=1,
        max_length=50,
        description="Mã zone CC trong cache (vd. Zone_CC_01)",
    ),
    republish: bool = Query(
        False,
        description="Publish lại WS masan.sorting.stock_ready cho FE reconnect",
    ),
):
    try:
        payload = masan_outbound_service.get_sorting_zone_pending_stock(
            db,
            warehouse_id,
            zone.strip(),
            republish=republish,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return MasanSortingZonePendingStockResponse.model_validate(payload)


@router.get(
    "/masan/outbound/picking-lists",
    response_model=MasanPickingListListResponse,
    dependencies=[Depends(require_permission("outbound:read"))],
)
def list_masan_picking_lists(
    db: DbSession,
    vehicle_no: str = Query(..., min_length=1, max_length=100),
    warehouse_id: int | None = Query(None, ge=1),
):
    vehicle = vehicle_no.strip()
    try:
        items = masan_picking_list_service.list_picking_lists_for_vehicle(
            db, vehicle, warehouse_id=warehouse_id
        )
    except ValueError as exc:
        raise _picking_list_http_error(exc) from exc
    return MasanPickingListListResponse(
        vehicle_number=vehicle,
        items=[MasanPickingListSummary.model_validate(row) for row in items],
    )


@router.post(
    "/masan/outbound/picking-lists",
    dependencies=[Depends(require_permission("outbound:update"))],
)
def create_masan_picking_list_pdf(
    db: DbSession,
    body: MasanPickingListCreateRequest,
):
    try:
        pdf_bytes, filename, _batch = masan_picking_list_service.create_picking_list_pdf(
            db,
            body.vehicle_no.strip(),
            warehouse_id=body.warehouse_id,
            location_id=body.location_id,
        )
    except (ValueError, RuntimeError, NotImplementedError) as exc:
        raise _picking_list_http_error(exc) from exc
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/masan/outbound/picking-lists/pdf",
    dependencies=[Depends(require_permission("outbound:read"))],
)
def download_masan_picking_list_pdf(
    db: DbSession,
    vehicle_no: str = Query(..., min_length=1, max_length=100),
    extracted: int = Query(..., ge=1),
    warehouse_id: int | None = Query(None, ge=1),
    location_id: int | None = Query(None, ge=1),
):
    try:
        pdf_bytes, filename = masan_picking_list_service.download_picking_list_pdf(
            db,
            vehicle_no.strip(),
            extracted,
            warehouse_id=warehouse_id,
            location_id=location_id,
        )
    except (ValueError, RuntimeError, NotImplementedError) as exc:
        raise _picking_list_http_error(exc) from exc
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/masan/outbound-orders/confirm-allocation",
    response_model=MasanConfirmAllocationOutboundResponse,
    dependencies=[Depends(require_permission("outbound:update"))],
)
def masan_confirm_allocation_outbound(
    db: DbSession,
    body: MasanConfirmAllocationOutboundRequest,
):
    """Xác nhận allocation tại VT (Masan); batch quantities theo allocation_id."""
    zone = body.zone.strip()
    try:
        masan_outbound_service.confirm_allocation_outbound(
            db,
            body.warehouse_id,
            zone,
            body.quantities,
        )
    except ValueError as exc:
        message = str(exc)
        if "not found" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=message,
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message,
        ) from exc

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    allocation_ids = list(body.quantities.keys())
    allocations = (
        db.query(OutboundOrderAllocation)
        .filter(OutboundOrderAllocation.id.in_(allocation_ids))
        .all()
    )
    allocation_statuses = {a.id: a.status for a in allocations}
    detail_ids = {
        a.outbound_order_detail_id
        for a in allocations
        if a.outbound_order_detail_id is not None
    }
    detail_statuses: dict[int, str] = {}
    if detail_ids:
        for detail in (
            db.query(OutboundOrderDetail)
            .filter(OutboundOrderDetail.id.in_(detail_ids))
            .all()
        ):
            detail_statuses[detail.id] = detail.status

    first_detail_id: int | None = None
    first_detail_status: str | None = None
    if allocations and allocations[0].outbound_order_detail_id is not None:
        first_detail_id = allocations[0].outbound_order_detail_id
        first_detail_status = detail_statuses.get(first_detail_id)

    return MasanConfirmAllocationOutboundResponse(
        warehouse_id=body.warehouse_id,
        zone=zone,
        quantities=body.quantities,
        allocation_statuses=allocation_statuses,
        detail_statuses=detail_statuses,
        outbound_order_detail_id=first_detail_id,
        detail_status=first_detail_status,
    )


@router.post(
    "/masan/inbound-orders/clear-inbound-zone",
    response_model=MasanClearInboundZoneResponse,
    dependencies=[Depends(require_permission("inbound:update"))],
)
def masan_clear_inbound_zone(db: DbSession, body: MasanClearInboundZoneRequest):
    count = masan_inbound_service.clear_zone_inbound(db, body.warehouse_id)
    return MasanClearInboundZoneResponse(
        warehouse_id=body.warehouse_id,
        zones=list(settings.zone_inbound),
        deactivated_count=count,
    )


@router.post(
    "/masan/inbound-orders/caller",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=MasanInboundCallerResponse,
)
def caller_masan_inbound_order(db: DbSession, body: MasanInboundCallerRequest):
    try:
        return masan_inbound_service.caller_masan_inbound_order(
            db,
            body.location_ids,
            assign_robot_id=body.assign_robot_id,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "/masan/inbound-orders/daily-capacity-export",
    dependencies=[Depends(require_permission("inbound:read"))],
)
def export_masan_inbound_daily_capacity(
    db: DbSession,
    warehouse_id: int = Query(..., ge=1),
):
    try:
        content, filename = masan_inbound_service.export_daily_capacity_excel(
            db, warehouse_id
        )
    except ValueError as exc:
        message = str(exc)
        if "not found" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=message
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=message
        ) from exc

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.post(
    "/masan/inbound-orders/export",
    dependencies=[Depends(require_permission("inbound:read"))],
)
def export_masan_inbound_orders_bulk(
    db: DbSession,
    body: MasanInboundBulkExportRequest,
):
    try:
        content, filename = masan_inbound_service.export_inbound_orders_masan(
            db, body.order_ids
        )
    except ValueError as exc:
        message = str(exc)
        if "not found" in message.lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=message
            ) from exc
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=message
        ) from exc

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get(
    "/masan/inbound-orders/{order_id}/export",
)
def export_masan_inbound_order(db: DbSession, order_id: int):
    try:
        content, filename = masan_inbound_service.export_inbound_order_masan(db, order_id)
    except ValueError as exc:
        message = str(exc)
        if "not found" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from exc

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get(
    "/masan/inbound-orders/{inbound_order_id}/details",
    response_model=list[InboundOrderDetailResponse],
)
def get_masan_inbound_order_details(
    db: DbSession,
    inbound_order_id: int,
    vehicle_no: str | None = Query(None),
    item_id: int | None = Query(None, gt=0),
):
    try:
        return masan_inbound_service.get_masan_inbound_order_details(
            db,
            inbound_order_id,
            vehicle_no=vehicle_no,
            item_id=item_id,
        )
    except ValueError as exc:
        message = str(exc)
        if "not found" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from exc
