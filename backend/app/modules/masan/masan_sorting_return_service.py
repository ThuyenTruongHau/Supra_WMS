"""Read ready return tasks from VT allocations, independently of CC assignments."""

from collections import defaultdict

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.modules.masan.masan_schema import (
    MasanSortingReturnTaskRow,
    MasanSortingZoneReturnTasksResponse,
)
from app.modules.robot.robot_model import RobotTask
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation
from app.modules.warehouse.outbound_order.outbound_order_schema import OutboundRobotTaskResponse
from app.modules.warehouse.outbound_order.outbound_order_service import (
    _build_allocation_response,
    _parse_task_path,
)
from app.modules.warehouse.warehouse_zone.warehouse_model import Zone


def list_sorting_zone_return_tasks(
    db: Session, warehouse_id: int, zone: str
) -> MasanSortingZoneReturnTasksResponse:
    zone = zone.strip()
    result = MasanSortingZoneReturnTasksResponse(warehouse_id=warehouse_id, zone=zone)
    tasks = (
        db.query(RobotTask)
        .join(OutboundOrderAllocation, OutboundOrderAllocation.robot_task_id == RobotTask.id)
        .join(Location, Location.id == OutboundOrderAllocation.from_location_id)
        .join(Zone, Zone.id == Location.zone_id)
        .filter(
            Location.warehouse_id == warehouse_id,
            Zone.warehouse_id == warehouse_id,
            Zone.code == zone,
            OutboundOrderAllocation.allocation_type == "return",
            OutboundOrderAllocation.status == "initialize",
            RobotTask.status == "initialize",
        )
        .order_by(RobotTask.id)
        .distinct()
        .all()
    )
    if not tasks:
        return result

    # Fetch the whole task, including allocations shared across outbound orders.
    allocations = (
        db.query(OutboundOrderAllocation)
        .filter(OutboundOrderAllocation.robot_task_id.in_([task.id for task in tasks]))
        .options(
            joinedload(OutboundOrderAllocation.item_stock).joinedload(ItemStock.item),
            joinedload(OutboundOrderAllocation.from_location).joinedload(Location.zone),
            joinedload(OutboundOrderAllocation.to_location),
            joinedload(OutboundOrderAllocation.outbound_order_detail),
        )
        .order_by(OutboundOrderAllocation.id)
        .all()
    )
    by_task = defaultdict(list)
    for allocation in allocations:
        by_task[allocation.robot_task_id].append(allocation)

    outbound = (
        db.query(
            OutboundOrderAllocation.outbound_order_detail_id,
            OutboundOrderAllocation.item_stock_id,
            OutboundOrderAllocation.to_location_id,
            OutboundOrderAllocation.status,
        )
        .filter(
            OutboundOrderAllocation.allocation_type == "outbound",
            or_(
                OutboundOrderAllocation.outbound_order_detail_id.in_(
                    {a.outbound_order_detail_id for a in allocations}
                ),
                OutboundOrderAllocation.item_stock_id.in_({a.item_stock_id for a in allocations}),
            ),
        )
        .all()
    )
    completed = set()
    pending_details = set()
    pending_pallets = set()
    for detail_id, stock_id, to_id, status in outbound:
        if status == "completed":
            completed.add((detail_id, stock_id, to_id))
        elif status not in {"failed", "cancelled"}:
            pending_details.add(detail_id)
            pending_pallets.add((stock_id, to_id))

    for task in tasks:
        rows = by_task[task.id]
        if not rows:
            continue
        route = (rows[0].from_location_id, rows[0].to_location_id)
        ready = True
        for allocation in rows:
            source, target = allocation.from_location, allocation.to_location
            stock, detail = allocation.item_stock, allocation.outbound_order_detail
            if (
                allocation.allocation_type != "return"
                or allocation.status != "initialize"
                or not source or not target or not stock or not detail
                or source.warehouse_id != warehouse_id
                or target.warehouse_id != warehouse_id
                or not source.zone or source.zone.code != zone
                or detail.outbound_order.warehouse_id != warehouse_id
                or (source.id, target.id) != route
                or not stock.is_active or stock.quantity <= 0
                or stock.location_id != source.id
                or allocation.quantity <= 0 or allocation.quantity > stock.quantity
                or (detail.id, stock.id, source.id) not in completed
                or detail.id in pending_details
                or (stock.id, source.id) in pending_pallets
            ):
                ready = False
                break
        if not ready:
            continue
        result.rows.append(MasanSortingReturnTaskRow(
            outbound_order_id=rows[0].outbound_order_detail.outbound_order_id,
            task=OutboundRobotTaskResponse(
                order_id=task.order_id,
                task_path=_parse_task_path(task.task_order_detail),
                task_type="return",
                status=task.status,
                quantity=task.quantity,
                allocations=[_build_allocation_response(a) for a in rows],
            ),
        ))
    return result
