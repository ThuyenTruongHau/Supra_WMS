"""Zone outbound coordinator. Every send is durable and serialized per warehouse.

PostgreSQL session advisory locks survive the service's transaction boundaries.
The in-process lock is also used by isolated SQLite tests; production uses both.
An interrupted/uncertain send is never automatically retried.
"""
from collections import defaultdict
from contextlib import contextmanager
from datetime import datetime, timezone
from threading import RLock
import json
import uuid

from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.core.cache import cache_delete, cache_get, cache_scan_keys, cache_set
from app.core.config import settings
from app.core.logger import get_logger
from app.modules.masan.masan_auto_model import OutboundAutoZone, OutboundAutoCycle, OutboundAutoCommand
from app.modules.robot.robot_model import RobotTask, TaskStatus, MAPPING_STATUS
from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrderDetail
from app.modules.warehouse.item_stock.item_stock_model import ItemStock, countable_stock_level_criterion
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrder, OutboundOrderDetail, OutboundOrderAllocation
from app.modules.warehouse.transaction_history.history_model import History, Transaction
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse, Zone

logger = get_logger("main")
ZONE_CONFIG = {
    8: ("Zone_sorting_1", "Zone_CC_02", (("VT21", "VT22"), ("VT23", "VT24"))),
    9: ("Zone_sorting_2", "Zone_CC_01", (("VT11", "VT12"), ("VT13", "VT14"))),
}
FREE_STATUSES = {"empty", "has_stock"}
MOVING_STATUSES = {"issued", "in_progress"}
TERMINAL_ALLOCATIONS = {"completed", "failed", "cancelled"}
MOVING_COMMANDS = {"prepared", "sending", "accepted", "unknown"}
_locks = defaultdict(RLock)


def now():
    return datetime.now(timezone.utc)


@contextmanager
def warehouse_lock(db: Session, warehouse_id: int):
    """Shared by auto sends, callbacks, confirmations and manual submissions."""
    key = int(warehouse_id)
    held = db.info.setdefault("outbound_auto_locks", set())
    if key in held:
        yield
        return
    with _locks[key]:
        connection = None
        try:
            if db.get_bind().dialect.name == "postgresql":
                connection = db.get_bind().connect()
                connection.execute(text("SELECT pg_advisory_lock(827010, :warehouse)"), {"warehouse": key})
                connection.commit()
            held.add(key)
            db.flush()
            db.expire_all()
            yield
        finally:
            held.discard(key)
            if connection is not None:
                try:
                    connection.execute(text("SELECT pg_advisory_unlock(827010, :warehouse)"), {"warehouse": key})
                    connection.commit()
                finally:
                    connection.close()


def configuration(display_zone_id: int):
    if display_zone_id not in ZONE_CONFIG:
        raise ValueError("Khu chia chọn không hợp lệ (8 hoặc 9)")
    return ZONE_CONFIG[display_zone_id]


def resolve_locations(db, warehouse_id, display_zone_id):
    vt_zone, _, pairs = configuration(display_zone_id)
    locations = db.query(Location).join(Zone, Zone.id == Location.zone_id).filter(
        Location.warehouse_id == warehouse_id, Location.is_active.is_(True),
        Zone.warehouse_id == warehouse_id, Zone.code == vt_zone,
    ).all()
    result = {}
    for name in (name for pair in pairs for name in pair):
        matches = [loc for loc in locations if (loc.location_name or "").strip().upper() == name]
        if len(matches) != 1:
            raise ValueError(f"Cần đúng một vị trí {name} trong kho/khu đang chọn")
        result[name] = matches[0]
    return result


def zone_control(db, warehouse_id, display_zone_id, create=False):
    configuration(display_zone_id)
    row = db.query(OutboundAutoZone).filter_by(warehouse_id=warehouse_id, display_zone_id=display_zone_id).first()
    if row is None and create:
        row = OutboundAutoZone(warehouse_id=warehouse_id, display_zone_id=display_zone_id)
        db.add(row)
        db.flush()
    return row


def active_cycles(db, warehouse_id):
    return db.query(OutboundAutoCycle).join(OutboundAutoZone, OutboundAutoZone.id == OutboundAutoCycle.zone_id).filter(
        OutboundAutoZone.warehouse_id == warehouse_id, OutboundAutoCycle.completed_at.is_(None),
    ).all()


def cycle_for_task(db, task_id):
    return db.query(OutboundAutoCycle).filter(or_(
        OutboundAutoCycle.pick_task_id == task_id, OutboundAutoCycle.return_task_id == task_id,
    )).first()


def cycle_for_allocation(db, allocation_id):
    row = db.get(OutboundOrderAllocation, allocation_id)
    return db.get(OutboundAutoCycle, row.auto_cycle_id) if row and row.auto_cycle_id else None


def pair_for_location(db, location):
    zone = db.get(Zone, location.zone_id) if location.zone_id else None
    if not zone:
        return None
    for display_id, (zone_code, _, pairs) in ZONE_CONFIG.items():
        if zone.code == zone_code:
            for index, names in enumerate(pairs):
                if (location.location_name or "").strip().upper() in names:
                    return display_id, index, names
    return None


def path_locations(db, warehouse_id, location):
    pair = pair_for_location(db, location)
    if not pair:
        return {location.id}
    display_id, _, names = pair
    mapping = resolve_locations(db, warehouse_id, display_id)
    # A rear movement reserves the whole pair; front movements still serialize
    # with rear movements through the shared front location.
    return {mapping[name].id for name in names} if location.id == mapping[names[0]].id else {location.id}


