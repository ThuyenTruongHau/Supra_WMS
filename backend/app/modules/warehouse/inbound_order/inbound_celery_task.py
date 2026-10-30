from __future__ import annotations

from typing import Any, Optional

from fastapi.encoders import jsonable_encoder

from app.core.celery_app import celery_app
from app.core.database import db_session
from app.core.logger import get_logger
from app.modules.warehouse.inbound_order import inbound_order_service
from app.modules.warehouse.inbound_order.inbound_order_schema import (
    InboundOrderCreate,
    InboundOrderUpdate,
)

logger = get_logger("main")


def _dump(result: Any) -> Any:
    if result is None:
        return None
    if hasattr(result, "model_dump"):
        return jsonable_encoder(result.model_dump(mode="json"))
    return jsonable_encoder(result)


@celery_app.task(name="inbound.create_order", acks_late=True)
def create_inbound_order_task(
    body: dict,
    user_id: int,
    inbound_type: str,
) -> Any:
    logger.info("inbound.create_order order_code=%s", body.get("order_code"))
    with db_session() as db:
        order = inbound_order_service.create_inbound_order(
            db,
            InboundOrderCreate.model_validate(body),
            user_id=user_id,
            inbound_type=inbound_type,
        )
        return _dump(order)


@celery_app.task(name="inbound.update_order", acks_late=True)
def update_inbound_order_task(
    order_code: str,
    body: dict,
    inbound_type: str,
    user_id: int,
) -> Any:
    logger.info("inbound.update_order order_code=%s", order_code)
    with db_session() as db:
        order = inbound_order_service.update_inbound_order(
            db,
            order_code,
            InboundOrderUpdate.model_validate(body),
            inbound_type,
            user_id=user_id,
        )
        return _dump(order)


@celery_app.task(name="inbound.get_order_details", acks_late=True)
def get_inbound_order_details_task(order_code: str) -> Optional[Any]:
    logger.info("inbound.get_order_details order_code=%s", order_code)
    with db_session() as db:
        details = inbound_order_service.get_inbound_order_detail(db, order_code)
        if details is None:
            return None
        return _dump(details)


@celery_app.task(name="inbound.dispatch_command", acks_late=True)
def dispatch_inbound_command_task(command_id: int, token: str):
    from app.modules.masan.masan_inbound_dispatch_service import dispatch_one
    with db_session() as db:
        dispatch_one(db, command_id, token)


@celery_app.task(name="inbound.accept_task", bind=True, acks_late=True)
def accept_inbound_task_task(
    self, detail_id: int, assign_robot_id: str | None = None, preserve_if_paused: bool = True
) -> Any:
    logger.info(
        "inbound.accept_task detail_id=%s assign_robot_id=%s job_id=%s",
        detail_id,
        assign_robot_id,
        self.request.id,
    )
    try:
        with db_session() as db:
            result = inbound_order_service.execute_inbound_task(
                db, detail_id, assign_robot_id=assign_robot_id
            )
            return _dump(result)
    except Exception as exc:
        from app.modules.masan.masan_inbound_dispatch_service import DispatchConflict, retain_legacy_job
        if isinstance(exc, DispatchConflict) and preserve_if_paused:
            with db_session() as db:
                if retain_legacy_job(db, detail_id, assign_robot_id):
                    return {"deferred": True, "detail_id": detail_id}
        # The durable send journal owns uncertainty. Never retry an HTTP send here.
        raise


@celery_app.task(name="inbound.caller_order", acks_late=True)
def caller_inbound_order_task(
    body: dict,
    user_id: int,
    inbound_type: str,
    preserve_if_paused: bool = True,
) -> Any:
    logger.info("inbound.caller_order order_code=%s", body.get("order_code"))
    with db_session() as db:
        order = inbound_order_service.caller_inbound_order(
            db,
            InboundOrderCreate.model_validate(body),
            user_id=user_id,
            inbound_type=inbound_type,
            preserve_if_paused=preserve_if_paused,
        )
        return _dump(order)
