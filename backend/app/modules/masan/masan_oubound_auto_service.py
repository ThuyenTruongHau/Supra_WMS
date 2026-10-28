from __future__ import annotations

from collections import defaultdict
from io import BytesIO
from typing import Any, Optional
from sqlalchemy import func, Integer, cast, or_
import uuid
import json
from sqlalchemy import or_

from app.core.config import settings
from openpyxl import Workbook

from app.modules.masan.masan_excel_io import load_masan_workbook
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.cache import cache_set, cache_get, cache_scan_keys, cache_delete, cache_delete_pattern
from app.modules.masan.masan_outbound_excel import (
    COLUMN_ALIASES,
    DATA_START_ROW,
    HEADER_ROW,
    TRIP_PLACEHOLDERS,
)
from app.modules.robot.robot_model import RobotTask
from app.modules.warehouse.outbound_order.outbound_order_schema import (
    AllocationOutboundTaskExecute,
    CalculateOutboundDetail,
    DetailForCalculate,
    OutboundRobotTaskCreate,
)
from app.modules.warehouse.outbound_order.outbound_order_service import (
    calculate_outbound_order,
    execute_outbound_task,
    _settle_outbound_stock,
)
from app.modules.masan.masan_outbound_so_excel import (
    build_so_customer_sheet,
    sanitize_sheet_name,
)
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrder,
    OutboundOrderAllocation,
    OutboundOrderDetail,
)
from app.modules.masan.masan_schema import (
    MasanOutboundLineItem,
    MasanOutboundParseResponse,
    MasanOutboundPreviewRow,
)
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.lot_number_utils import (
    coerce_masan_lot_cell,
    format_lot_for_masan_excel,
    format_lot_value_for_display,
    normalize_masan_lot_cell,
    parse_legacy_lot_number,
)
from app.modules.warehouse.warehouse_zone.warehouse_model import Zone
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists
from app.core.logger import get_logger
from app.socket.ws_events import (
    EVENT_MASAN_SORTING_STOCK_READY,
    publish_masan_sorting_zone,
)

logger = get_logger("main")

def clear_outbound_station_cache(
    warehouse_id: int,
    list_cc_ids: list[int],
) -> dict[str, Any]:
    if warehouse_id <= 0:
        raise ValueError("warehouse_id is required")

    cc_ids = {int(x) for x in list_cc_ids if int(x) > 0}
    if not cc_ids:
        return {
            "assigned_cc_location": 0,
            "assigned_cc_details": 0,
            "stock_ready": 0,
            "orphan_details": 0,
        }

    detail_ids: set[int] = set()
    zones_seen: set[str] = set()
    deleted_location = 0

    for cc_id in cc_ids:
        loc_key = f"outbound:assigned_cc_location:{warehouse_id}:{cc_id}"
        bucket = cache_get(loc_key)
        if bucket:
            z = (bucket.get("zone") or "").strip()
            if z:
                zones_seen.add(z)
            for line in bucket.get("lines") or []:
                if isinstance(line, dict) and line.get("detail_id") is not None:
                    detail_ids.add(int(line["detail_id"]))
            cache_delete(loc_key)
            deleted_location += 1

 
    deleted_details = 0
    for detail_id in detail_ids:
        det_key = f"outbound:assigned_cc_details:{warehouse_id}:{detail_id}"
        if cache_get(det_key) is not None:
            cache_delete(det_key)
            deleted_details += 1

    orphan_details = 0
    for scanned in cache_scan_keys(
        f"outbound:assigned_cc_details:{warehouse_id}:*"
    ):
        suffix = scanned.rsplit(":", 1)[-1]
        if not suffix.isdigit():
            continue
        detail_id = int(suffix)
        det_key = f"outbound:assigned_cc_details:{warehouse_id}:{detail_id}"
        meta = cache_get(det_key)
        if not isinstance(meta, dict):
            continue
        loc_id = meta.get("location_id")
        if loc_id is not None and int(loc_id) in cc_ids:
            cache_delete(det_key)
            orphan_details += 1


    deleted_stock = 0
    for cc_id in cc_ids:
        deleted_stock += cache_delete_pattern(
            f"outbound:masan:stock_ready:{warehouse_id}:*:{cc_id}"
        )

    logger.info(f"Deleted stock ready: {deleted_stock}")
    logger.info(f"Deleted location: {deleted_location}")
    logger.info(f"Deleted details: {deleted_details}")

    return {
        "assigned_cc_location": deleted_location,
        "assigned_cc_details": deleted_details,
        "stock_ready": deleted_stock,
        "orphan_details": orphan_details,
        "zones_seen": list(zones_seen),
    }

ACTIVE_ALLOC_STATUSES = ("issued", "in_progress") 

def _exist_robot_task(db: Session, to_location_id: int) -> bool:
    return (
        db.query(OutboundOrderAllocation.id)
        .filter(
            OutboundOrderAllocation.to_location_id == to_location_id,
            OutboundOrderAllocation.status.in_(ACTIVE_ALLOC_STATUSES),
            OutboundOrderAllocation.robot_task_id.isnot(None),
        )
        .first()
        is not None
    )

def robot_task_for_zone(db:Session, zone_str:str) -> list[RobotTask]: 
    allocations = (
        db.query(OutboundOrderAllocation)
        .join(
            Location,
            or_(
                OutboundOrderAllocation.to_location_id == Location.id,
                OutboundOrderAllocation.from_location_id == Location.id,
            ),
        )
        .join(Zone, Location.zone_id == Zone.id)
        .filter(
            Zone.code == zone_str.strip(),
            OutboundOrderAllocation.status.in_(ACTIVE_ALLOC_STATUSES),
            OutboundOrderAllocation.robot_task_id.isnot(None),
        )
        .options(joinedload(OutboundOrderAllocation.robot_task))
        .all()
    )
    seen: set[int] = set()
    out: list[RobotTask] = []
    for a in allocations:
        tid = a.robot_task_id
        if tid is None or tid in seen:
            continue
        seen.add(tid)
        if a.robot_task is not None:
            out.append(a.robot_task)
    return out
