"""Durable evidence for manual robot returns, independent of business rollback."""
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.logger import get_logger
from app.modules.masan.masan_auto_model import OutboundAutoCommand
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation as Allocation

logger = get_logger("main")
_KEY = "manual_return_send_attempt"


@dataclass
class Attempt:
    task_id: int
    started: bool = False
    acknowledged: bool = False


def register(db, task):
    """Only call at creation of a NEW return, in its business transaction."""
    command = db.query(OutboundAutoCommand).filter_by(robot_task_id=task.id).first()
    if command is None:
        command = OutboundAutoCommand(robot_task_id=task.id, kind="return", state="waiting")
        db.add(command)
        db.flush()
    return command


def _write(db, task_id, state, error=None):
    # Do not commit the caller's allocation changes just to persist a send marker.
    with Session(bind=db.get_bind(), expire_on_commit=False) as journal:
        command = journal.query(OutboundAutoCommand).filter_by(robot_task_id=task_id).first()
        previous = command.state if command else None
        if command is None:
            command = OutboundAutoCommand(robot_task_id=task_id, kind="return")
            journal.add(command)
        if command.cycle_id is not None:
            raise ValueError("Return đã được bộ điều phối tiếp quản")
        # A callback can win the race with the HTTP response: never regress it.
        if (command.state not in {"completed", "failed", "cancelled"} or state == "sending"
            or (state == "completed" and command.state != "completed")):
            command.state, command.error = state, error
        journal.commit()
    for value in list(db.identity_map.values()):
        if isinstance(value, OutboundAutoCommand) and value.robot_task_id == task_id:
            db.expire(value)
    return previous


def http_started(db, task):
    attempt = db.info.get(_KEY)
    if attempt and attempt.task_id == task.id:
        attempt.started = True


def http_response(db, task, response):
    attempt = db.info.get(_KEY)
    if attempt and attempt.task_id == task.id:
        attempt.acknowledged = isinstance(response, dict) and response.get("code") in (1000, "1000")


def execute(db, task, operation):
    """Track a wholly manual return; keep its result and HTTP semantics intact."""
    rows = db.query(Allocation).filter_by(robot_task_id=task.id).all() if task else []
    if not rows or any(row.allocation_type != "return" for row in rows):
        return operation()
    command = db.query(OutboundAutoCommand).filter_by(robot_task_id=task.id).first()
    if command and command.cycle_id is not None:
        return operation()  # Shared auto executor owns its durable send boundary.
    task_id, order_id = task.id, task.order_id
    warehouse_id = rows[0].outbound_order_detail.outbound_order.warehouse_id
    vt_id = rows[0].from_location_id
    from app.modules.masan.masan_auto_service import pair_for_location
    pair = pair_for_location(db, rows[0].from_location) if rows[0].from_location else None
    zone_id = pair[0] if pair else None
    previous_state = _write(db, task_id, "sending")
    attempt = Attempt(task_id)
    previous = db.info.get(_KEY)
    db.info[_KEY] = attempt
    logger.info("outbound.return event=sending warehouse=%s zone=%s vt=%s cycle=None task_id=%s task=%s", warehouse_id, zone_id, vt_id, task_id, order_id)
    try:
        result = operation()
    except Exception as exc:
        # The API already rolls failed business transactions back. Do it before
        # writing the independent journal, including validation failures.
        db.rollback()
        try:
            _write(db, task_id, "unknown" if attempt.started else previous_state or "unknown", str(exc))
        except Exception:
            logger.exception("Cannot finalize manual return journal task=%s; sending remains unresolved", order_id)
        logger.warning("outbound.return event=send_error warehouse=%s zone=%s vt=%s cycle=None task_id=%s task=%s http_started=%s reason=%s",
                       warehouse_id, zone_id, vt_id, task_id, order_id, attempt.started, str(exc))
        raise
    else:
        state = ("accepted" if attempt.acknowledged else "unknown") if attempt.started else previous_state or "unknown"
        try:
            _write(db, task_id, state)
        except Exception:
            # Preserve the original successful manual response. The durable
            # sending marker still prevents automatic takeover after this error.
            logger.exception("Cannot finalize manual return journal task=%s; sending remains unresolved", order_id)
        logger.info("outbound.return event=%s warehouse=%s zone=%s vt=%s cycle=None task_id=%s task=%s", state, warehouse_id, zone_id, vt_id, task_id, order_id)
        return result
    finally:
        if previous is None:
            db.info.pop(_KEY, None)
        else:
            db.info[_KEY] = previous


def callback(db, task, mapped):
    rows = db.query(Allocation).filter_by(robot_task_id=task.id).all()
    if not rows or any(row.allocation_type != "return" for row in rows):
        return
    command = db.query(OutboundAutoCommand).filter_by(robot_task_id=task.id).first()
    if command and command.cycle_id is not None:
        return
    state = {"completed": "completed", "failed": "failed", "cancelled": "cancelled",
             "in_progress": "accepted"}.get(mapped, "unknown")
    _write(db, task.id, state)
    from app.modules.masan.masan_auto_service import pair_for_location
    pair = pair_for_location(db, rows[0].from_location) if rows[0].from_location else None
    logger.info("outbound.return event=callback warehouse=%s zone=%s vt=%s cycle=None task_id=%s task=%s state=%s",
        rows[0].outbound_order_detail.outbound_order.warehouse_id, pair[0] if pair else None,
        rows[0].from_location_id, task.id, task.order_id, state)