def path_reason(db, control, vt, prepared_command=None):
    mapping = resolve_locations(db, control.warehouse_id, control.display_zone_id)
    pair = pair_for_location(db, vt)
    names = pair[2] if pair and vt.id == mapping[pair[2][0]].id else (vt.location_name.strip().upper(),)
    own_tasks = {prepared_command.robot_task_id} if prepared_command else set()
    if prepared_command and prepared_command.kind == "pick" and prepared_command.state == "prepared":
        owner = db.get(OutboundAutoCycle, prepared_command.cycle_id)
        if owner.execution_mode == "manual_services" and owner.return_task_id:
            own_tasks.add(owner.return_task_id)
    for name in names:
        loc = mapping[name]
        db.refresh(loc, ["status"])
        location_status = loc.status
        if prepared_command and (location_status == "reserved" or
                                 (location_status == "in_transit" and prepared_command.state == "prepared")):
            # A persisted, never-submitted return owns its initialize rows. All
            # other reservations/movements remain authoritative after restart.
            others = db.query(OutboundOrderAllocation.id).filter(
                or_(OutboundOrderAllocation.from_location_id == loc.id, OutboundOrderAllocation.to_location_id == loc.id),
                OutboundOrderAllocation.status.in_(["initialize", "reserved", "issued", "in_progress"]),
                or_(OutboundOrderAllocation.robot_task_id.is_(None), OutboundOrderAllocation.robot_task_id.notin_(own_tasks)),
            ).first()
            inbound = db.query(InboundOrderDetail.id).filter(
                or_(InboundOrderDetail.from_location_id == loc.id, InboundOrderDetail.to_location_id == loc.id),
                InboundOrderDetail.status.in_(["initialize", "reserved", "issued", "in_progress"]),
            ).first()
            if not others and not inbound:
                location_status = "has_stock" if loc.occupied_quantity > 0 else "empty"
        if location_status not in FREE_STATUSES:
            return f"Chờ {name}: {loc.status}"
    resources = path_locations(db, control.warehouse_id, vt)
    # Legacy commands do not have an auto command row. Both endpoints count.
    moving = db.query(OutboundOrderAllocation.id).filter(
        OutboundOrderAllocation.status.in_(MOVING_STATUSES),
        or_(OutboundOrderAllocation.from_location_id.in_(resources), OutboundOrderAllocation.to_location_id.in_(resources)),
    )
    if prepared_command:
        moving = moving.filter(or_(OutboundOrderAllocation.robot_task_id.is_(None),
                                   OutboundOrderAllocation.robot_task_id != prepared_command.robot_task_id))
    if moving.first() or db.query(InboundOrderDetail.id).filter(
        InboundOrderDetail.status.in_(MOVING_STATUSES),
        or_(InboundOrderDetail.from_location_id.in_(resources), InboundOrderDetail.to_location_id.in_(resources)),
    ).first():
        return "Chờ lệnh đang vận chuyển qua cặp VT"
    for cycle in active_cycles(db, control.warehouse_id):
        if prepared_command and cycle.id == prepared_command.cycle_id:
            continue
        commands = db.query(OutboundAutoCommand).filter(
            OutboundAutoCommand.cycle_id == cycle.id, OutboundAutoCommand.state.in_(MOVING_COMMANDS),
        ).all()
        if commands and resources & path_locations(db, control.warehouse_id, db.get(Location, cycle.vt_location_id)):
            return "Chờ lệnh đã giữ đường của cặp VT"
    return None


def reservation_reason(db, location, own_task_id=None):
    """Map status with only this command's initialize reservation excluded."""
    db.refresh(location, ["status"])
    if location.status in FREE_STATUSES:
        return None
    if location.status == "reserved" and own_task_id is not None:
        outbound = db.query(OutboundOrderAllocation.id).filter(
            or_(OutboundOrderAllocation.from_location_id == location.id, OutboundOrderAllocation.to_location_id == location.id),
            OutboundOrderAllocation.status.in_(["initialize", "reserved", "issued", "in_progress"]),
            or_(OutboundOrderAllocation.robot_task_id.is_(None), OutboundOrderAllocation.robot_task_id != own_task_id),
        ).first()
        inbound = db.query(InboundOrderDetail.id).filter(
            or_(InboundOrderDetail.from_location_id == location.id, InboundOrderDetail.to_location_id == location.id),
            InboundOrderDetail.status.in_(["initialize", "reserved", "issued", "in_progress"]),
        ).first()
        if not outbound and not inbound:
            return None
    return f"Chờ {location.location_name}: {location.status}"


def guard_manual_locations(db, warehouse_id, location_ids, task_id=None):
    """Do not let legacy/manual APIs bypass ownership or a reserved auto path."""
    from app.modules.masan.masan_auto_manual_service import permits
    if permits(db, warehouse_id, location_ids, task_id):
        return
    if task_id and cycle_for_task(db, task_id):
        raise ValueError("Lệnh thuộc lượt tự động; dùng thao tác return của lượt sau khi dừng tự động")
    resources = set(location_ids)
    for identifier in list(resources):
        loc = db.get(Location, identifier)
        if loc:
            pair = pair_for_location(db, loc)
            if pair:
                control = zone_control(db, warehouse_id, pair[0])
                if control and control.enabled:
                    raise ValueError("Zone đang gọi tự động; dừng tự động trước khi gọi thủ công")
                resources |= path_locations(db, warehouse_id, loc)
    for cycle in active_cycles(db, warehouse_id):
        if cycle.source_location_id in resources or cycle.vt_location_id in location_ids:
            raise ValueError(f"Vị trí đang thuộc lượt tự động #{cycle.id}")
        commands = db.query(OutboundAutoCommand.id).filter(
            OutboundAutoCommand.cycle_id == cycle.id, OutboundAutoCommand.state.in_(MOVING_COMMANDS),
        ).first()
        if commands and resources & path_locations(db, warehouse_id, db.get(Location, cycle.vt_location_id)):
            raise ValueError("Đường đi đang được giữ cho lượt tự động")


