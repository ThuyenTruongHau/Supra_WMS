from collections import defaultdict
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

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
from app.modules.masan.masan_sorting_return_service import list_sorting_zone_return_tasks
from app.modules.masan.masan_oubound_auto_service import (
    clear_outbound_station_cache,
    robot_task_for_zone,
)
from app.modules.robot.robot_model import RobotTask
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrderAllocation,
)
from app.modules.warehouse.outbound_order.outbound_order_schema import (
    OutboundRobotTaskResponse,
)
from app.modules.warehouse.outbound_order.outbound_order_service import (
    _build_allocation_response,
    _parse_task_path,
)
from app.modules.masan.masan_schema import (
    MasanClearInboundZoneRequest,
    MasanClearInboundZoneResponse,
    MasanClearCcCacheRequest,
    MasanClearCcCacheResponse,
    MasanClearOutboundStationCacheRequest,
    MasanClearOutboundStationCacheResponse,
    MasanInboundCallerRequest,
    MasanInboundBulkExportRequest,
    MasanOutboundBulkExportRequest,
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
    MasanStartSortingTimeRequest,
    MasanStartSortingTimeResponse,
    MasanSortingZonePendingStockResponse,
    MasanSortingZoneRobotTasksResponse,
    MasanSortingZoneReturnTasksResponse,
    MasanPickingListAvailableLine,
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
    "/masan/outbound-orders/{order_id}/export",
    dependencies=[Depends(require_permission("outbound:read"))],
)
def export_masan_outbound_order_report(db: DbSession, order_id: int):
    try:
        content, filename = masan_outbound_service.export_outbound_order_report_masan(
            db, order_id
        )
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


@router.post(
    "/masan/outbound-orders/export",
    dependencies=[Depends(require_permission("outbound:read"))],
)
def export_masan_outbound_orders_report_bulk(
    db: DbSession,
    body: MasanOutboundBulkExportRequest,
):
    try:
        content, filename = masan_outbound_service.export_outbound_orders_report_masan(
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Không có lệnh xuất mới được gửi; kiểm tra phần còn thiếu và tồn khả dụng",
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
    "/masan/outbound-orders/sorting-zone/return-tasks",
    response_model=MasanSortingZoneReturnTasksResponse,
    dependencies=[Depends(require_permission("outbound:read"))],
)
def get_masan_sorting_zone_return_tasks(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
    zone: str = Query(
        ..., min_length=1, max_length=50, pattern=r"\S",
        description="Zone.code khu VT chứa pallet cần trả (vd. Zone_sorting_2)",
    ),
):
    return list_sorting_zone_return_tasks(db, warehouse_id, zone)


def _masan_robot_tasks_for_sorting_zone_payload(
    db: Session, zone_str: str
) -> dict[str, object]:
    zone = zone_str.strip()
    tasks = robot_task_for_zone(db, zone)
    if not tasks:
        return {"zone": zone, "tasks": []}

    task_ids = [task.id for task in tasks]
    allocations = (
        db.query(OutboundOrderAllocation)
        .filter(OutboundOrderAllocation.robot_task_id.in_(task_ids))
        .options(
            joinedload(OutboundOrderAllocation.item_stock).joinedload(ItemStock.item),
            joinedload(OutboundOrderAllocation.from_location),
            joinedload(OutboundOrderAllocation.to_location),
        )
        .order_by(OutboundOrderAllocation.id)
        .all()
    )

    allocations_by_task_id: dict[int, list] = defaultdict(list)
    raw_by_task_id: dict[int, list[OutboundOrderAllocation]] = defaultdict(list)
    for allocation in allocations:
        if allocation.robot_task_id is None:
            continue
        raw_by_task_id[allocation.robot_task_id].append(allocation)
        allocations_by_task_id[allocation.robot_task_id].append(
            _build_allocation_response(allocation)
        )

    def _task_type(
        task: RobotTask, raw_allocs: list[OutboundOrderAllocation]
    ) -> str:
        if raw_allocs:
            return raw_allocs[0].allocation_type
        if task.process_code == settings.outbound_process_code:
            return "outbound"
        return "return"

    task_payloads = [
        OutboundRobotTaskResponse(
            order_id=task.order_id,
            task_path=_parse_task_path(task.task_order_detail),
            task_type=_task_type(task, raw_by_task_id.get(task.id, [])),
            status=task.status or "initialize",
            quantity=int(task.quantity),
            allocations=allocations_by_task_id.get(task.id, []),
        )
        for task in tasks
    ]
    return {"zone": zone, "tasks": task_payloads}


