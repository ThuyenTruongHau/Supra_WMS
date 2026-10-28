"""Automatic orchestration around the existing manual outbound services.

Only trusted, session-local contexts enable these hooks. Public manual calls keep
their original implementation, defaults, return values and inventory semantics.
"""
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass, field

from app.modules.masan import masan_auto_service as auto
from app.modules.masan.masan_auto_model import OutboundAutoCycle, OutboundAutoCommand, OutboundAutoZone
from app.modules.robot.robot_model import RobotTask, MAPPING_STATUS
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation as Allocation
from app.modules.warehouse.outbound_order.outbound_order_schema import (
    CalculateOutboundDetail, DetailForCalculate, OutboundRobotTaskCreate, AllocationOutboundTaskExecute,
)

MODE = "manual_services"
_KEY = "outbound_manual_dispatch_context"


@dataclass
class DispatchContext:
    control: OutboundAutoZone
    vt_id: int
    action: str
    cycle: OutboundAutoCycle | None = None
    source_id: int | None = None
    detail_ids: set = field(default_factory=set)
    allocation_ids: set = field(default_factory=set)
    settled_ids: set = field(default_factory=set)
    item_id: int | None = None
    demand: int | None = None


def context(db):
    value = db.info.get(_KEY)
    return value if isinstance(value, DispatchContext) else None


@contextmanager
def using(db, value):
    previous = db.info.get(_KEY)
    db.info[_KEY] = value
    try:
        yield value
    finally:
        if previous is None:
            db.info.pop(_KEY, None)
        else:
            db.info[_KEY] = previous


def is_shared(cycle):
    return bool(cycle and cycle.execution_mode in {MODE, "adopted_return"})


def log(control, event, cycle=None, task=None, reason=None):
    auto.logger.info("outbound.auto event=%s warehouse=%s zone=%s vt=%s cycle=%s task=%s pick_task_id=%s return_task_id=%s reason=%s",
        event, control.warehouse_id, control.display_zone_id,
        cycle.vt_location_id if cycle else None, cycle.id if cycle else None,
        task.order_id if task else None, cycle.pick_task_id if cycle else None,
        cycle.return_task_id if cycle else None, reason)


def message(control, cycle, reason):
    if cycle.message != reason:
        cycle.message = reason
        log(control, "waiting", cycle, reason=reason)


def permits(db, warehouse_id, location_ids, task_id=None):
    ctx = context(db)
    if not ctx or ctx.action not in {"pick", "return"}:
        return False
    if ctx.control.warehouse_id != warehouse_id:
        raise ValueError("Internal outbound context belongs to another warehouse")
    allowed = {ctx.vt_id, ctx.source_id} - {None}
    if not set(location_ids) <= allowed:
        raise ValueError("Internal outbound context does not own these locations")
    if ctx.cycle and task_id not in {None, ctx.cycle.pick_task_id, ctx.cycle.return_task_id}:
        raise ValueError("Internal outbound context does not own this task")
    return True


def allows_settlement(db, rows):
    ctx = context(db)
    return bool(ctx and ctx.action in {"confirm", "callback"}
                and {row.id for row in rows} <= ctx.allocation_ids)


def filter_stocks(db, stocks):
    ctx = context(db)
    if not ctx or ctx.action != "pick" or ctx.source_id is None:
        return stocks
    return [s for s in stocks if s.location_id == ctx.source_id and s.location
            and s.location.warehouse_id == ctx.control.warehouse_id and s.location.is_active
            and (s.stock_level is None or s.stock_level <= 1)]


def prepare_pick(db, control, vt):
    from app.modules.masan import masan_outbound_service as service
    details, _ = auto._details_and_assignments(db, control)
    demand, oldest = defaultdict(int), {}
    for detail in details:
        issued = sum(a.quantity for a in detail.allocations if a.allocation_type == "outbound"
                     and a.status in {"completed", "issued", "in_progress", "pre_completed", "confirmed"})
        demand[detail.item_id] += max(0, detail.quantity - issued)
        oldest.setdefault(detail.item_id, detail.outbound_order.created_at.timestamp())
    for item_id in sorted(demand, key=lambda item: (-demand[item], oldest[item], item)):
        if demand[item_id] <= 0:
            continue
        with using(db, DispatchContext(control, vt.id, "pick",
                   detail_ids={d.id for d in details if d.item_id == item_id}, item_id=item_id, demand=demand[item_id])) as ctx:
            service.sending_masan_outbound_task(db, control.warehouse_id,
                auto.configuration(control.display_zone_id)[1], item_id, vt.id)
            if ctx.cycle:
                return ctx.cycle
    return None


