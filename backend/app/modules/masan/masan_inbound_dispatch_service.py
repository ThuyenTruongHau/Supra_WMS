"""Inbound dispatch. Database is authoritative; Celery only wakes durable work.

Lock order: inbound warehouse gate -> detail -> existing robot submission guard.
Callbacks release their detail transaction before acquiring the warehouse gate.
The session advisory lock survives commits and covers the complete HTTP send.
"""
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from threading import RLock
import json
import re
import uuid

from sqlalchemy import text

from app.core.cache import cache_delete, cache_get
from app.core.logger import get_logger
from app.modules.masan.masan_inbound_dispatch_model import InboundDispatchBatch as Batch, InboundDispatchCommand as Command, InboundDispatchControl as Control
from app.modules.robot.robot_model import RobotTask
from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrder, InboundOrderDetail as Detail
from app.modules.warehouse.location_map.location_model import Location

logger = get_logger("main")
TERMINAL = {"completed", "failed", "cancelled", "skipped"}
OCCUPIED = {"reserved", "sending", "accepted", "unknown"}
_locks = defaultdict(RLock)
_CONTEXT = "inbound_dispatch_command"


class DispatchConflict(ValueError):
    pass


def now():
    return datetime.now(timezone.utc)


@contextmanager
def warehouse_gate(db, warehouse_id):
    held = db.info.setdefault("inbound_dispatch_locks", set())
    if warehouse_id in held:
        yield
        return
    with _locks[int(warehouse_id)]:
        connection = None
        try:
            if db.get_bind().dialect.name == "postgresql":
                connection = db.get_bind().connect()
                connection.execute(text("SELECT pg_advisory_lock(103001, :warehouse)"), {"warehouse": warehouse_id})
                connection.commit()
            held.add(warehouse_id)
            db.expire_all()
            yield
        finally:
            held.discard(warehouse_id)
            if connection is not None:
                try:
                    connection.execute(text("SELECT pg_advisory_unlock(103001, :warehouse)"), {"warehouse": warehouse_id})
                    connection.commit()
                finally:
                    connection.close()


def wake():
    try:
        from app.modules.masan.masan_celery_task import coordinate_inbound_dispatch_task
        coordinate_inbound_dispatch_task.delay()
    except Exception:
        logger.exception("inbound.dispatch event=wake_failed; periodic reconciliation will retry")


def _control(db, warehouse_id):
    row = db.get(Control, warehouse_id)
    if row is None:
        row = Control(warehouse_id=warehouse_id, enabled=True)
        db.add(row)
        db.flush()
    if not row.legacy_migrated:
        key = f"inbound:caller_masan_inbound_order:{warehouse_id}"
        try:
            old = cache_get(key)
        except Exception:
            row.enabled = False
            row.message = "Chưa kiểm tra được hàng đợi nhập cũ; cần khôi phục Redis trước khi tiếp tục"
            db.commit()
            raise DispatchConflict(row.message)
        if old:
            row.enabled = False
            row.message = "Đã chuyển hàng đợi nhập cũ; bấm Tiếp tục sau khi đối chiếu lệnh đã phát"
            identifiers = list(dict.fromkeys(old.get("list_details", [])))
            if identifiers and not _batch(db, warehouse_id):
                batch = Batch(code=f"INB-{uuid.uuid4().hex[:12]}", warehouse_id=warehouse_id,
                              location_ids=[], assign_robot_id=old.get("assign_robot_id"))
                db.add(batch)
                db.flush()
                for position, identifier in enumerate(identifiers):
                    detail = db.get(Detail, identifier)
                    valid = detail and detail.inbound_order.warehouse_id == warehouse_id
                    db.add(Command(warehouse_id=warehouse_id, batch_id=batch.id, detail_id=identifier,
                                   position=position, assign_robot_id=batch.assign_robot_id,
                                   from_location_id=detail.from_location_id if valid else None,
                                   to_location_id=detail.to_location_id if valid else None,
                                   state="pending" if valid else "skipped"))
                db.flush()
                batch.location_ids = list(dict.fromkeys(
                    c.from_location_id for c in _commands(db, warehouse_id) if c.batch_id == batch.id and c.from_location_id))
        row.legacy_migrated = True
        db.commit()  # Mark imported before deleting Redis: interruption cannot import twice.
        if old:
            cache_delete(key)
    return row


