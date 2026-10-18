"""Masan outbound picking list (A4 PDF) — extract batch, payload, render."""

from __future__ import annotations

import asyncio
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session, joinedload

from app.core.cache import cache_get, cache_scan_keys
from app.core.config import settings
from app.modules.masan.masan_outbound_service import _resolve_line_sku
from app.modules.warehouse.lot_number_utils import format_lot_compact_ddmmyy
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrderAllocation,
    OutboundOrderDetail,
)

PICKING_LIST_TEMPLATE_PATH = (
    Path(__file__).resolve().parents[2]
    / "static"
    / "templates"
    / "template_picking_list_a4.html"
)

PLAYWRIGHT_INSTALL_HINT = (
    "Thiếu Playwright để xuất PDF. Cài đặt: pip install playwright && playwright install chromium"
)

# Playwright spawn subprocess — không chạy được trên Windows trong asyncio loop của uvicorn.
_PDF_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="masan-picking-pdf")


def _query_completed_details_for_vehicle(
    db: Session,
    vehicle_no: str,
) -> list[OutboundOrderDetail]:
    vehicle = (vehicle_no or "").strip()
    if not vehicle:
        raise ValueError("vehicle_no is required")
    return (
        db.query(OutboundOrderDetail)
        .options(
            joinedload(OutboundOrderDetail.item),
            joinedload(OutboundOrderDetail.outbound_order),
            joinedload(OutboundOrderDetail.sorting_location).joinedload(Location.zone),
            joinedload(OutboundOrderDetail.allocations).joinedload(
                OutboundOrderAllocation.from_location
            ),
        )
        .filter(
            OutboundOrderDetail.details.op("->>")("vehicle_no") == vehicle,
            OutboundOrderDetail.status == "completed",
        )
        .order_by(OutboundOrderDetail.id)
        .all()
    )


def _assigned_location_label(loc: Location | None) -> str:
    if loc is None:
        return ""
    name = (loc.location_name or "").strip()
    if name:
        return name
    return (loc.location_code or "").strip()


def _detail_warehouse_id(detail: OutboundOrderDetail) -> int | None:
    order = detail.outbound_order
    return int(order.warehouse_id) if order is not None else None


def _location_id_from_cc_buckets(
    warehouse_id: int,
    detail_id: int,
) -> int | None:
    prefix = f"outbound:assigned_cc_location:{warehouse_id}:"
    for key in cache_scan_keys(f"{prefix}*"):
        suffix = key.rsplit(":", 1)[-1]
        if not suffix.isdigit():
            continue
        loc_id = int(suffix)
        loc_key = f"{prefix}{loc_id}"
        bucket = cache_get(loc_key)
        if not bucket:
            continue
        for line in bucket.get("lines") or []:
            if line.get("detail_id") is not None and int(line["detail_id"]) == detail_id:
                return loc_id
    return None


def _infer_cc_location_for_vehicle(
    db: Session,
    warehouse_id: int,
    vehicle_no: str,
) -> int | None:
    from app.modules.masan.masan_outbound_service import list_sorting_zone_cc_locations

    vehicle = (vehicle_no or "").strip()
    if not vehicle:
        return None
    loc_ids: list[int] = []
    for zone_code in settings.zone_cc:
        payload = list_sorting_zone_cc_locations(db, warehouse_id, zone_code)
        for row in payload.get("locations") or []:
            if not row.get("assigned"):
                continue
            if (row.get("vehicle_number") or "").strip() != vehicle:
                continue
            raw_id = row.get("location_id")
            if raw_id is not None:
                loc_ids.append(int(raw_id))
    unique = list(dict.fromkeys(loc_ids))
    if len(unique) == 1:
        return unique[0]
    return None


