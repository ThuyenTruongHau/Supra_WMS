"""Import a Masan inbound workbook and print one QR label per row.

ItemStock is not created. The workbook snapshot is stored on qr_code.details
so it can be mapped onto stock later.
"""

from __future__ import annotations

import json
import math
import uuid
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.core.time import vn_now
from app.modules.masan.masan_inbound_service import (
    _lookup_inbound_from_location,
    _lookup_item,
    parse_masan_inbound_rows,
)
from app.modules.warehouse.item.item_model import QR_Code
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists

router = APIRouter()

DbSession = Annotated[Session, Depends(get_db)]

LABELS_PER_PAGE = 6
INBOUND_QR_TEMPLATE_PATH = (
    Path(__file__).resolve().parents[2]
    / "static"
    / "templates"
    / "template_inbound_qr_label.html"
)
PRINT_DATA_KEY = "__INBOUND_QR_PRINT_DATA__"


def _qr_code_for_sku(sku: str, used: set[str]) -> str:
    date_part = vn_now().strftime("%Y%m%d")
    for _ in range(8):
        suffix = f"{uuid.uuid4().int % 100_000_000:08d}"
        code = f"{sku}-{date_part}-{suffix}"[:50]
        if code not in used:
            used.add(code)
            return code
    raise ValueError(f"Không tạo được mã QR duy nhất cho SKU '{sku}'")


def _row_errors(db: Session, warehouse_id: int, row: dict[str, Any], sku_cache: dict) -> list[str]:
    """Same checks as inbound import, with the Excel column named in each message."""
    errors: list[str] = []
    if row.get("quantity_error"):
        errors.append(f'Cột "Số lượng": {row["quantity_error"]}')

    sku = row["sku"]
    if sku not in sku_cache:
        sku_cache[sku] = _lookup_item(db, warehouse_id, sku)
    if sku_cache[sku] is None:
        errors.append(
            f'Cột "Mã Item": không tìm thấy sản phẩm SKU \'{sku}\' đang hoạt động trong kho'
        )

    _location, location_error = _lookup_inbound_from_location(
        db,
        warehouse_id,
        row.get("storage_location"),
    )
    if location_error:
        errors.append(f'Cột "Vị trí để": {location_error}')
    return errors


def _explain_parse_error(exc: ValueError) -> ValueError:
    text = str(exc)
    if "Mã Item" in text:
        return ValueError(
            'Hàng 2, cột "Mã Item": không tìm thấy tiêu đề. '
            "File in QR dùng đúng biểu mẫu nhập hàng (header ở hàng 2, dữ liệu từ hàng 3)."
        )
    if "Không có dòng hợp lệ" in text:
        return ValueError(
            'Không có dòng dữ liệu. Cột "Mã Item" từ hàng 3 trở đi đang trống.'
        )
    return exc


def _details_snapshot(row: dict[str, Any], item, location) -> dict[str, Any]:
    return {
        "inbound_datetime": row.get("inbound_datetime"),
        "vehicle_no": row.get("vehicle_no"),
        "from_warehouse": row.get("from_warehouse"),
        "to_warehouse": row.get("to_warehouse"),
        "delivery": row.get("delivery"),
        "nvt": row.get("nvt"),
        "sku": row.get("sku"),
        "item_name": row.get("item_name"),
        "lot": row.get("lot"),
        "lot_status": row.get("lot_status"),
        "quantity": row.get("quantity"),
        "pallet_count": row.get("pallet_count"),
        "storage_location": row.get("storage_location"),
        "locator": row.get("locator"),
        "item_id": item.id,
        "unit_id": item.base_unit_id,
        "from_location_id": location.id,
        "from_location_name": location.location_name,
    }


def _render_inbound_qr_html(labels: list[dict[str, Any]]) -> str:
    template = INBOUND_QR_TEMPLATE_PATH.read_text(encoding="utf-8")
    payload = {"labels": labels}
    script = (
        "<script>"
        f"window.{PRINT_DATA_KEY} = {json.dumps(payload, ensure_ascii=False)};"
        "</script>\n"
    )
    return template.replace(
        "  <script>\n    (function () {",
        f"{script}  <script>\n    (function () {{",
        1,
    )


def import_inbound_qr_print(db: Session, *, warehouse_id: int, content: bytes) -> dict:
    """Create one QR per valid inbound row and report rejected columns.

    Invalid rows are skipped, matching inbound import. The file is rejected
    only when every row fails.
    """
    _ensure_warehouse_exists(db, warehouse_id)
    try:
        parsed_rows = parse_masan_inbound_rows(content)
    except ValueError as exc:
        raise _explain_parse_error(exc) from exc

    sku_cache: dict[str, Any] = {}
    skipped: list[str] = []
    prepared: list[tuple[dict[str, Any], Any, Any]] = []

    for row in parsed_rows:
        row_errors = _row_errors(db, warehouse_id, row, sku_cache)
        if row_errors:
            skipped.append(f"Dòng {row['row_no']}: {'; '.join(row_errors)}")
            continue
        item = sku_cache[row["sku"]]
        location, location_error = _lookup_inbound_from_location(
            db,
            warehouse_id,
            row.get("storage_location"),
        )
        if item is None or location is None or location_error:
            skipped.append(
                f'Dòng {row["row_no"]}: Cột "Vị trí để": '
                f"{location_error or 'không đủ dữ liệu để tạo mã QR'}"
            )
            continue
        prepared.append((row, item, location))

    if not prepared:
        detail = "File chưa đạt chuẩn, chưa tạo mã QR."
        if skipped:
            detail = f"{detail}\n" + "\n".join(skipped)
        raise ValueError(detail)

    used_codes: set[str] = set()
    codes = [_qr_code_for_sku(str(row["sku"]), used_codes) for row, _item, _location in prepared]
    existing = db.query(QR_Code.code).filter(QR_Code.code.in_(codes)).all()
    if existing:
        raise ValueError("QR code already exists")

    labels: list[dict[str, Any]] = []
    qr_rows: list[QR_Code] = []
    for (row, item, location), code in zip(prepared, codes, strict=True):
        details = _details_snapshot(row, item, location)
        qr_rows.append(
            QR_Code(
                code=code,
                item_id=item.id,
                item_stock_id=None,
                qr_type="item",
                details=details,
            )
        )
        labels.append(
            {
                "qr_data": code,
                "sku": details.get("sku") or "",
                "quantity": details.get("quantity") or 0,
                "lot": details.get("lot") or "",
                "nvt": details.get("nvt") or "",
            }
        )

    html = _render_inbound_qr_html(labels)
    try:
        db.add_all(qr_rows)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        message = str(getattr(exc, "orig", exc))
        if "details" in message.lower() and "qr_code" in message.lower():
            raise ValueError(
                "Chưa có cột details trên bảng qr_code. "
                "Chạy alembic upgrade head trong thư mục backend rồi import lại."
            ) from exc
        raise ValueError(f"Không ghi được mã QR: {message}") from exc

    quantity = len(codes)
    return {
        "html": html,
        "quantity": quantity,
        "page_count": math.ceil(quantity / LABELS_PER_PAGE) if quantity else 0,
        "qr_ids": codes,
        "skipped": skipped,
    }


@router.post(
    "/qr-codes/import-print",
    dependencies=[Depends(require_permission("inbound:create"))],
)
async def import_inbound_qr_print_api(
    db: DbSession,
    warehouse_id: int = Form(...),
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
            import_inbound_qr_print,
            db,
            warehouse_id=warehouse_id,
            content=content,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