def _batch(db, warehouse_id):
    return db.query(Batch).filter(Batch.warehouse_id == warehouse_id, Batch.completed_at.is_(None)).first()


def _commands(db, warehouse_id):
    return db.query(Command).filter(Command.warehouse_id == warehouse_id, Command.state.notin_(TERMINAL)).order_by(Command.id).all()


def _reconcile(db, control):
    rows = _commands(db, control.warehouse_id)
    known = {row.robot_task_id for row in rows if row.robot_task_id}
    # Account for tasks issued before deployment, including tasks outside this batch.
    legacy = db.query(RobotTask).join(Detail, Detail.id == RobotTask.inbound_order_detail_id).join(
        InboundOrder, InboundOrder.id == Detail.inbound_order_id).filter(
            InboundOrder.warehouse_id == control.warehouse_id, Detail.status.in_(["issued", "in_progress"]),
            RobotTask.status.notin_(["completed", "failed", "cancelled"])).all()
    for task in legacy:
        if task.id not in known:
            detail = db.get(Detail, task.inbound_order_detail_id)
            row = Command(warehouse_id=control.warehouse_id, detail_id=detail.id, state="accepted",
                          robot_task_id=task.id, order_id=task.order_id,
                          from_location_id=detail.from_location_id, to_location_id=detail.to_location_id)
            db.add(row)
            rows.append(row)
    for row in rows:
        if row.state == "sending":
            # This gate cannot be acquired while a live sender holds it.
            row.state, row.message = "unknown", f"Cần đối soát lệnh {row.order_id}: tiến trình gửi bị gián đoạn"
        if row.state in {"accepted", "unknown"} and row.robot_task_id:
            task = db.get(RobotTask, row.robot_task_id)
            detail = db.get(Detail, row.detail_id)
            state = task.status if task else None
            if state in {"completed", "failed", "cancelled"}:
                row.state, row.message = state, None
            elif detail and detail.status == "completed":
                row.state, row.message = "completed", None
            elif not task:
                row.state, row.message = "unknown", f"Cần đối soát lệnh {row.order_id}: mất dữ liệu RobotTask"
        elif row.state == "accepted":
            row.state, row.message = "unknown", f"Cần đối soát lệnh {row.order_id}: mất liên kết RobotTask"
        if row.state in {"unknown", "invalid"}:
            control.enabled = False
    db.flush()
    batch = _batch(db, control.warehouse_id)
    if batch:
        if not db.query(Command.id).filter(Command.batch_id == batch.id, Command.state.notin_(TERMINAL)).first():
            batch.completed_at = now()
    db.commit()


def _status(db, control):
    batch = _batch(db, control.warehouse_id)
    rows = _commands(db, control.warehouse_id)
    active = [r for r in rows if r.state not in TERMINAL]
    problems = [r for r in active if r.state in {"unknown", "invalid", "sending"}]
    waiting = sum(r.state in {"pending", "reserved", "invalid"} for r in active)
    issued = sum(r.state in {"sending", "accepted", "unknown"} for r in active)
    return {
        "warehouse_id": control.warehouse_id, "enabled": control.enabled,
        "state": "needs_review" if problems else "paused" if not control.enabled else "running" if active else "idle",
        "batch_id": batch.id if batch else None, "batch_code": batch.code if batch else None,
        "waiting_count": waiting, "issued_count": issued,
        "review_count": len(problems), "assign_robot_id": batch.assign_robot_id if batch else None,
        "sorting_persons": batch.sorting_persons if batch else None,
        "changed_by_id": control.changed_by_id, "changed_at": control.changed_at,
        "message": control.message,
        "problems": [{"command_id": r.id, "order_id": r.order_id, "detail_id": r.detail_id,
                      "state": r.state, "message": r.message} for r in problems],
    }