def guarded_robot_submission(db, task, operation):
    codes = []
    try:
        for segment in json.loads(task.task_order_detail or "[]"):
            codes.extend(str(segment.get("taskPath", "")).split(","))
    except (ValueError, TypeError):
        return operation()
    warehouse_id = None
    if task.inbound_order_detail_id:
        detail = db.get(InboundOrderDetail, task.inbound_order_detail_id)
        warehouse_id = detail.inbound_order.warehouse_id if detail else None
    else:
        allocation = db.query(OutboundOrderAllocation).filter_by(robot_task_id=task.id).first() if task.id else None
        if allocation:
            warehouse_id = allocation.outbound_order_detail.outbound_order.warehouse_id
    if warehouse_id is None:
        return operation()
    with warehouse_lock(db, warehouse_id):
        locations = db.query(Location).filter(Location.warehouse_id == warehouse_id, Location.location_code.in_(codes)).all()
        guard_manual_locations(db, warehouse_id, {loc.id for loc in locations}, task.id)
        from app.modules.masan.masan_auto_manual_service import submit
        return submit(db, task, operation)


def guard_station_cache_clear(db, warehouse_id, cc_location_ids=None):
    ids = set(cc_location_ids) if cc_location_ids is not None else None
    for control in db.query(OutboundAutoZone).filter_by(warehouse_id=warehouse_id, enabled=True).all():
        cc_zone = configuration(control.display_zone_id)[1]
        matching = db.query(Location.id).join(Zone, Zone.id == Location.zone_id).filter(
            Location.warehouse_id == warehouse_id, Zone.code == cc_zone)
        if ids is None or matching.filter(Location.id.in_(ids)).first():
            raise ValueError("Dừng tự động và hoàn tất các lượt trước khi xóa cache station")
    for cycle in active_cycles(db, warehouse_id):
        if ids is None or any(meta.get("location_id") in ids for meta in cycle.cc_assignments.values()):
            raise ValueError("CC còn thuộc lượt tự động chưa hoàn tất")


def _error(db, control, cycle, message):
    control.enabled = False
    control.state = "error"
    control.message = message
    if cycle:
        cycle.message = message
        cycle.phase = "error"
    db.commit()
    logger.error("outbound.auto event=error warehouse=%s zone=%s vt=%s cycle=%s pick_task_id=%s return_task_id=%s reason=%s",
                 control.warehouse_id, control.display_zone_id, cycle.vt_location_id if cycle else None,
                 cycle.id if cycle else None, cycle.pick_task_id if cycle else None,
                 cycle.return_task_id if cycle else None, message)


def wake():
    # The periodic task is authoritative if broker publication is unavailable.
    try:
        from app.modules.masan.masan_celery_task import coordinate_outbound_auto_task
        coordinate_outbound_auto_task.delay()
    except Exception:
        logger.exception("Cannot wake automatic outbound coordinator; periodic reconciliation will retry")


def start(db, warehouse_id, display_zone_id, user_id):
    with warehouse_lock(db, warehouse_id):
        if not db.get(Warehouse, warehouse_id):
            raise ValueError("Warehouse not found")
        resolve_locations(db, warehouse_id, display_zone_id)
        control = zone_control(db, warehouse_id, display_zone_id, create=True)
        _reconcile(db, control)
        unresolved = db.query(OutboundAutoCommand).join(OutboundAutoCycle).filter(
            OutboundAutoCycle.zone_id == control.id,
            OutboundAutoCommand.state.in_(["sending", "unknown", "failed"]),
        ).first()
        if unresolved:
            task = db.get(RobotTask, unresolved.robot_task_id)
            raise ValueError(f"Cần đối soát lệnh {task.order_id} trước khi bật lại")
        control.enabled = True
        control.state = "waiting"
        control.message = "Đang chờ điều phối"
        control.started_by_id = user_id
        db.commit()
        logger.info("outbound.auto event=start warehouse=%s zone=%s user=%s", warehouse_id, display_zone_id, user_id)
        result = status(db, warehouse_id, display_zone_id)
    wake()
    return result


# def stop(db, warehouse_id, display_zone_id):
#     with warehouse_lock(db, warehouse_id):
#         control = zone_control(db, warehouse_id, display_zone_id, create=True)
#         control.enabled = False
#         if control.state != "error":
#             control.state, control.message = "stopped", "Đã dừng phát lệnh tự động"
#         db.commit()
#         return status(db, warehouse_id, display_zone_id)
def stop(db, warehouse_id, display_zone_id):
    with warehouse_lock(db, warehouse_id):
        control = zone_control(db, warehouse_id, display_zone_id, create=True)
        control.enabled = False

        if control.state != "error":
            control.state = "stopped"
            control.message = None

        db.commit()
        logger.info("outbound.auto event=stop warehouse=%s zone=%s", warehouse_id, display_zone_id)
        return status(db, warehouse_id, display_zone_id)


def status(db, warehouse_id, display_zone_id):
    configuration(display_zone_id)
    control = zone_control(db, warehouse_id, display_zone_id)
    mapping_error = None
    try:
        locations = resolve_locations(db, warehouse_id, display_zone_id)
    except ValueError as exc:
        locations, mapping_error = {}, str(exc)
    cycles = {cycle.vt_location_id: cycle for cycle in active_cycles(db, warehouse_id)
              if control and cycle.zone_id == control.id}
    items = []
    for name, loc in locations.items():
        cycle = cycles.get(loc.id)
        item = {"location_id": loc.id, "name": name, "location_status": loc.status,
                "execution_mode": cycle.execution_mode if cycle else None,
                "cycle_id": cycle.id if cycle else None, "phase": cycle.phase if cycle else "idle",
                "message": cycle.message if cycle else None, "pick_order_id": None,
                "return_order_id": None, "remaining_quantity": 0}
        if cycle:
            for field, identifier in [("pick_order_id", cycle.pick_task_id), ("return_order_id", cycle.return_task_id)]:
                task = db.get(RobotTask, identifier) if identifier else None
                item[field] = task.order_id if task else None
            item["remaining_quantity"] = int(sum(stock.quantity for stock in _stocks(db, cycle) if stock.quantity > 0))
        elif control and control.enabled:
            manual = db.query(OutboundOrderAllocation.id).filter(
                OutboundOrderAllocation.to_location_id == loc.id,
                OutboundOrderAllocation.status.notin_(TERMINAL_ALLOCATIONS),
            ).first()
            item["message"] = ("Chờ lượt thủ công hoàn tất" if manual else
                               path_reason(db, control, loc) or "Chờ nhu cầu hoặc nguồn hàng phù hợp")
        items.append(item)
    return {"warehouse_id": warehouse_id, "display_zone_id": display_zone_id,
            "enabled": bool(control and control.enabled), "state": control.state if control else "stopped",
            "message": mapping_error or (control.message if control else "Chưa bật tự động"), "vts": items,
            "return_candidates": _return_candidates(db, warehouse_id, display_zone_id) if not mapping_error else []}