def _ensure_sorting_locations(
    db: Session,
    pending: list[OutboundOrderDetail],
    *,
    warehouse_id: int | None = None,
    vehicle_no: str | None = None,
    hint_location_id: int | None = None,
) -> None:
    """Backfill sorting_location_id from cache or CC hint before picking list."""
    effective_hint = hint_location_id
    if effective_hint is None and warehouse_id is not None and vehicle_no:
        effective_hint = _infer_cc_location_for_vehicle(db, warehouse_id, vehicle_no)

    changed = False
    for detail in pending:
        if detail.sorting_location_id is not None:
            continue
        wh_id = warehouse_id or _detail_warehouse_id(detail)
        if wh_id is None:
            continue
        bucket = cache_get(f"outbound:assigned_cc_details:{wh_id}:{detail.id}")
        if bucket and bucket.get("location_id") is not None:
            detail.sorting_location_id = int(bucket["location_id"])
            changed = True
            continue
        from_bucket = _location_id_from_cc_buckets(wh_id, detail.id)
        if from_bucket is not None:
            detail.sorting_location_id = from_bucket
            changed = True

    missing = [d for d in pending if d.sorting_location_id is None]
    if missing and effective_hint is not None:
        for detail in missing:
            detail.sorting_location_id = int(effective_hint)
        changed = True

    if changed:
        db.flush()
        for detail in pending:
            db.refresh(detail, attribute_names=["sorting_location"])


def _validate_pending_cc_locations(
    pending: list[OutboundOrderDetail],
    *,
    location_id: int | None = None,
) -> None:
    cc_ids = {d.sorting_location_id for d in pending if d.sorting_location_id is not None}
    if len(cc_ids) == 0:
        raise ValueError(
            "Chưa có vị trí CC (sorting_location). "
            "Cần confirm xong tại ô CC trước khi tạo picking list."
        )
    if len(cc_ids) > 1:
        raise ValueError(
            "Các dòng cùng xe đang thuộc nhiều ô CC khác nhau; "
            "không thể tạo một picking list."
        )
    loc = pending[0].sorting_location
    if loc is not None and loc.zone is not None:
        zone_code = (loc.zone.code or "").strip()
        if zone_code and zone_code not in settings.zone_cc:
            raise ValueError(f"Zone {zone_code!r} không phải khu CC được cấu hình.")
    if location_id is not None:
        sole_cc_id = next(iter(cc_ids))
        if sole_cc_id != int(location_id):
            raise ValueError("Vị trí CC không khớp với dữ liệu picking list của xe.")


def _picking_locator_label(detail: OutboundOrderDetail) -> str:
    outbound_allocs = [
        alloc
        for alloc in detail.allocations or []
        if alloc.allocation_type == "outbound"
    ]
    labels: list[str] = []
    seen: set[str] = set()
    for alloc in sorted(outbound_allocs, key=lambda row: row.id):
        loc = alloc.from_location
        if loc is None:
            continue
        label = (loc.location_name or loc.location_code or "").strip()
        if label and label not in seen:
            seen.add(label)
            labels.append(label)
    if labels:
        return ", ".join(labels)
    meta = detail.details if isinstance(detail.details, dict) else {}
    fallback = meta.get("locator")
    return str(fallback).strip() if fallback is not None else ""


def _detail_to_picking_line(detail: OutboundOrderDetail) -> dict[str, Any]:
    meta = detail.details if isinstance(detail.details, dict) else {}
    sku = _resolve_line_sku(detail, meta)
    item = detail.item
    item_name = (item.name if item is not None else None) or ""
    lot_raw = meta.get("lot_number")
    lot_number = format_lot_compact_ddmmyy(
        str(lot_raw).strip() if lot_raw is not None else None,
    )
    return {
        "sku": sku or "",
        "item_name": str(item_name).strip(),
        "quantity": int(detail.quantity or 0),
        "unit": (detail.unit or "").strip(),
        "lot_number": lot_number or "",
        "locator": _picking_locator_label(detail),
    }


