from __future__ import annotations

from app.core.celery_app import celery_app
from app.core.database import db_session
from app.core.logger import get_logger
from app.modules.warehouse.dashboard import dashboard_snapshot_service

logger = get_logger("main")


@celery_app.task(
    name="dashboard.snapshot_inventory_daily",
    acks_late=True,
)
def snapshot_inventory_daily_task() -> dict:
    logger.info("dashboard.snapshot_inventory_daily started")
    with db_session() as db:
        result = dashboard_snapshot_service.run_daily_snapshots_for_all_warehouses(db)
    logger.info(
        "dashboard.snapshot_inventory_daily done warehouses=%s date=%s",
        result.get("warehouses"),
        result.get("snapshot_date"),
    )
    return result