@router.get(
    "/masan/outbound-orders/sorting-zone/robot-tasks",
    response_model=MasanSortingZoneRobotTasksResponse,
    dependencies=[Depends(require_permission("outbound:read"))],
)
def get_masan_sorting_zone_robot_tasks(
    db: DbSession,
    zone: str = Query(
        ...,
        min_length=1,
        max_length=50,
        description="Zone.code khu VT (vd. Zone_sorting_1, Zone_sorting_2)",
    ),
):
    payload = _masan_robot_tasks_for_sorting_zone_payload(db, zone)
    return MasanSortingZoneRobotTasksResponse.model_validate(payload)


@router.get(
    "/masan/outbound/picking-lists",
    response_model=MasanPickingListListResponse,
    dependencies=[Depends(require_permission("outbound:read"))],
)
def list_masan_picking_lists(
    db: DbSession,
    vehicle_no: str = Query(..., min_length=1, max_length=100),
    warehouse_id: int | None = Query(None, ge=1),
    location_id: int | None = Query(
        None,
        ge=1,
        description="Ô CC đang mở; chỉ lấy đơn đang gán tại ô này",
    ),
):
    vehicle = vehicle_no.strip()
    try:
        context = masan_picking_list_service.list_picking_list_context(
            db,
            vehicle,
            warehouse_id=warehouse_id,
            location_id=location_id,
        )
    except ValueError as exc:
        raise _picking_list_http_error(exc) from exc
    return MasanPickingListListResponse(
        vehicle_number=context["vehicle_number"],
        items=[
            MasanPickingListSummary.model_validate(row)
            for row in context["items"]
        ],
        available_lines=[
            MasanPickingListAvailableLine.model_validate(row)
            for row in context["available_lines"]
        ],
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
            detail_ids=body.detail_ids,
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
    "/masan/outbound-orders/start-sorting-time",
    response_model=MasanStartSortingTimeResponse,
    dependencies=[Depends(require_permission("outbound:update"))],
)
def masan_start_sorting_time(
    db: DbSession,
    body: MasanStartSortingTimeRequest,
):
    """Ghi mốc bắt đầu chia; nếu đã có thì trả giờ cũ, không ghi đè."""
    result = masan_outbound_service.start_sorting_time(db, body.allocation_ids)
    return MasanStartSortingTimeResponse(
        started_at=result.get("started_at"),
        already_started=bool(result.get("already_started")),
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
            body.sorting_persons.strip(),
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
    "/masan/outbound-orders/clear-cc-cache",
    response_model=MasanClearCcCacheResponse,
    dependencies=[Depends(require_permission("outbound:update"))],
)
def masan_clear_cc_cache(body: MasanClearCcCacheRequest, db: DbSession):
    try:
        from app.modules.masan.masan_auto_service import warehouse_lock, guard_station_cache_clear
        with warehouse_lock(db, body.warehouse_id):
            guard_station_cache_clear(db, body.warehouse_id)
            payload = masan_outbound_service.clear_cc_location_caches(body.warehouse_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return MasanClearCcCacheResponse.model_validate(payload)


@router.post(
    "/masan/outbound-orders/clear-station-cache",
    response_model=MasanClearOutboundStationCacheResponse,
    dependencies=[Depends(require_permission("outbound:update"))],
)
def masan_clear_outbound_station_cache(
    body: MasanClearOutboundStationCacheRequest,
    db: DbSession,
):
    try:
        from app.modules.masan.masan_auto_service import warehouse_lock, guard_station_cache_clear
        with warehouse_lock(db, body.warehouse_id):
            guard_station_cache_clear(db, body.warehouse_id, body.cc_location_ids)
            payload = clear_outbound_station_cache(body.warehouse_id, body.cc_location_ids)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    return MasanClearOutboundStationCacheResponse(
        warehouse_id=body.warehouse_id,
        **payload,
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
            sorting_persons=body.sorting_persons,
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
