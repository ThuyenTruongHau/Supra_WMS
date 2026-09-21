from __future__ import annotations

from app.core.celery_app import celery_app
from app.core.database import db_session
from app.core.logger import get_logger
from app.modules.warehouse.notificcation import notification_service

logger = get_logger("main")


@celery_app.task(
    name="notification.check_long_holding_stock",
    acks_late=True,
)
def check_long_holding_stock_task() -> dict:
    logger.info("notification.check_long_holding_stock started")
    with db_session() as db:
        created = notification_service.check_long_holding_stock(db)
    logger.info(
        "notification.check_long_holding_stock done, created=%s",
        len(created),
    )
    return {"created_count": len(created)}