def _return_candidates(db, warehouse_id, display_zone_id):
    from app.modules.masan.masan_return_adoption_service import candidates
    return candidates(db, warehouse_id, display_zone_id)


def _stocks(db, cycle):
    return db.query(ItemStock).filter(ItemStock.id.in_(cycle.stock_ids or [])).all()


def _allocations(db, cycle):
    return db.query(OutboundOrderAllocation).filter(OutboundOrderAllocation.id.in_(cycle.allocation_ids or [])).all()


def _reconcile(db, control):
    for cycle in active_cycles(db, control.warehouse_id):
        if cycle.zone_id != control.id:
            continue
        if cycle.execution_mode in {"manual_services", "adopted_return"}:
            from app.modules.masan.masan_auto_manual_service import reconcile
            reconcile(db, control, cycle)
            continue
        commands = db.query(OutboundAutoCommand).filter_by(cycle_id=cycle.id).all()
        for command in commands:
            # A surviving 'sending' means the process stopped during submission.
            # Accepted commands have no timeout-based automatic release.
            if command.state == "sending":
                command.state = "unknown"
                command.error = "Không rõ ICS đã nhận lệnh; cần đối soát"
                _error(db, control, cycle, command.error)
            elif command.state == "prepared" and command.kind == "return":
                cycle.phase, cycle.message = "ready_to_return", "Return đã chuẩn bị, chưa gửi"
        if cycle.phase == "awaiting_confirmation":
            allocations = _allocations(db, cycle)
            if allocations and all(a.status == "completed" for a in allocations):
                remaining = [stock for stock in _stocks(db, cycle) if stock.quantity > 0]
                if any(stock.location_id != cycle.vt_location_id for stock in remaining):
                    _error(db, control, cycle, "Stock của lượt không còn tại VT; cần đối soát")
                    continue
                if remaining:
                    cycle.phase, cycle.message = "ready_to_return", "Đã chia xong, chờ return"
                else:
                    cycle.phase, cycle.completed_at, cycle.message = "completed", now(), None
    db.commit()
    try:
        _repair_stock_ready(db, control)
    except Exception:
        logger.exception("Cannot reconcile automatic stock-ready cache warehouse=%s zone=%s", control.warehouse_id, control.display_zone_id)


def _repair_stock_ready(db, control):
    """Repair missed WS/cache writes from durable allocations, after DB commit."""
    from app.modules.masan.masan_outbound_service import _enrich_stock_ready_payloads
    from app.socket.ws_events import publish_masan_sorting_zone
    _, cc_zone, _ = configuration(control.display_zone_id)
    for cycle in db.query(OutboundAutoCycle).filter(
        OutboundAutoCycle.zone_id == control.id,
        or_(OutboundAutoCycle.completed_at.is_(None), OutboundAutoCycle.cache_pending.is_(True)),
    ).all():
        if cycle.execution_mode == "adopted_return":
            continue
        for row in _allocations(db, cycle):
            if row.status not in {"pre_completed", "completed"}:
                continue
            meta = cycle.cc_assignments.get(str(row.outbound_order_detail_id))
            if not meta:
                continue
            if row.status == "completed":
                _release_confirmed_cc(db, control, row, meta)
            key = f"outbound:masan:stock_ready:{control.warehouse_id}:{cc_zone}:{row.id}:{meta['location_id']}"
            current = cache_get(key)
            if isinstance(current, dict) and current.get("status") == row.status and current.get("quantity") == int(row.quantity):
                continue
            payload = _enrich_stock_ready_payloads(db, [{"id": row.id, "outbound_order_detail_id": row.outbound_order_detail_id,
                "item_stock_id": row.item_stock_id, "quantity": int(row.quantity), "status": row.status,
                "allocation_type": "outbound", "robot_task_id": row.robot_task_id,
                "from_location_id": row.from_location_id, "to_location_id": row.to_location_id}])[0]
            cache_set(key, payload, -1)
            publish_masan_sorting_zone(control.warehouse_id, cc_zone,
                event_type="masan.sorting.stock_ready" if row.status == "pre_completed" else "masan.sorting.allocation_confirmed",
                data={"location_id": meta["location_id"], "details": [payload]})
        cycle.cache_pending = False
    db.commit()


def _release_confirmed_cc(db, control, row, meta):
    detail = row.outbound_order_detail
    pending = db.query(OutboundOrderAllocation.id).filter(
        OutboundOrderAllocation.outbound_order_detail_id == detail.id,
        OutboundOrderAllocation.allocation_type == "outbound",
        OutboundOrderAllocation.status.notin_(TERMINAL_ALLOCATIONS),
    ).first()
    if pending or detail.unallocated_quantity > 0:
        return
    # Durable CC ownership lets a later tick finish cleanup even if Redis failed
    # between updating the location bucket and removing the detail pointer.
    cc_key = f"outbound:assigned_cc_location:{control.warehouse_id}:{meta['location_id']}"
    bucket = cache_get(cc_key)
    if isinstance(bucket, dict):
        lines = bucket.get("lines") or []
        remaining = [line for line in lines if str(line.get("detail_id")) != str(detail.id)]
        if len(remaining) != len(lines):
            if remaining:
                cache_set(cc_key, {**bucket, "lines": remaining}, -1)
            else:
                cache_delete(cc_key)
    cache_delete(f"outbound:assigned_cc_details:{control.warehouse_id}:{detail.id}")