def prepare_dispatch(db, warehouse_id, zone, item_id, vt_id):
    """Auto-only preparation; calculation, packing and execution stay shared."""
    from app.modules.masan import masan_outbound_service as service
    from app.modules.warehouse.outbound_order import outbound_order_service as outbound
    ctx = context(db)
    if not ctx or ctx.action != "pick" or ctx.vt_id != vt_id:
        raise ValueError("Missing internal pick context")
    details, _ = auto._details_and_assignments(db, ctx.control)
    details = [d for d in details if d.id in ctx.detail_ids and d.item_id == item_id]
    queued = db.query(Allocation).filter(Allocation.outbound_order_detail_id.in_(ctx.detail_ids),
        Allocation.allocation_type == "outbound", Allocation.status == "initialize",
        Allocation.auto_cycle_id.is_(None), Allocation.robot_task_id.isnot(None)).order_by(Allocation.id).all()
    selected = None
    for row in queued:
        task = db.get(RobotTask, row.robot_task_id)
        all_rows = db.query(Allocation).filter_by(robot_task_id=task.id).all()
        source_id = row.item_stock.location_id
        if (task.status != "initialize" or auto.cycle_for_task(db, task.id) or not source_id
            or any(a.status != "initialize" or a.allocation_type != "outbound" or a.to_location_id is not None
                   or a.auto_cycle_id is not None or a.item_stock.location_id != source_id for a in all_rows)
            or not auto._source_available(db, ctx.control, source_id, [a.id for a in all_rows])):
            continue
        selected = row
        ctx.source_id = source_id
        break
    if selected is None:
        stocks = outbound._strategy_loading_stocks(db, item_id, "fefo")
        for stock in stocks:
            source = stock.location
            if (not source or source.warehouse_id != warehouse_id
                or (stock.stock_level is not None and stock.stock_level > 1)
                or not auto._source_available(db, ctx.control, source.id)):
                continue
            eligible = [d for d in details if d.unallocated_quantity > 0
                        and (not (d.details or {}).get("locator")
                        or str(d.details["locator"]).strip() in {source.location_name, source.location_code})]
            if not eligible:
                continue
            ctx.source_id = source.id
            groups = defaultdict(list)
            for detail in eligible:
                groups[detail.outbound_order_id].append(detail)
            for order_id, rows in groups.items():
                if not outbound._strategy_loading_stocks(db, item_id, "fefo"):
                    break
                outbound.calculate_outbound_order(db, CalculateOutboundDetail(warehouse_id=warehouse_id,
                    outbound_order_id=order_id, line_items=[DetailForCalculate(id=d.id, item_id=d.item_id,
                        quantity=int(d.unallocated_quantity), detail_type=d.detail_type,
                        details=d.details or {}) for d in rows]), strategy="fefo")
            selected = db.query(Allocation).filter(Allocation.outbound_order_detail_id.in_(ctx.detail_ids),
                Allocation.status == "initialize", Allocation.allocation_type == "outbound",
                Allocation.from_location_id == source.id, Allocation.auto_cycle_id.is_(None),
                Allocation.robot_task_id.isnot(None)).order_by(Allocation.id).first()
            if selected:
                break
    if not selected:
        return None
    task = db.get(RobotTask, selected.robot_task_id)
    rows = db.query(Allocation).filter_by(robot_task_id=task.id).all()
    own_rows = [a for a in rows if a.outbound_order_detail_id in ctx.detail_ids]
    if len(own_rows) != len(rows):
        # Partition the unsent task, preserving allocation IDs and other zones.
        import uuid
        task = RobotTask(order_id=f"TDS_Outbound_{uuid.uuid4().hex[:8]}", quantity=task.quantity,
            process_code=task.process_code, system_code=task.system_code, task_order_detail=task.task_order_detail)
        db.add(task); db.flush()
        for row in own_rows:
            row.robot_task_id = task.id
        db.flush()
    ctx.allocation_ids = {a.id for a in own_rows}
    if any(a.to_location_id is not None or a.status != "initialize" for a in own_rows):
        raise ValueError("Task đã được sử dụng cho VT khác")
    required = defaultdict(int)
    for row in own_rows:
        required[row.item_stock_id] += row.quantity
    if any(not row.item_stock.is_active or row.item_stock.status not in {"available", "split"}
           or row.item_stock.location_id != ctx.source_id
           or (row.item_stock.stock_level is not None and row.item_stock.stock_level > 1)
           for row in own_rows) or any(db.get(ItemStock, identifier).quantity < qty for identifier, qty in required.items()):
        raise ValueError("Tồn nguồn của task đã thay đổi; cần đối soát")
    service._pack_and_execute_robot_task(db, task.id, selected, vt_id)
    return {"warehouse_id": warehouse_id, "zone": zone, "item_id": item_id, "lacked": []}


