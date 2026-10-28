"""Claim only existing, ready, provably unsent return tasks; never their picks."""
from decimal import Decimal

from app.modules.masan import masan_auto_service as auto
from app.modules.masan.masan_auto_model import OutboundAutoCommand, OutboundAutoCycle
from app.modules.masan.masan_sorting_return_service import evaluate_return_tasks, sorting_return_tasks
from app.modules.robot.robot_model import RobotTask, TaskStatus
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation as Allocation

MODE = "adopted_return"
_CALLBACK_KEY = "adopted_return_protected_pick"


def candidates(db, warehouse_id, display_zone_id):
    zone = auto.configuration(display_zone_id)[0]
    mapping = auto.resolve_locations(db, warehouse_id, display_zone_id)
    tasks = sorting_return_tasks(db, warehouse_id, zone, include_noninitial=True)
    evaluations = evaluate_return_tasks(db, warehouse_id, zone, tasks)
    commands = {c.robot_task_id: c for c in db.query(OutboundAutoCommand).filter(
        OutboundAutoCommand.robot_task_id.in_([t.id for t in tasks])).all()}
    callbacks = {r[0] for r in db.query(TaskStatus.order_id).filter(TaskStatus.order_id.in_([t.order_id for t in tasks])).all()}
    owners = auto.active_cycles(db, warehouse_id)
    result = []
    for task in tasks:
        if auto.cycle_for_task(db, task.id):
            continue
        evaluation = evaluations[task.id]
        rows = evaluation.allocations
        vt = next((loc for loc in mapping.values() if any(loc.id == r.from_location_id for r in rows)), None)
        if not vt:
            continue
        stock_ids = {r.item_stock_id for r in rows}
        conflict = (any(c.vt_location_id == vt.id or stock_ids & set(c.stock_ids) for c in owners)
                    or db.query(RobotTask.id).filter(RobotTask.order_id == task.order_id, RobotTask.id != task.id).first() is not None)
        if not conflict:
            conflict = any(other.id != task.id and any(
                r.from_location_id == vt.id or r.item_stock_id in stock_ids for r in evaluations[other.id].allocations)
                for other in tasks)
        command = commands.get(task.id)
        state, reason = "ready", None
        if conflict:
            state, reason = "blocked", "Nhiều lượt/return tranh cùng VT hoặc stock; cần đối soát"
        elif task.order_id in callbacks or (command and command.state != "waiting"):
            state, reason = "blocked", "Return đã có callback hoặc lần gửi chưa được phép tiếp quản; cần đối soát"
        elif any(r.auto_cycle_id is not None for r in rows):
            state, reason = "blocked", "Allocation đã thuộc lượt khác; cần đối soát"
        elif evaluation.reason:
            state = "waiting_conditions" if evaluation.reason_code in {"confirmation", "detail_pending", "pallet_pending"} else "blocked"
            reason = evaluation.reason
        elif command is None:
            state, reason = "awaiting_verification", "Return cũ chưa có lịch sử gửi; cần xác nhận chưa gửi ICS"
        result.append({"task_id": task.id, "order_id": task.order_id, "location_id": vt.id,
            "name": vt.location_name, "quantity": task.quantity, "state": state,
            "message": reason or "Return đủ điều kiện tiếp quản", "can_verify": state == "awaiting_verification",
            "business_ready": evaluation.reason is None})
    return result


def verify_unsent(db, warehouse_id, display_zone_id, task_id, user_id, note):
    note = note.strip()
    if not note or len(note) > 2000:
        raise ValueError("Cần ghi chú đối soát ICS (tối đa 2000 ký tự)")
    with auto.warehouse_lock(db, warehouse_id):
        control = auto.zone_control(db, warehouse_id, display_zone_id)
        if control and control.enabled:
            raise ValueError("Dừng tự động trước khi xác nhận chưa gửi ICS")
        candidate = next((c for c in candidates(db, warehouse_id, display_zone_id) if c["task_id"] == task_id), None)
        command = db.query(OutboundAutoCommand).filter_by(robot_task_id=task_id).first()
        if command:
            # Repeated verification is harmless only for the identical verified,
            # still-unsent task. It can never clear sending/unknown/history.
            if (candidate and candidate["state"] == "ready" and command.verified_unsent_at
                and command.state == "waiting" and command.cycle_id is None):
                return auto.status(db, warehouse_id, display_zone_id)
            raise ValueError("Lệnh đã có lịch sử; không thể xác nhận lại hoặc xóa trạng thái chưa rõ")
        if not candidate or not candidate["can_verify"]:
            raise ValueError(candidate["message"] if candidate else "Return không hợp lệ trong kho/zone")
        db.add(OutboundAutoCommand(robot_task_id=task_id, kind="return", state="waiting",
            verified_unsent_by_id=user_id, verified_unsent_at=auto.now(), verification_note=note))
        db.commit()
        auto.logger.info("outbound.auto event=verify_unsent warehouse=%s zone=%s vt=%s cycle=None task_id=%s task=%s user=%s",
                         warehouse_id, display_zone_id, candidate["location_id"], task_id, candidate["order_id"], user_id)
        return auto.status(db, warehouse_id, display_zone_id)