def _details_and_assignments(db, control):
    _, cc_zone, _ = configuration(control.display_zone_id)
    assignments = {}
    for key in cache_scan_keys(f"outbound:assigned_cc_details:{control.warehouse_id}:*"):
        suffix = key.rsplit(":", 1)[-1]
        if not suffix.isdigit():
            continue
        detail_id = int(suffix)
        meta = cache_get(f"outbound:assigned_cc_details:{control.warehouse_id}:{detail_id}")
        if isinstance(meta, dict) and meta.get("zone") == cc_zone and meta.get("location_id"):
            loc = db.get(Location, int(meta["location_id"]))
            if loc and loc.warehouse_id == control.warehouse_id:
                assignments[detail_id] = {"zone": cc_zone, "location_id": loc.id}
    details = db.query(OutboundOrderDetail).join(OutboundOrder).filter(
        OutboundOrder.warehouse_id == control.warehouse_id,
        OutboundOrderDetail.id.in_(assignments), OutboundOrderDetail.detail_type == "auto",
    ).order_by(OutboundOrder.created_at, OutboundOrderDetail.id).all()
    return details, assignments


def _source_available(db, control, source_id, allowed_allocation_ids=()):
    if any(source_id in (cycle.source_location_id, cycle.vt_location_id)
           for cycle in active_cycles(db, control.warehouse_id)):
        return False
    if db.query(OutboundOrderAllocation.id).join(ItemStock).filter(
        ItemStock.location_id == source_id,
        OutboundOrderAllocation.status.notin_(TERMINAL_ALLOCATIONS),
        OutboundOrderAllocation.id.notin_(allowed_allocation_ids),
    ).first():
        return False
    if db.query(InboundOrderDetail.id).filter(
        or_(InboundOrderDetail.from_location_id == source_id, InboundOrderDetail.to_location_id == source_id),
        InboundOrderDetail.status.in_(["initialize", "reserved", "issued", "in_progress"]),
    ).first():
        return False
    source = db.get(Location, source_id)
    db.refresh(source, ["status"])
    return source.is_active and source.warehouse_id == control.warehouse_id and source.status != "in_transit"


def _prepare_pick(db, control, vt):
    from app.modules.masan.masan_auto_manual_service import prepare_pick
    return prepare_pick(db, control, vt)


def _prepare_native_pick(db, control, vt):
    from app.modules.warehouse.outbound_order.outbound_order_service import _strategy_loading_stocks
    details, assignments = _details_and_assignments(db, control)
    ids = {detail.id for detail in details}
    demand = defaultdict(int)
    oldest = {}
    for detail in details:
        pending_at_vt = sum(a.quantity for a in detail.allocations
                            if a.allocation_type == "outbound" and a.status in {"issued", "in_progress", "pre_completed", "confirmed"})
        completed = sum(a.quantity for a in detail.allocations if a.allocation_type == "outbound" and a.status == "completed")
        demand[detail.item_id] += max(0, detail.quantity - completed - pending_at_vt)
        created = detail.outbound_order.created_at
        oldest.setdefault(detail.item_id, created.timestamp() if created else 0)
    for item_id in sorted(demand, key=lambda identifier: (-demand[identifier], oldest[identifier], identifier)):
        if demand[item_id] <= 0:
            continue
        item_details = [detail for detail in details if detail.item_id == item_id]
        queued = db.query(OutboundOrderAllocation).filter(
            OutboundOrderAllocation.outbound_order_detail_id.in_([d.id for d in item_details]),
            OutboundOrderAllocation.allocation_type == "outbound", OutboundOrderAllocation.status == "initialize",
            OutboundOrderAllocation.robot_task_id.isnot(None),
        ).order_by(OutboundOrderAllocation.id).all()
        for allocation in queued:
            task = db.get(RobotTask, allocation.robot_task_id)
            rows = db.query(OutboundOrderAllocation).filter_by(robot_task_id=task.id).all()
            reserved = defaultdict(int)
            for row in rows:
                reserved[row.item_stock_id] += row.quantity
            source_id = allocation.item_stock.location_id
            if (task.status != "initialize" or cycle_for_task(db, task.id) or not source_id
                or any(row.outbound_order_detail_id not in ids or row.status != "initialize"
                       or row.allocation_type != "outbound" or row.to_location_id is not None
                       or not row.item_stock.is_active or row.item_stock.status not in {"available", "split"}
                       or (row.item_stock.stock_level is not None and row.item_stock.stock_level > 1)
                       or row.item_stock.location_id != source_id for row in rows)
                or any(db.get(ItemStock, identifier).quantity < quantity for identifier, quantity in reserved.items())
                or not _source_available(db, control, source_id, [row.id for row in rows])):
                continue
            return _new_cycle(db, control, vt, source_id, task, rows, assignments)
        # Only allocate the quantity not already reserved by initialize allocations.
        needs = [detail for detail in item_details if detail.unallocated_quantity > 0]
        if not needs:
            continue
        stocks = _strategy_loading_stocks(db, item_id, "fefo")
        stocks = [stock for stock in stocks if stock.stock_level is None or stock.stock_level <= 1]
        for stock in stocks:
            if not stock.location_id or not _source_available(db, control, stock.location_id):
                continue
            source = db.get(Location, stock.location_id)
            eligible = [detail for detail in needs if not (detail.details or {}).get("locator")
                        or str(detail.details["locator"]).strip() in {source.location_name, source.location_code}]
            if not eligible:
                continue
            pallet_stocks = [row for row in stocks if row.location_id == source.id]
            task = RobotTask(order_id=f"TDS_AutoOutbound_{uuid.uuid4().hex[:12]}", quantity=0,
                             process_code=settings.outbound_process_code, system_code="Thadosoft",
                             task_order_detail='[{"taskPath":"None"}]')
            db.add(task)
            db.flush()
            rows = []
            available = {row.id: int(row.available_quantity) for row in pallet_stocks}
            for detail in eligible:
                remaining = int(detail.unallocated_quantity)
                for row in pallet_stocks:
                    take = min(remaining, available[row.id])
                    if take <= 0:
                        continue
                    allocation = OutboundOrderAllocation(outbound_order_detail_id=detail.id, item_stock_id=row.id,
                        quantity=take, status="initialize", allocation_type="outbound",
                        from_location_id=source.id, robot_task_id=task.id)
                    db.add(allocation)
                    rows.append(allocation)
                    remaining -= take
                    available[row.id] -= take
            if rows:
                db.flush()
                return _new_cycle(db, control, vt, source.id, task, rows, assignments)
    return None