def status(db, warehouse_id):
    with warehouse_gate(db, warehouse_id):
        control = _control(db, warehouse_id)
        _reconcile(db, control)
        return _status(db, control)


def pause(db, warehouse_id, user_id):
    with warehouse_gate(db, warehouse_id):
        control = _control(db, warehouse_id)
        _reconcile(db, control)
        if control.enabled:
            control.enabled = False
            control.changed_by_id, control.changed_at = user_id, now()
        for command in _commands(db, warehouse_id):
            if command.state == "reserved":
                command.state, command.token = "pending", None
        db.commit()
        logger.info("inbound.dispatch event=pause warehouse=%s user=%s", warehouse_id, user_id)
        return _status(db, control)


def resume(db, warehouse_id, user_id):
    with warehouse_gate(db, warehouse_id):
        control = _control(db, warehouse_id)
        _reconcile(db, control)
        rows = _commands(db, warehouse_id)
        if any(r.state in {"unknown", "sending"} for r in rows):
            raise DispatchConflict("Cần đối soát lệnh nhập chưa rõ kết quả trước khi tiếp tục")
        for command in rows:
            if command.state == "invalid":
                error = _validate(db, command)
                if error:
                    raise DispatchConflict(error)
                if command.state != "skipped":
                    command.state, command.message = "pending", None
        if not control.enabled:
            control.enabled = True
            control.changed_by_id, control.changed_at = user_id, now()
        control.message = None
        db.commit()
        result = _status(db, control)
    wake()
    return result


def _validate(db, command):
    detail = db.get(Detail, command.detail_id)
    if not detail or detail.status in {"completed", "cancelled", "failed"}:
        command.state, command.message = "skipped", "Dòng nhập đã kết thúc hoặc không còn tồn tại"
        return None
    if detail.inbound_order.warehouse_id != command.warehouse_id or detail.status != "initialize":
        return f"Dòng {command.detail_id}: trạng thái hoặc kho đã thay đổi; cần đối soát"
    if not detail.from_location or not detail.to_location:
        return f"Dòng {command.detail_id}: chưa có vị trí nguồn hoặc đích"
    if (detail.from_location_id != command.from_location_id or detail.to_location_id != command.to_location_id):
        return f"Dòng {command.detail_id}: vị trí nguồn/đích đã thay đổi so với đợt gọi"
    if any(loc.warehouse_id != command.warehouse_id or not loc.is_active
           for loc in (detail.from_location, detail.to_location)):
        return f"Dòng {command.detail_id}: vị trí không còn hợp lệ"
    if not detail.allocations or any(int(a.quantity) <= 0 or not a.item_stock or not a.item_stock.is_active
                                     for a in detail.allocations):
        return f"Dòng {command.detail_id}: phân bổ hàng không còn hợp lệ"
    if any(a.item_stock.location_id != detail.from_location_id or a.item_stock.status == "virtual"
           for a in detail.allocations):
        return f"Dòng {command.detail_id}: hàng không còn ở vị trí nguồn"
    return None


