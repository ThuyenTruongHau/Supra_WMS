from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.modules.masan import masan_inbound_service
from app.modules.masan.masan_schema import MasanInboundParseResponse
from app.modules.warehouse.inbound_order.inbound_order_schema import (
    InboundOrderDetailResponse,
)

router = APIRouter(tags=["Masan"])

DbSession = Annotated[Session, Depends(get_db)]


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
        return masan_inbound_service.parse_masan_inbound_preview(
            db,
            warehouse_id=warehouse_id,
            content=content,
            inbound_type=inbound_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


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