def _new_cycle(db, control, vt, source_id, task, rows, assignments):
    stocks = db.query(ItemStock).filter(
        ItemStock.location_id == source_id, ItemStock.is_active.is_(True), ItemStock.quantity > 0,
        ItemStock.status.in_(["available", "split"]), countable_stock_level_criterion(),
    ).all()
    task.quantity = int(sum(stock.quantity for stock in stocks))
    cycle = OutboundAutoCycle(zone_id=control.id, vt_location_id=vt.id, source_location_id=source_id,
        phase="supplying", stock_ids=[stock.id for stock in stocks], allocation_ids=[row.id for row in rows],
        pick_task_id=task.id, cc_assignments={str(row.outbound_order_detail_id): assignments[row.outbound_order_detail_id] for row in rows})
    db.add(cycle)
    db.flush()
    for row in rows:
        row.auto_cycle_id = cycle.id
    db.add(OutboundAutoCommand(cycle_id=cycle.id, robot_task_id=task.id, kind="pick", state="prepared"))
    db.commit()
    return cycle


def _send(db, control, cycle, kind):
    if cycle.execution_mode == "manual_services":
        # The shared service has already prepared and submitted a new pick.
        # A recovered, definitely-unsent pick uses the same shared executor.
        from app.modules.masan.masan_auto_manual_service import context, resume_pick
        if context(db) is None:
            resume_pick(db, control, cycle)
        return
    from app.modules.robot.robot_service import task_status_service
    command = db.query(OutboundAutoCommand).filter_by(cycle_id=cycle.id, kind=kind).one()
    if command.state != "prepared":
        return
    task = db.get(RobotTask, command.robot_task_id)
    start_id, target_id = ((cycle.source_location_id, cycle.vt_location_id) if kind == "pick"
                           else (cycle.vt_location_id, cycle.source_location_id))
    source, target = db.get(Location, start_id), db.get(Location, target_id)
    task.task_order_detail = json.dumps([{"taskPath": f"{source.location_code},{target.location_code}"}])
    rows = (_allocations(db, cycle) if kind == "pick" else
            db.query(OutboundOrderAllocation).filter_by(robot_task_id=task.id).all())
    required = defaultdict(int)
    for row in rows:
        required[row.item_stock_id] += row.quantity
    if (not rows or any(stock.location_id != start_id or not stock.is_active
                        for stock in _stocks(db, cycle) if stock.quantity > 0)
        or any(db.get(ItemStock, identifier).quantity < quantity for identifier, quantity in required.items())):
        command.state, command.error = "failed", "Stock của lượt thay đổi trước khi gửi lệnh"
        _error(db, control, cycle, command.error)
        return
    for row in rows:
        row.from_location_id, row.to_location_id, row.status = start_id, target_id, "issued"
    command.state = "sending"
    cycle.phase = "supplying" if kind == "pick" else "returning"
    db.commit()  # Durable before the network call; survives a killed worker.
    try:
        response = task_status_service.add_task({"orderId": task.order_id, "priority": 6,
            "modelProcessCode": task.process_code, "fromSystem": task.system_code,
            "taskOrderDetail": json.loads(task.task_order_detail)})
        if not isinstance(response, dict) or response.get("code") not in (1000, "1000"):
            raise ValueError(f"ICS từ chối lệnh {task.order_id}: {response}")
    except Exception as exc:
        command.state, command.error = "unknown", str(exc)
        _error(db, control, cycle, f"Cần đối soát lệnh {task.order_id}: {exc}")
        return
    command.state = "accepted"
    cycle.message = "Đang cấp hàng" if kind == "pick" else "Đang return"
    db.commit()


def _return(db, control, cycle):
    if cycle.execution_mode in {"manual_services", "adopted_return"}:
        from app.modules.masan.masan_auto_manual_service import send_return
        return send_return(db, control, cycle)
    vt = db.get(Location, cycle.vt_location_id)
    prepared = db.query(OutboundAutoCommand).filter_by(cycle_id=cycle.id, kind="return", state="prepared").first()
    reason = path_reason(db, control, vt, prepared)
    if reason:
        cycle.message = reason
        return False
    if prepared:
        _send(db, control, cycle, "return")
        return True
    stocks = [stock for stock in _stocks(db, cycle) if stock.quantity > 0]
    if not stocks or any(stock.location_id != vt.id for stock in stocks):
        raise ValueError("Stock của lượt không hợp lệ để return")
    source = db.get(Location, cycle.source_location_id)
    db.refresh(source, ["status"])
    if source.status not in FREE_STATUSES:
        cycle.message = f"Chờ vị trí trả: {source.status}"
        return False
    task = RobotTask(order_id=f"TDS_AutoReturn_{uuid.uuid4().hex[:12]}",
        quantity=int(sum(stock.quantity for stock in stocks)), process_code=settings.inbound_process_code,
        system_code="Thadosoft", task_order_detail='[{"taskPath":"None"}]')
    db.add(task)
    db.flush()
    allocations = _allocations(db, cycle)
    for stock in stocks:
        detail_id = next((row.outbound_order_detail_id for row in allocations if row.item_stock_id == stock.id),
                         allocations[0].outbound_order_detail_id)
        db.add(OutboundOrderAllocation(outbound_order_detail_id=detail_id, item_stock_id=stock.id,
            quantity=int(stock.quantity), status="initialize", allocation_type="return",
            from_location_id=vt.id, to_location_id=source.id, robot_task_id=task.id, auto_cycle_id=cycle.id))
    cycle.return_task_id, cycle.phase = task.id, "returning"
    db.add(OutboundAutoCommand(cycle_id=cycle.id, robot_task_id=task.id, kind="return", state="prepared"))
    db.commit()
    _send(db, control, cycle, "return")
    return True