def tasks_prepared(db, task, return_task):
    """Called at the exact shared-executor creation boundary, never inferred."""
    ctx = context(db)
    if not ctx or ctx.action != "pick" or ctx.cycle:
        return
    rows = db.query(Allocation).filter_by(robot_task_id=task.id, allocation_type="outbound").all()
    if not rows or {a.id for a in rows} != ctx.allocation_ids:
        raise ValueError("Prepared task differs from the automatic selection")
    stocks = db.query(ItemStock).filter_by(location_id=ctx.source_id, is_active=True).filter(ItemStock.quantity > 0).all()
    _, assignments = auto._details_and_assignments(db, ctx.control)
    cycle = OutboundAutoCycle(zone_id=ctx.control.id, vt_location_id=ctx.vt_id,
        source_location_id=ctx.source_id, execution_mode=MODE, phase="supplying",
        stock_ids=[s.id for s in stocks], allocation_ids=[a.id for a in rows], pick_task_id=task.id,
        return_task_id=return_task.id if return_task else None,
        cc_assignments={str(a.outbound_order_detail_id): assignments[a.outbound_order_detail_id] for a in rows})
    db.add(cycle); db.flush()
    for row in rows:
        row.auto_cycle_id = cycle.id
    db.add(OutboundAutoCommand(cycle_id=cycle.id, robot_task_id=task.id, kind="pick", state="prepared"))
    if return_task:
        for row in db.query(Allocation).filter_by(robot_task_id=return_task.id).all():
            row.auto_cycle_id = cycle.id
        from app.modules.masan.masan_return_journal import register
        register(db, return_task).cycle_id = cycle.id
    ctx.cycle = cycle
    db.commit()
    log(ctx.control, "select", cycle, task, f"item={ctx.item_id} demand={ctx.demand}")
    log(ctx.control, "prepared", cycle, task)


def submit(db, task, operation):
    ctx = context(db)
    cycle = ctx.cycle if ctx else None
    if not is_shared(cycle) or ctx.action not in {"pick", "return"}:
        return operation()
    command = db.query(OutboundAutoCommand).filter_by(robot_task_id=task.id).one()
    if command.state not in {"prepared", "waiting"}:
        raise ValueError("Lệnh đã gửi hoặc chưa rõ kết quả; không được gửi lại")
    if task.id != (cycle.pick_task_id if ctx.action == "pick" else cycle.return_task_id):
        raise ValueError("Task does not match internal operation")
    command.state = "sending"
    db.commit()
    log(ctx.control, "sending", cycle, task)
    try:
        result = operation()
    except Exception as exc:
        db.rollback()
        command = db.query(OutboundAutoCommand).filter_by(robot_task_id=task.id).one()
        command.state, command.error = "unknown", str(exc)
        auto._error(db, ctx.control, cycle, f"Cần đối soát lệnh {task.order_id}: {exc}")
        raise ValueError(ctx.control.message) from exc
    command.state, command.error = "accepted", None
    cycle.phase = "supplying" if ctx.action == "pick" else "returning"
    cycle.message = "Đang cấp hàng" if ctx.action == "pick" else "Đang return"
    db.commit()
    log(ctx.control, "accepted", cycle, task)
    return result


def validate_ack(db, response):
    ctx = context(db)
    if ctx and is_shared(ctx.cycle) and (not isinstance(response, dict) or response.get("code") not in (1000, "1000")):
        raise ValueError(f"ICS không xác nhận nhận lệnh: {response}")


def resume_pick(db, control, cycle):
    from app.modules.warehouse.outbound_order.outbound_order_service import execute_outbound_task
    command = db.query(OutboundAutoCommand).filter_by(cycle_id=cycle.id, kind="pick").one()
    if command.state != "prepared":
        return
    rows = auto._allocations(db, cycle)
    for row in rows:
        row.status = "initialize"
    db.flush()
    db.expire_all()
    with using(db, DispatchContext(control, cycle.vt_location_id, "pick", cycle,
               cycle.source_location_id, allocation_ids={a.id for a in rows})):
        execute_outbound_task(db, OutboundRobotTaskCreate(order_id=db.get(RobotTask, cycle.pick_task_id).order_id,
            from_location_id=cycle.source_location_id, to_location_id=cycle.vt_location_id,
            allocations=[AllocationOutboundTaskExecute(allocation_id=a.id) for a in rows]), "auto")