def create_batch(db, location_ids, assign_robot_id=None, sorting_persons=None):
    locations = db.query(Location).filter(Location.id.in_(set(location_ids))).all()
    warehouses = {loc.warehouse_id for loc in locations}
    if len(locations) != len(set(location_ids)) or len(warehouses) != 1:
        raise DispatchConflict("Các ô nhập phải tồn tại và thuộc cùng một kho")
    warehouse_id = warehouses.pop()
    with warehouse_gate(db, warehouse_id):
        control = _control(db, warehouse_id)
        _reconcile(db, control)
        if not control.enabled:
            raise DispatchConflict("Kho đang tạm dừng gửi lệnh nhập; hãy bấm Tiếp tục trước khi gọi")
        previous = _batch(db, warehouse_id)
        if previous:
            raise DispatchConflict(f"Đợt {previous.code} chưa kết thúc; không thể ghi đè danh sách chờ")
        if any(r.state in {"pending", "reserved"} for r in _commands(db, warehouse_id)):
            raise DispatchConflict("Kho còn lệnh nhập đang chờ; hãy tiếp tục phần việc hiện tại")
        groups = defaultdict(list)
        by_id = {loc.id: loc for loc in locations}
        for identifier in dict.fromkeys(location_ids):
            detail = db.query(Detail).filter(Detail.from_location_id == identifier, Detail.status == "initialize").order_by(Detail.id.desc()).first()
            match = re.search(r"(\d{2})$", (by_id[identifier].location_name or "").strip())
            if detail and detail.inbound_order.warehouse_id == warehouse_id and match:
                groups[int(match.group(1)) % 4].append(detail)
        details = [d for group in (0, 3, 2, 1) for d in groups[group]]
        if not details:
            return {"queued": 0, "detail_ids": [], "job_ids": [], "batch_id": None, "waiting_count": 0}
        batch = Batch(code=f"INB-{uuid.uuid4().hex[:12]}", warehouse_id=warehouse_id,
                      location_ids=list(dict.fromkeys(location_ids)), assign_robot_id=assign_robot_id, sorting_persons=sorting_persons)
        db.add(batch)
        db.flush()
        for position, detail in enumerate(details):
            detail.sorting_persons = sorting_persons
            db.add(Command(warehouse_id=warehouse_id, batch_id=batch.id, position=position,
                           detail_id=detail.id, from_location_id=detail.from_location_id,
                           to_location_id=detail.to_location_id, assign_robot_id=assign_robot_id, state="pending"))
        db.commit()
        jobs = _reserve(db, control)
        reserved = [r for r in _commands(db, warehouse_id) if r.batch_id == batch.id and r.state == "reserved"]
        result = {"queued": len(reserved), "detail_ids": [r.detail_id for r in reserved],
                  "job_ids": jobs, "batch_id": batch.id, "waiting_count": len(details)}
    wake()
    return result


def _reserve(db, control):
    rows = _commands(db, control.warehouse_id)
    slots = max(0, 2 - sum(r.state in OCCUPIED for r in rows))
    pending = sorted((r for r in rows if r.state == "pending"), key=lambda r: (r.batch_id or 0, r.position or 0, r.id))
    for command in pending[:slots]:
        error = _validate(db, command)
        if error:
            command.state, command.message = "invalid", error
            control.enabled = False
            break
        if command.state == "skipped":
            continue
        command.state, command.token, command.reserved_at = "reserved", str(uuid.uuid4()), None
    db.commit()
    jobs = []
    if not control.enabled:
        return jobs
    from app.modules.warehouse.inbound_order.inbound_celery_task import dispatch_inbound_command_task
    for command in rows:
        if command.state != "reserved":
            continue
        timestamp = command.reserved_at
        if timestamp and timestamp.replace(tzinfo=timezone.utc) > now() - timedelta(seconds=60):
            continue
        try:
            job = dispatch_inbound_command_task.apply_async(kwargs={"command_id": command.id, "token": command.token}, retry=False)
            jobs.append(job.id)
            command.reserved_at = now()
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("inbound.dispatch event=publish_failed command=%s; reservation retained", command.id)
    return jobs


def tick(db, warehouse_id):
    with warehouse_gate(db, warehouse_id):
        control = _control(db, warehouse_id)
        _reconcile(db, control)
        if control.enabled:
            _reserve(db, control)


def dispatch_one(db, command_id, token):
    command = db.get(Command, command_id)
    if not command:
        return
    with warehouse_gate(db, command.warehouse_id):
        db.refresh(command)
        control = _control(db, command.warehouse_id)
        if command.state != "reserved" or command.token != token:
            return
        if not control.enabled:
            command.state, command.token = "pending", None
            db.commit()
            return
        error = _validate(db, command)
        if error or command.state == "skipped":
            if error:
                command.state, command.message, control.enabled = "invalid", error, False
            db.commit()
            return
        db.info[_CONTEXT] = command.id
        try:
            from app.modules.warehouse.inbound_order.inbound_order_service import execute_inbound_task
            execute_inbound_task(db, command.detail_id, assign_robot_id=command.assign_robot_id)
            db.refresh(command)
            if command.state == "reserved":  # Manual completion has no RCS request.
                command.state = "completed"
                db.commit()
        except Exception as exc:
            db.rollback()
            db.refresh(command)
            if command.state not in TERMINAL and command.state != "unknown":
                command.state = "unknown" if command.state == "sending" else "invalid"
                command.message = str(exc)
                control.enabled = False
                db.commit()
            logger.exception("inbound.dispatch event=execute_error command=%s", command_id)
        finally:
            db.info.pop(_CONTEXT, None)


