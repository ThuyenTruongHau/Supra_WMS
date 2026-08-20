from __future__ import annotations

from app.core.celery_app import celery_app
from app.core.database import db_session
from app.core.logger import get_logger
from app.modules.warehouse.item.item_import_utils import (
    mark_import_job_failed,
    run_import_item_masan_pipeline,
    update_import_job,
)

logger = get_logger("main")


@celery_app.task(
    name="item.import_masan",
    bind=True,
    acks_late=True,
    soft_time_limit=3600,
    time_limit=3900,
)
def import_item_masan_task(
    self,
    job_id: str,
    warehouse_id: int,
    filename: str,
) -> dict:
    logger.info(
        "item.import_masan started job_id=%s warehouse_id=%s file=%s",
        job_id,
        warehouse_id,
        filename,
    )
    try:
        with db_session() as db:
            return run_import_item_masan_pipeline(
                db,
                job_id,
                warehouse_id,
                filename,
            )
    except Exception as exc:
        try:
            with db_session() as db:
                mark_import_job_failed(
                    db,
                    job_id,
                    exc,
                    warehouse_id=warehouse_id,
                    filename=filename,
                )
        except Exception:
            logger.exception(
                "item.import_masan failed to persist job status job_id=%s",
                job_id,
            )
            update_import_job(
                job_id,
                status="failed",
                warehouse_id=warehouse_id,
                filename=filename,
                message=str(exc),
                error_count=1,
            )
        raise