def tick_zone(db, warehouse_id, display_zone_id):
    with warehouse_lock(db, warehouse_id):
        control = zone_control(db, warehouse_id, display_zone_id)
        if not control:
            return
        _reconcile(db, control)
        if not control.enabled:
            return
        try:
            locations = resolve_locations(db, warehouse_id, display_zone_id)
            from app.modules.masan.masan_return_adoption_service import adopt_ready
            return_candidates = adopt_ready(db, control)
            _, _, pairs = configuration(display_zone_id)
            sent = False
            pair_order = [(control.next_pair + offset) % 2 for offset in range(2)]
            returning_pairs = {index for index, names in enumerate(pairs) if any(
                c["business_ready"] and c["location_id"] == locations[names[0]].id for c in return_candidates)}
            # Return priority applies across the whole zone, not just one pair.
            for pair_index in pair_order:
                rear, front = pairs[pair_index]
                cycles = {cycle.vt_location_id: cycle for cycle in active_cycles(db, warehouse_id) if cycle.zone_id == control.id}
                rear_cycle = cycles.get(locations[rear].id)
                front_cycle = cycles.get(locations[front].id)
                # A blocked rear return prevents refilling the front indefinitely.
                ready = [cycle for cycle in (rear_cycle, front_cycle) if cycle and cycle.phase == "ready_to_return"]
                if ready:
                    returning_pairs.add(pair_index)
                for cycle in ready:
                    if _return(db, control, cycle):
                        sent = True
                        break
                if not control.enabled:
                    break
            for pair_index in pair_order:
                if not control.enabled:
                    break
                if pair_index in returning_pairs:
                    continue
                rear, front = pairs[pair_index]
                cycles = {cycle.vt_location_id: cycle for cycle in active_cycles(db, warehouse_id) if cycle.zone_id == control.id}
                for name in (rear, front):
                    vt = locations[name]
                    if vt.id in cycles:
                        cycle = cycles[vt.id]
                        # A prepared command is definitely unsent; recover using
                        # the same task ID only after giving returns priority.
                        prepared = db.query(OutboundAutoCommand).filter_by(cycle_id=cycle.id, kind="pick", state="prepared").first()
                        if prepared and not path_reason(db, control, vt, prepared):
                            _send(db, control, cycle, "pick")
                            sent = True
                            break
                        continue
                    # An old manual pallet remains manual even if map status allows entry.
                    if db.query(OutboundOrderAllocation.id).filter(
                        OutboundOrderAllocation.to_location_id == vt.id,
                        OutboundOrderAllocation.status.notin_(TERMINAL_ALLOCATIONS),
                    ).first():
                        continue
                    reason = path_reason(db, control, vt)
                    if reason:
                        continue
                    cycle = _prepare_pick(db, control, vt)
                    if cycle:
                        if cycle.execution_mode == "native":
                            _send(db, control, cycle, "pick")
                        sent = True
                        break
                if not control.enabled:
                    break
            control.next_pair = (control.next_pair + 1) % 2
            if control.enabled:
                control.state = "running" if sent or any(cycle.zone_id == control.id for cycle in active_cycles(db, warehouse_id)) else "waiting"
                control.message = "Đang điều phối" if control.state == "running" else "Chờ nhu cầu hoặc VT/nguồn hàng đủ điều kiện"
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.exception("Automatic outbound failed warehouse=%s zone=%s", warehouse_id, display_zone_id)
            control = zone_control(db, warehouse_id, display_zone_id)
            if control.enabled or control.state != "error":
                _error(db, control, None, str(exc) if isinstance(exc, ValueError) else "Lỗi điều phối tự động; cần kiểm tra trước khi bật lại")


def manual_return(db, warehouse_id, display_zone_id, cycle_id):
    with warehouse_lock(db, warehouse_id):
        control = zone_control(db, warehouse_id, display_zone_id)
        cycle = db.get(OutboundAutoCycle, cycle_id)
        if not control or not cycle or cycle.zone_id != control.id:
            raise ValueError("Cycle not found in warehouse/zone")
        if control.enabled:
            raise ValueError("Dừng tự động trước khi gọi return thủ công")
        _reconcile(db, control)
        unresolved = db.query(OutboundAutoCommand).join(OutboundAutoCycle).filter(
            OutboundAutoCycle.zone_id == control.id, OutboundAutoCommand.state.in_(["sending", "unknown", "failed"]),
        ).first()
        if unresolved:
            raise ValueError("Cần đối soát các lệnh lỗi của zone trước khi gọi return")
        if cycle.phase != "ready_to_return":
            raise ValueError("Lượt chưa sẵn sàng return hoặc lệnh đã được gửi")
        control.state, control.message = "stopped", "Đang xử lý thủ công sau khi dừng"
        if not _return(db, control, cycle):
            db.commit()
            raise ValueError(cycle.message or "Đường return chưa sẵn sàng")
        if control.state == "error":
            raise ValueError(control.message)
        return status(db, warehouse_id, display_zone_id)