def build_picking_list_payload(
    db: Session,
    vehicle_no: str,
    pending: list[OutboundOrderDetail],
    *,
    extracted: int,
) -> dict[str, Any]:
    if not pending:
        raise ValueError("Không có dòng hàng cho picking list.")
    loc = pending[0].sorting_location
    zone = ""
    if loc is not None and loc.zone is not None:
        zone = (loc.zone.code or "").strip()
    batch = int(extracted)
    return {
        "vehicle_number": (vehicle_no or "").strip(),
        "assigned_location": _assigned_location_label(loc),
        "zone": zone,
        "printed_at": datetime.now().strftime("%d/%m/%Y"),
        "extracted": batch,
        "form_code": f"Pallet {batch}",
        "lines": [_detail_to_picking_line(d) for d in pending],
    }


def _assert_details_warehouse(
    pending: list[OutboundOrderDetail],
    warehouse_id: int | None,
) -> None:
    if warehouse_id is None:
        return
    for d in pending:
        order = d.outbound_order
        if order is not None and order.warehouse_id != warehouse_id:
            raise ValueError("Dòng hàng không thuộc kho đã chọn.")


def prepare_picking_list(
    db: Session,
    vehicle_no: str,
    *,
    extracted: int | None = None,
    location_id: int | None = None,
    warehouse_id: int | None = None,
    create_new: bool = False,
) -> tuple[dict[str, Any], int]:
    """
    Resolve pending lines and optionally assign new extracted batch.
    Returns (payload, extracted_batch_number).
    """
    details = _query_completed_details_for_vehicle(db, vehicle_no)
    if not details:
        raise ValueError("Không tìm thấy dòng xuất completed cho xe này.")

    if create_new or extracted is None:
        pending = [d for d in details if d.extracted is None or d.extracted == 0]
        if not pending:
            raise ValueError(
                "Không còn dòng chưa tạo picking list (extracted=0) cho xe này."
            )
        _ensure_sorting_locations(
            db,
            pending,
            warehouse_id=warehouse_id,
            vehicle_no=vehicle_no,
            hint_location_id=location_id,
        )
        _validate_pending_cc_locations(pending, location_id=location_id)
        _assert_details_warehouse(pending, warehouse_id)
        highest = max((d.extracted or 0) for d in details)
        batch_no = highest + 1
        for d in pending:
            d.extracted = batch_no
        db.commit()
        for d in pending:
            db.refresh(d)
        batch = batch_no
    else:
        batch = int(extracted)
        pending = [d for d in details if (d.extracted or 0) == batch]
        if not pending:
            raise ValueError(f"Không có dòng với extracted={batch} cho xe này.")
        _ensure_sorting_locations(
            db,
            pending,
            warehouse_id=warehouse_id,
            vehicle_no=vehicle_no,
            hint_location_id=location_id,
        )
        _validate_pending_cc_locations(pending, location_id=location_id)
        _assert_details_warehouse(pending, warehouse_id)

    payload = build_picking_list_payload(db, vehicle_no, pending, extracted=batch)
    return payload, batch


def list_picking_lists_for_vehicle(
    db: Session,
    vehicle_no: str,
    *,
    warehouse_id: int | None = None,
) -> list[dict[str, Any]]:
    details = _query_completed_details_for_vehicle(db, vehicle_no)
    if warehouse_id is not None:
        details = [
            d
            for d in details
            if d.outbound_order is not None
            and d.outbound_order.warehouse_id == warehouse_id
        ]
    by_batch: dict[int, list[OutboundOrderDetail]] = {}
    for d in details:
        ext = d.extracted
        if ext is None or ext == 0:
            continue
        by_batch.setdefault(int(ext), []).append(d)

    items: list[dict[str, Any]] = []
    vehicle = (vehicle_no or "").strip()
    for ext in sorted(by_batch.keys(), reverse=True):
        group = by_batch[ext]
        loc = group[0].sorting_location
        zone = ""
        if loc is not None and loc.zone is not None:
            zone = (loc.zone.code or "").strip()
        items.append(
            {
                "extracted": ext,
                "line_count": len(group),
                "assigned_location": _assigned_location_label(loc),
                "zone": zone,
                "vehicle_number": vehicle,
            }
        )
    return items