def sync_return(db, cycle):
    """Adjust only the return created for this cycle, never a historical return."""
    if not cycle.return_task_id or cycle.execution_mode == "adopted_return":
        return
    command = db.query(OutboundAutoCommand).filter_by(cycle_id=cycle.id, kind="return").one()
    if command.state not in {"waiting", "prepared"}:
        return
    task = db.get(RobotTask, cycle.return_task_id)
    existing = db.query(Allocation).filter_by(robot_task_id=task.id).all()
    stocks = [s for s in auto._stocks(db, cycle) if s.quantity > 0]
    outgoing = auto._allocations(db, cycle)
    by_stock = {a.item_stock_id: a for a in existing}
    for stock in stocks:
        row = by_stock.get(stock.id)
        if not row:
            detail = next((a.outbound_order_detail_id for a in outgoing if a.item_stock_id == stock.id),
                          outgoing[0].outbound_order_detail_id)
            row = Allocation(outbound_order_detail_id=detail, item_stock_id=stock.id,
                allocation_type="return", status="initialize", robot_task_id=task.id,
                from_location_id=cycle.vt_location_id, to_location_id=cycle.source_location_id, auto_cycle_id=cycle.id)
            db.add(row)
        row.quantity = int(stock.quantity)
    for row in existing:
        if row.item_stock_id not in {s.id for s in stocks}:
            if stocks:
                db.delete(row)
            else:
                row.status, row.quantity = "cancelled", 0
    task.quantity = int(sum(s.quantity for s in stocks))
    if not stocks:
        command.state = "cancelled"
    db.flush()


def reconcile(db, control, cycle):
    for command in db.query(OutboundAutoCommand).filter_by(cycle_id=cycle.id).all():
        if command.state == "sending":
            command.state, command.error = "unknown", "Không rõ ICS đã nhận lệnh; cần đối soát"
            auto._error(db, control, cycle, command.error)
            return
    if cycle.phase == "awaiting_confirmation" and all(a.status == "completed" for a in auto._allocations(db, cycle)):
        sync_return(db, cycle)
        if not any(s.quantity > 0 for s in auto._stocks(db, cycle)):
            cycle.phase, cycle.completed_at = "completed", auto.now()
            message(control, cycle, None)
        else:
            cycle.phase = "ready_to_return"
            message(control, cycle, "Đã chia xong, chờ điều kiện return thủ công")


def return_reason(db, control, cycle):
    from app.modules.masan.masan_sorting_return_service import list_sorting_zone_return_tasks
    if cycle.phase != "ready_to_return" or not cycle.return_task_id:
        return "Lượt chưa hoàn tất xác nhận CC hoặc chưa có return"
    if cycle.execution_mode == "adopted_return":
        from app.modules.masan.masan_return_adoption_service import validate_snapshot
        validate_snapshot(db, cycle)
    sync_return(db, cycle)
    order_id = db.get(RobotTask, cycle.return_task_id).order_id
    ready = list_sorting_zone_return_tasks(db, control.warehouse_id, auto.configuration(control.display_zone_id)[0])
    if not any(row.task.order_id == order_id for row in ready.rows):
        return "Chờ điều kiện return thủ công: allocation cùng detail/pallet chưa hoàn tất hoặc tồn chưa hợp lệ"
    command = db.query(OutboundAutoCommand).filter_by(cycle_id=cycle.id, kind="return").one()
    reason = auto.path_reason(db, control, db.get(Location, cycle.vt_location_id), command)
    if reason:
        return reason
    return auto.reservation_reason(db, db.get(Location, cycle.source_location_id), command.robot_task_id)


def send_return(db, control, cycle):
    from app.modules.warehouse.outbound_order.outbound_order_service import execute_outbound_task
    reason = return_reason(db, control, cycle)
    if reason:
        message(control, cycle, reason)
        return False
    task = db.get(RobotTask, cycle.return_task_id)
    rows = db.query(Allocation).filter_by(robot_task_id=task.id, status="initialize").all()
    with using(db, DispatchContext(control, cycle.vt_location_id, "return", cycle,
               cycle.source_location_id, allocation_ids={a.id for a in rows})):
        execute_outbound_task(db, OutboundRobotTaskCreate(order_id=task.order_id,
            from_location_id=cycle.vt_location_id, to_location_id=cycle.source_location_id,
            allocations=[AllocationOutboundTaskExecute(allocation_id=a.id) for a in rows]), "auto")
    return True