def execute_detail(db, detail_id, operation):
    detail = db.get(Detail, detail_id)
    if not detail:
        raise ValueError("Detail not found")
    warehouse_id = detail.inbound_order.warehouse_id
    with warehouse_gate(db, warehouse_id):
        control = _control(db, warehouse_id)
        if not control.enabled:
            raise DispatchConflict("Kho đang tạm dừng gửi lệnh nhập")
        from app.modules.warehouse.inbound_order.inbound_lock import lock_inbound_detail
        lock_inbound_detail(db, detail_id)
        # Re-delivered legacy jobs must not issue the same detail a second time.
        db.refresh(detail)
        if detail.status != "initialize":
            raise DispatchConflict("Dòng nhập đã được gọi hoặc đã kết thúc")
        current = db.info.get(_CONTEXT)
        conflict = db.query(Command).filter(Command.detail_id == detail_id, Command.state.notin_(TERMINAL)).first()
        if conflict and conflict.id != current:
            raise DispatchConflict("Dòng nhập đang thuộc một đợt gọi; hãy tiếp tục đợt hiện tại")
        if conflict:
            error = _validate(db, conflict)
            if error:
                raise DispatchConflict(error)
        return operation()


def execute_caller(db, warehouse_id, operation, preserve_if_paused=False):
    with warehouse_gate(db, warehouse_id):
        control = _control(db, warehouse_id)
        if not control.enabled and not preserve_if_paused:
            raise DispatchConflict("Kho đang tạm dừng gửi lệnh nhập")
        return operation(not control.enabled)


def guarded_submission(db, task, operation):
    """Final barrier, including calls that bypass execute_inbound_task."""
    detail = db.get(Detail, task.inbound_order_detail_id)
    if not detail:
        raise DispatchConflict("Không tìm thấy dòng nhập")
    warehouse_id = detail.inbound_order.warehouse_id
    with warehouse_gate(db, warehouse_id):
        control = _control(db, warehouse_id)
        if not control.enabled:
            raise DispatchConflict("Kho đang tạm dừng gửi lệnh nhập")
        db.refresh(detail)
        if detail.status != "initialize":
            raise DispatchConflict("Dòng nhập đã được gọi hoặc đã kết thúc")
        command_id = db.info.get(_CONTEXT)
        command = db.get(Command, command_id) if command_id else None
        if command is None:
            _reconcile(db, control)
            if not control.enabled:
                raise DispatchConflict("Cần đối soát lệnh nhập trước khi gọi tiếp")
            if _batch(db, warehouse_id) or sum(r.state in OCCUPIED for r in _commands(db, warehouse_id)) >= 2:
                raise DispatchConflict("Kho đang có đợt nhập hoặc đã đủ 2 lệnh nhập đang xử lý")
            if db.query(Command).filter(Command.detail_id == detail.id, Command.state.notin_(TERMINAL)).first():
                raise DispatchConflict("Dòng nhập đã thuộc hàng đợi; không thể tạo lệnh khác")
            command = Command(warehouse_id=warehouse_id, detail_id=detail.id, state="reserved",
                              from_location_id=detail.from_location_id, to_location_id=detail.to_location_id,
                              assign_robot_id=next((segment.get("assignRobotIds") for segment in json.loads(task.task_order_detail or "[]") if segment.get("assignRobotIds")), None))
            db.add(command)
        if command.order_id and (task.order_id != command.order_id or command.state != "reserved"):
            raise DispatchConflict("Lệnh đã có mã gửi RCS; cần đối soát trước khi gửi lại")
        db.add(task)
        db.flush()
        command.order_id, command.robot_task_id = task.order_id, task.id
        db.commit()  # Persist the task identity before any HTTP request.
        try:
            result = operation()
        except Exception as exc:
            db.rollback()
            db.refresh(command)
            if command.state not in TERMINAL:
                command.state = "unknown" if command.state == "sending" else "invalid"
                command.message, control.enabled = str(exc), False
                db.commit()
            raise
        db.refresh(command)
        if command.state not in TERMINAL:
            command.state, command.message = "accepted", None
        db.commit()
        return result