def picking_list_pdf_filename(vehicle_no: str, extracted: int) -> str:
    safe = re.sub(r"[^\w\-.]+", "_", (vehicle_no or "").strip())[:40]
    return f"picking_list_{safe}_{extracted}.pdf"


def render_picking_list_html(payload: dict[str, Any]) -> str:
    if not PICKING_LIST_TEMPLATE_PATH.is_file():
        raise ValueError(f"Template not found: {PICKING_LIST_TEMPLATE_PATH}")
    template = PICKING_LIST_TEMPLATE_PATH.read_text(encoding="utf-8")
    script = (
        "<script>"
        f"window.__PICKING_LIST_PRINT_DATA__ = {json.dumps(payload, ensure_ascii=False)};"
        "</script>\n"
    )
    return template.replace(
        "  <script>\n    (function () {",
        f"{script}  <script>\n    (function () {{",
        1,
    )


def _render_picking_list_pdf_in_worker(html: str) -> bytes:
    async def _generate() -> bytes:
        from playwright.async_api import async_playwright

        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch()
            try:
                page = await browser.new_page()
                await page.set_content(html, wait_until="domcontentloaded")
                await page.wait_for_function(
                    """() => {
                        const root = document.getElementById('print-root');
                        return root && !root.classList.contains('is-empty');
                    }""",
                    timeout=15_000,
                )
                await page.emulate_media(media="print")
                return await page.pdf(
                    format="A4",
                    print_background=True,
                    prefer_css_page_size=True,
                    margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                )
            finally:
                await browser.close()

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    try:
        return asyncio.run(_generate())
    except NotImplementedError as exc:
        raise RuntimeError(
            "Không khởi chạy được trình duyệt Playwright trên Windows. "
            "Thử khởi động lại backend hoặc chạy: playwright install chromium"
        ) from exc
    except Exception as exc:
        message = str(exc)
        if "Executable doesn't exist" in message or "BrowserType.launch" in message:
            raise RuntimeError(PLAYWRIGHT_INSTALL_HINT) from exc
        raise RuntimeError(f"Không xuất được PDF picking list: {message}") from exc


def render_picking_list_pdf(html: str) -> bytes:
    try:
        from playwright.async_api import async_playwright  # noqa: F401
    except ImportError as exc:
        raise RuntimeError(PLAYWRIGHT_INSTALL_HINT) from exc

    future = _PDF_EXECUTOR.submit(_render_picking_list_pdf_in_worker, html)
    try:
        return future.result(timeout=120)
    except Exception as exc:
        if isinstance(exc, RuntimeError):
            raise
        raise RuntimeError(f"Không xuất được PDF picking list: {exc}") from exc


def create_picking_list_pdf(
    db: Session,
    vehicle_no: str,
    *,
    warehouse_id: int | None = None,
    location_id: int | None = None,
) -> tuple[bytes, str, int]:
    payload, batch = prepare_picking_list(
        db,
        vehicle_no,
        create_new=True,
        location_id=location_id,
        warehouse_id=warehouse_id,
    )
    html = render_picking_list_html(payload)
    pdf_bytes = render_picking_list_pdf(html)
    filename = picking_list_pdf_filename(vehicle_no, batch)
    return pdf_bytes, filename, batch


def download_picking_list_pdf(
    db: Session,
    vehicle_no: str,
    extracted: int,
    *,
    warehouse_id: int | None = None,
    location_id: int | None = None,
) -> tuple[bytes, str]:
    payload, batch = prepare_picking_list(
        db,
        vehicle_no,
        extracted=extracted,
        location_id=location_id,
        warehouse_id=warehouse_id,
    )
    html = render_picking_list_html(payload)
    pdf_bytes = render_picking_list_pdf(html)
    filename = picking_list_pdf_filename(vehicle_no, batch)
    return pdf_bytes, filename