def confirm(db, warehouse_id, cc_zone, quantities, sorting_persons, owners):
    from app.modules.masan import masan_outbound_service as service
    with auto.warehouse_lock(db, warehouse_id):
        rows = db.query(Allocation).filter(Allocation.id.in_(quantities)).all()
        pending = {}
        required = defaultdict(int)
        for row in rows:
            cycle = owners[row.id]
            control = db.get(OutboundAutoZone, cycle.zone_id)
            if (control.warehouse_id != warehouse_id or auto.configuration(control.display_zone_id)[1] != cc_zone
                or row.allocation_type != "outbound" or row.quantity != quantities[row.id]
                or row.status not in {"pre_completed", "confirmed", "completed"} or not sorting_persons):
                raise ValueError("Allocation không sẵn sàng hoặc không thuộc kho/zone/số lượng xác nhận")
            if row.status != "completed":
                if row.item_stock.location_id != cycle.vt_location_id:
                    raise ValueError("Stock không còn tại VT của lượt")
                pending[row.id] = quantities[row.id]
                required[row.item_stock_id] += row.quantity
        if any(db.get(ItemStock, identifier).quantity < qty for identifier, qty in required.items()):
            raise ValueError("Số lượng xác nhận vượt tồn của lượt")
        control = db.get(OutboundAutoZone, next(iter(owners.values())).zone_id)
        with using(db, DispatchContext(control, next(iter(owners.values())).vt_location_id, "confirm",
                   allocation_ids=set(pending))):
            if pending:
                service._confirm_allocation_outbound(db, warehouse_id, cc_zone, pending, sorting_persons)
        for cycle in {c.id: c for c in owners.values()}.values():
            cycle.cache_pending = True
            reconcile(db, db.get(OutboundAutoZone, cycle.zone_id), cycle)
        db.commit()
    auto.wake()
    return True


def callback(db, task, payload, operation):
    cycle = auto.cycle_for_task(db, task.id)
    if not is_shared(cycle):
        return operation()
    control = db.get(OutboundAutoZone, cycle.zone_id)
    with auto.warehouse_lock(db, control.warehouse_id):
        command = db.query(OutboundAutoCommand).filter_by(robot_task_id=task.id).one()
        if command.state == "completed":
            return None
        mapped = MAPPING_STATUS.get(str(payload.get("status")))
        if not mapped:
            if cycle.execution_mode == "adopted_return" and command.state in {"waiting", "prepared"}:
                command.state, command.error = "unknown", f"Callback chưa rõ trước khi gửi return {task.order_id}; cần đối soát"
                auto._error(db, control, cycle, command.error)
            return operation()
        rows = db.query(Allocation).filter_by(robot_task_id=task.id).all()
        if mapped == "completed":
            start, end = ((cycle.source_location_id, cycle.vt_location_id) if command.kind == "pick"
                          else (cycle.vt_location_id, cycle.source_location_id))
            if any(s.location_id not in {start, end} for s in auto._stocks(db, cycle) if s.quantity > 0):
                command.state, command.error = "unknown", f"Stock không khớp callback {task.order_id}; cần đối soát"
                auto._error(db, control, cycle, command.error)
                return None
        ctx = DispatchContext(control, cycle.vt_location_id, "callback", cycle,
                              cycle.source_location_id, allocation_ids={a.id for a in rows},
                              settled_ids={a.id for a in rows if a.status == "completed"})
        with using(db, ctx):
            result = operation()
        if mapped == "completed" and any(s.location_id != end for s in auto._stocks(db, cycle) if s.quantity > 0):
            command.state, command.error = "unknown", f"Stock chưa tới đích callback {task.order_id}; cần đối soát"
            auto._error(db, control, cycle, command.error)
            return result
        if mapped == "completed":
            command.state, command.error = "completed", None
            cycle.phase = "awaiting_confirmation" if command.kind == "pick" else "completed"
            cycle.cache_pending = cycle.execution_mode != "adopted_return"
            if command.kind == "return":
                cycle.completed_at = auto.now()
            message(control, cycle, "Chờ xác nhận chia vào CC" if command.kind == "pick" else None)
        elif mapped in {"failed", "cancelled"}:
            command.state, command.error = "failed", f"ICS báo {mapped}: {task.order_id}"
            auto._error(db, control, cycle, command.error)
        else:
            command.state, command.error = "accepted", None
            cycle.phase = "supplying" if command.kind == "pick" else "returning"
        db.commit()
        log(control, "callback", cycle, task, mapped)
    auto.wake()
    return result
