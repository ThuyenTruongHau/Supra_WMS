from __future__ import annotations

from typing import Any

from fastapi.encoders import jsonable_encoder

from app.core.celery_app import celery_app
from app.core.database import db_session
from app.core.logger import get_logger
from app.modules.masan import masan_outbound_service
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse

logger = get_logger("main")


def _dump(result: Any) -> Any:
    if result is None:
        return None
    return jsonable_encoder(result)


@celery_app.task(name="outbound.assign_cc_zone", acks_late=True)
def assign_cc_zone_task() -> None:
    with db_session() as db:
        warehouse_ids = [row[0] for row in db.query(Warehouse.id).all()]
        logger.info(f"Warehouse ids: {warehouse_ids}")
        for warehouse_id in warehouse_ids:
            try:
                masan_outbound_service.assign_cc_zone(db, warehouse_id)
            except Exception:
                db.rollback()
                logger.exception(
                    "outbound.assign_cc_zone failed warehouse_id=%s", warehouse_id
                )


@celery_app.task(name="masan.sorting_outbound_dispatch", acks_late=True)
def sending_masan_outbound_task_task(
    warehouse_id: int,
    zone: str,
    item_id: int,
    to_location_id: int,
) -> Any:
    logger.info(
        "masan.sorting_outbound_dispatch warehouse_id=%s zone=%s item_id=%s to_location_id=%s",
        warehouse_id,
        zone,
        item_id,
        to_location_id,
    )
    with db_session() as db:
        try:
            result = masan_outbound_service.sending_masan_outbound_task(
                db,
                warehouse_id=warehouse_id,
                zone=zone.strip(),
                item_id=item_id,
                to_location_id=to_location_id,
            )
            return _dump(result)
        except Exception:
            db.rollback()
            raise