def http_started(db, task):
    if not task.inbound_order_detail_id:
        return
    command = db.query(Command).filter_by(robot_task_id=task.id).one()
    command.state = "sending"
    db.commit()
    logger.info("inbound.dispatch event=sending warehouse=%s command=%s order=%s", command.warehouse_id, command.id, task.order_id)


def validate_ack(task, response):
    if task.inbound_order_detail_id and (not isinstance(response, dict) or response.get("code") not in (1000, "1000")):
        raise DispatchConflict(f"RCS chưa xác nhận nhận lệnh {task.order_id}: {response}")


def record_callback(db, task, state):
    if state not in {"in_progress", "completed", "failed", "cancelled"}:
        return
    detail = db.get(Detail, task.inbound_order_detail_id)
    with warehouse_gate(db, detail.inbound_order.warehouse_id):
        command = db.query(Command).filter_by(robot_task_id=task.id).first()
        if command and command.state not in TERMINAL:
            command.state = "accepted" if state == "in_progress" else state
            command.message = None
            db.commit()
    wake()


def prepared_task(db):
    identifier = db.info.get(_CONTEXT)
    command = db.get(Command, identifier) if identifier else None
    return db.get(RobotTask, command.robot_task_id) if command and command.robot_task_id else None


def retain_legacy_job(db, detail_id, assign_robot_id=None):
    """Old broker messages have no command token; retain them when paused at rollout.

    New HTTP calls explicitly opt out, so a rejected user action never queues work.
    """
    detail = db.get(Detail, detail_id)
    if not detail or detail.status != "initialize":
        return False
    warehouse_id = detail.inbound_order.warehouse_id
    with warehouse_gate(db, warehouse_id):
        control = _control(db, warehouse_id)
        if control.enabled:
            return False
        if not db.query(Command).filter(Command.detail_id == detail_id, Command.state.notin_(TERMINAL)).first():
            db.add(Command(warehouse_id=warehouse_id, detail_id=detail_id, assign_robot_id=assign_robot_id,
                           from_location_id=detail.from_location_id, to_location_id=detail.to_location_id, state="pending"))
            db.commit()
        return True


def verify_unsent(db, warehouse_id, command_id, user_id, note):
    """Explicit operator attestation, after checking the RCS order by its stable ID."""
    with warehouse_gate(db, warehouse_id):
        control = _control(db, warehouse_id)
        _reconcile(db, control)
        command = db.get(Command, command_id)
        if not command or command.warehouse_id != warehouse_id or command.state != "unknown":
            raise DispatchConflict("Chỉ xác minh lệnh chưa rõ kết quả trong kho đang chọn")
        detail = db.get(Detail, command.detail_id)
        task = db.get(RobotTask, command.robot_task_id)
        if not note.strip() or not detail or detail.status != "initialize" or not task or task.status != "initialize":
            raise DispatchConflict("Lệnh đã có tiến độ hoặc thiếu dữ liệu; cần đối soát tại RCS")
        command.state, command.message, command.token = "pending", None, None
        command.verified_by_id, command.verification_note = user_id, note.strip()
        control.enabled = False
        db.commit()
        logger.warning("inbound.dispatch event=verified_unsent warehouse=%s command=%s order=%s user=%s", warehouse_id, command_id, command.order_id, user_id)
        return _status(db, control)
