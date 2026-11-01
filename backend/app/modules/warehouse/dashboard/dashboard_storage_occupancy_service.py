from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.warehouse.dashboard.dashboard_schema import ReportStorageOccupancyResponse
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.location_map.location_service import (
    location_ids_with_assigned_qr,
    overlay_status_with_assign_cache,
)
from app.modules.warehouse.warehouse_zone.warehouse_model import Zone
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists


def get_report_storage_occupancy(
    db: Session, *, warehouse_id: int
) -> ReportStorageOccupancyResponse:
    _ensure_warehouse_exists(db, warehouse_id)
    zone_codes = [c.strip() for c in settings.zone_storage if c and str(c).strip()]
    if not zone_codes:
        return ReportStorageOccupancyResponse(
            total_locations=0,
            occupied_locations=0,
            occupancy_percent=0,
        )

    locations = (
        db.query(Location)
        .join(Zone, Zone.id == Location.zone_id)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.is_active.is_(True),
            Zone.code.in_(zone_codes),
        )
        .all()
    )
    if not locations:
        return ReportStorageOccupancyResponse(
            total_locations=0,
            occupied_locations=0,
            occupancy_percent=0,
        )

    assigned_ids = location_ids_with_assigned_qr()
    total = len(locations)
    empty_count = 0
    for loc in locations:
        status = overlay_status_with_assign_cache(loc.status, loc.id, assigned_ids)
        if status == "empty":
            empty_count += 1
    occupied = total - empty_count
    percent = round(occupied / total * 100) if total else 0
    return ReportStorageOccupancyResponse(
        total_locations=total,
        occupied_locations=occupied,
        occupancy_percent=percent,
    )