def _snapshot(db, task, rows, vt_id):
    stocks = {r.item_stock_id: r.item_stock for r in rows}
    confirmed = db.query(Allocation.id).filter(Allocation.item_stock_id.in_(stocks),
        Allocation.to_location_id == vt_id, Allocation.allocation_type == "outbound", Allocation.status == "completed").all()
    return {"task_quantity": task.quantity,
        "rows": {str(r.id): [r.item_stock_id, r.outbound_order_detail_id, r.from_location_id, r.to_location_id, str(r.quantity)] for r in rows},
        "stocks": {str(s.id): str(s.quantity) for s in stocks.values()},
        "confirmed_outbound_ids": [r[0] for r in confirmed]}


def validate_snapshot(db, cycle):
    saved = cycle.cc_assignments["_adoption"]
    task = db.get(RobotTask, cycle.return_task_id)
    rows = db.query(Allocation).filter_by(robot_task_id=task.id).all()
    current = _snapshot(db, task, rows, cycle.vt_location_id)
    if (current["task_quantity"] != saved["task_quantity"] or current["rows"] != saved["rows"]
        or {key: Decimal(value) for key, value in current["stocks"].items()} !=
           {key: Decimal(value) for key, value in saved["stocks"].items()}
        or set(cycle.allocation_ids) != {r.id for r in rows}
        or set(cycle.stock_ids) != {r.item_stock_id for r in rows}
        or any(r.auto_cycle_id != cycle.id or r.item_stock.location_id != cycle.vt_location_id
               or not r.item_stock.is_active for r in rows)):
        raise ValueError(f"Dữ liệu return {task.order_id} đã thay đổi sau tiếp quản; cần đối soát")


def adopt_ready(db, control):
    """Caller holds the warehouse lock. A waiting return does not reserve a road."""
    # A manual Execute holds the same warehouse lock through its HTTP call.
    # Therefore a surviving unowned sending marker here is an interrupted send.
    vt_ids = [loc.id for loc in auto.resolve_locations(db, control.warehouse_id, control.display_zone_id).values()]
    interrupted = db.query(OutboundAutoCommand).filter(
        OutboundAutoCommand.cycle_id.is_(None), OutboundAutoCommand.state == "sending",
        OutboundAutoCommand.robot_task_id.in_(db.query(Allocation.robot_task_id).filter(
            Allocation.from_location_id.in_(vt_ids)))).all()
    for command in interrupted:
        command.state, command.error = "unknown", "Lần gửi thủ công bị gián đoạn; cần đối soát ICS"
    if interrupted:
        db.commit()
    found = candidates(db, control.warehouse_id, control.display_zone_id)
    for candidate in found:
        key = f"outbound:auto:return_candidate:{control.warehouse_id}:{control.display_zone_id}:{candidate['task_id']}"
        signature = [candidate["state"], candidate["message"]]
        if auto.cache_get(key) != signature:
            auto.logger.info("outbound.auto event=return_candidate warehouse=%s zone=%s vt=%s cycle=None task_id=%s task=%s reason=%s",
                control.warehouse_id, control.display_zone_id, candidate["location_id"], candidate["task_id"], candidate["order_id"], candidate["message"])
            auto.cache_set(key, signature, 3600)
        if candidate["state"] != "ready":
            continue
        task = db.get(RobotTask, candidate["task_id"])
        rows = db.query(Allocation).filter_by(robot_task_id=task.id).order_by(Allocation.id).all()
        command = db.query(OutboundAutoCommand).filter_by(robot_task_id=task.id).one()
        cycle = OutboundAutoCycle(zone_id=control.id, vt_location_id=candidate["location_id"],
            source_location_id=rows[0].to_location_id, phase="ready_to_return", execution_mode=MODE,
            pick_task_id=None, return_task_id=task.id, allocation_ids=[r.id for r in rows],
            stock_ids=sorted({r.item_stock_id for r in rows}), cache_pending=False,
            cc_assignments={"_adoption": _snapshot(db, task, rows, candidate["location_id"])},
            message="Đã tiếp quản return thủ công, chờ đường vận chuyển")
        db.add(cycle); db.flush()
        for row in rows:
            row.auto_cycle_id = cycle.id
        command.cycle_id = cycle.id
        db.commit()
        from app.modules.masan.masan_auto_manual_service import log
        log(control, "adopt_return", cycle, task)
    return found


def protected_pick_rows(db, task):
    """Historical completed pick allocations protected by return-only ownership."""
    rows = task.outbound_order_allocations
    if not rows or not any(r.allocation_type == "outbound" for r in rows):
        return set(), set()
    warehouse_id = rows[0].outbound_order_detail.outbound_order.warehouse_id
    cycles = db.query(OutboundAutoCycle).join(auto.OutboundAutoZone).filter(
        auto.OutboundAutoZone.warehouse_id == warehouse_id, OutboundAutoCycle.execution_mode == MODE).all()
    ids = {identifier for c in cycles for identifier in c.cc_assignments.get("_adoption", {}).get("confirmed_outbound_ids", [])}
    protected = [r for r in rows if r.id in ids]
    return {r.id for r in protected}, {r.item_stock_id for r in protected}


def protected_callback(db):
    return db.info.get(_CALLBACK_KEY, (set(), set()))