def confirm(db, warehouse_id, cc_zone, quantities, sorting_persons):
    """Return False for a wholly legacy batch; auto confirmations are atomic/idempotent."""
    owners = {identifier: cycle_for_allocation(db, identifier) for identifier in quantities}
    if not any(owners.values()):
        return False
    if not all(owners.values()):
        raise ValueError("Không trộn allocation thủ công và tự động trong một lần xác nhận")
    modes = {cycle.execution_mode for cycle in owners.values()}
    if len(modes) > 1:
        raise ValueError("Không trộn lượt native và manual_services trong một lần xác nhận")
    if modes == {"manual_services"}:
        from app.modules.masan.masan_auto_manual_service import confirm as shared_confirm
        return shared_confirm(db, warehouse_id, cc_zone, quantities, sorting_persons, owners)
    with warehouse_lock(db, warehouse_id):
        rows = db.query(OutboundOrderAllocation).filter(OutboundOrderAllocation.id.in_(quantities)).all()
        if len(rows) != len(quantities) or not sorting_persons:
            raise ValueError("Thiếu allocation hoặc người xuất")
        for row in rows:
            cycle = owners[row.id]
            control = db.get(OutboundAutoZone, cycle.zone_id)
            if row.allocation_type != "outbound":
                raise ValueError("Chỉ xác nhận allocation outbound tại CC")
            if control.warehouse_id != warehouse_id or configuration(control.display_zone_id)[1] != cc_zone:
                raise ValueError("Allocation không thuộc kho/zone xác nhận")
            if row.quantity != quantities[row.id]:
                raise ValueError("Lượt tự động hiện yêu cầu xác nhận đúng số lượng kế hoạch")
            if row.status not in {"pre_completed", "completed"}:
                raise ValueError("Allocation chưa sẵn sàng xác nhận")
            if row.status != "completed" and (row.item_stock.location_id != cycle.vt_location_id
                or row.item_stock.quantity < row.quantity):
                raise ValueError("Tồn tại VT không đủ hoặc đã thay đổi")
        required = defaultdict(int)
        for row in rows:
            if row.status != "completed":
                required[row.item_stock_id] += row.quantity
        if any(db.get(ItemStock, stock_id).quantity < quantity for stock_id, quantity in required.items()):
            raise ValueError("Tổng số lượng xác nhận vượt tồn của pallet")
        for row in rows:
            if row.status == "completed":
                continue
            row.item_stock.quantity -= row.quantity
            owners[row.id].cache_pending = True
            row.status, row.sorting_persons, row.end_sorting_time = "completed", sorting_persons, now()
            meta = owners[row.id].cc_assignments.get(str(row.outbound_order_detail_id), {})
            row.outbound_order_detail.sorting_location_id = meta.get("location_id")
            db.add(Transaction(from_location_id=row.from_location_id, to_location_id=row.to_location_id,
                transaction_type="outbound", item_stock_id=row.item_stock_id, quantity=row.quantity,
                created_by_id=row.outbound_order_detail.outbound_order.created_by_id))
            db.add(History(outbound_order_id=row.outbound_order_detail.outbound_order_id,
                old_status="in_progress", new_status="completed", description="Automatic VT allocation confirmed",
                details={"allocation_id": row.id, "quantity": row.quantity},
                created_by_id=row.outbound_order_detail.outbound_order.created_by_id))
        db.commit()
        for control_id in {cycle.zone_id for cycle in owners.values()}:
            _reconcile(db, db.get(OutboundAutoZone, control_id))
    wake()
    return True


def receive_callback(db, task, payload):
    """Handle owned tasks only. Return (handled, TaskStatus | None)."""
    cycle = cycle_for_task(db, task.id)
    if not cycle:
        return False, None
    if cycle.execution_mode in {"manual_services", "adopted_return"}:
        return False, None
    control = db.get(OutboundAutoZone, cycle.zone_id)
    with warehouse_lock(db, control.warehouse_id):
        command = db.query(OutboundAutoCommand).filter_by(robot_task_id=task.id).one()
        if command.state == "completed":
            return True, None
        mapped = MAPPING_STATUS.get(str(payload.get("status")))
        if not mapped:
            return True, None
        rows = db.query(OutboundOrderAllocation).filter_by(robot_task_id=task.id).all()
        if mapped == "completed":
            start_id, end_id = ((cycle.source_location_id, cycle.vt_location_id) if command.kind == "pick"
                               else (cycle.vt_location_id, cycle.source_location_id))
            stocks = _stocks(db, cycle)
            if any(stock.location_id != start_id for stock in stocks if stock.quantity > 0):
                _error(db, control, cycle, f"Vị trí stock không khớp callback {task.order_id}")
                return True, None
            for stock in stocks:
                stock.location_id = end_id
            for row in rows:
                row.status = "pre_completed" if command.kind == "pick" else "completed"
                row.end_time = row.end_time or now()
                row.device = row.device or payload.get("deviceNum")
                from app.modules.robot.robot_service import task_status_service
                if row.distance is None:
                    row.distance = task_status_service._distance_m(db, control.warehouse_id, row.from_location, row.to_location)
                if command.kind == "return":
                    db.add(Transaction(from_location_id=start_id, to_location_id=end_id,
                        transaction_type="return", item_stock_id=row.item_stock_id, quantity=row.quantity,
                        created_by_id=row.outbound_order_detail.outbound_order.created_by_id))
            command.state, command.error = "completed", None
            cycle.cache_pending = True
            cycle.phase = "awaiting_confirmation" if command.kind == "pick" else "completed"
            cycle.message = "Chờ xác nhận chia vào CC" if command.kind == "pick" else None
            if command.kind == "return":
                cycle.completed_at = now()
        elif mapped in {"failed", "cancelled"}:
            for row in rows:
                row.status = mapped
            command.state = "failed"
            command.error = f"ICS báo {mapped}: {task.order_id}"
            control.enabled, control.state, control.message = False, "error", command.error
            cycle.phase, cycle.message = "error", command.error
        else:
            # A callback proves an uncertain submission was received. It does not
            # automatically re-enable a zone stopped for an error.
            command.state, command.error = "accepted", None
            cycle.phase = "supplying" if command.kind == "pick" else "returning"
            for row in rows:
                row.status = "in_progress"
                row.device = row.device or payload.get("deviceNum")
                row.start_time = row.start_time or now()
        record = TaskStatus(order_id=task.order_id, status=str(payload.get("status")),
            sub_task_status=payload.get("subTaskStatus"), device_code=payload.get("deviceCode"),
            device_num=payload.get("deviceNum"), qr_code=payload.get("qrCode"), shelf_number=payload.get("shelfNumber"))
        db.add(record)
        db.commit()
        if mapped == "completed":
            from app.socket.ws_events import publish_robot_task_completed
            publish_robot_task_completed(control.warehouse_id, task.order_id, "outbound")
        if mapped == "completed" and command.kind == "pick":
            try:
                _repair_stock_ready(db, control)
            except Exception:
                logger.exception("Automatic pallet arrived; stock-ready cache publication failed")
    wake()
    return True, record
