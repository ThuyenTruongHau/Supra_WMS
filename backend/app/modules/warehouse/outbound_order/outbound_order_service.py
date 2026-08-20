import json
import uuid
from typing import Optional
from decimal import Decimal
from collections import defaultdict


from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import case, func, exists, select

from app.core.config import settings
from app.modules.warehouse.item.item_model import Item
from app.modules.warehouse.unit.unit_model import Unit
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrder,
    OutboundOrderDetail,
    OutboundOrderAllocation,
)
from app.modules.warehouse.outbound_order.outbound_order_schema import (
    OutboundOrderCreate,
    OutboundOrderCreateResponse,
    OutboundOrderUpdate,
    OutboundOrderDetailResponse,
    OutboundOrderAllocationResponse,
    OutboundOrderListSummary,
    CalculateOutboundDetail,
    CalculateOutboundResponse,
    StockLineAllocation,
    AllocationResult,
    DetailForCalculate,
    LackedDetailResponse,
    OutboundRobotTaskResponse,
    OutboundRobotTaskCreate,
)
from app.modules.warehouse.unit.unit_model import Unit
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.warehouse_zone.warehouse_model import Zone
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.robot.robot_model import RobotTask
from app.modules.robot.robot_service import task_status_service
from app.modules.warehouse.transaction_history.history_model import History
from app.modules.warehouse.lot_number_utils import format_lot_number_display

from app.core.logger import get_logger

logger = get_logger("main")


def create_outbound_order(db: Session, body: OutboundOrderCreate, user_id: int):
    try:
        outbound_order = OutboundOrder(
            warehouse_id=body.warehouse_id,
            order_code=body.order_code,
            note=body.note,
            details=body.details or {},
            created_by_id=user_id,
        )
        db.add(outbound_order)
        db.flush()
        for line_item in body.line_items:
            unit = db.query(Unit).filter(Unit.id == line_item.unit_id).first()
            if not unit:
                raise ValueError(f"Unit not found: {line_item.unit_id}")

            detail = OutboundOrderDetail(
                outbound_order_id=outbound_order.id,
                item_id=line_item.item_id,
                quantity=line_item.quantity,
                unit=unit.name,
                details=line_item.details or {},
                detail_type=line_item.detail_type,
            )
            db.add(detail)
            db.flush()

        db.add(History(
            outbound_order_id=outbound_order.id,
            old_status="none",
            new_status="initialize",
            description="Outbound order created",
            details={
                "order_code": body.order_code,
                "warehouse_id": body.warehouse_id,
                "line_items": [li.model_dump() for li in body.line_items],
            },
            created_by_id=user_id,
        ))

        db.commit()
        db.refresh(outbound_order)
        return OutboundOrderCreateResponse.model_validate(outbound_order)

    except Exception as e:
        db.rollback()
        raise e


def _build_outbound_list_summary(query) -> OutboundOrderListSummary:
    return OutboundOrderListSummary(
        total=query.count(),
        initialize=query.filter(OutboundOrder.status == "initialize").count(),
        in_progress=query.filter(OutboundOrder.status == "in_progress").count(),
        completed=query.filter(OutboundOrder.status == "completed").count(),
    )


def get_outbound_order(
    db: Session,
    warehouse_id: int,
    page: int = 1,
    page_size: int = 10,
    q: Optional[str] = None,
    status: Optional[str] = None,
):
    base_query = db.query(OutboundOrder).filter(
        OutboundOrder.warehouse_id == warehouse_id
    )
    if q:
        base_query = base_query.filter(OutboundOrder.order_code.ilike(f"%{q}%"))

    summary = _build_outbound_list_summary(base_query)

    filtered_query = base_query
    if status:
        filtered_query = filtered_query.filter(OutboundOrder.status == status)

    total = filtered_query.count()
    items = (
        filtered_query.order_by(OutboundOrder.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total, summary


def get_outbound_order_by_id(db: Session, order_id: int) -> OutboundOrder | None:
    return (
        db.query(OutboundOrder)
        .filter(OutboundOrder.id == order_id)
        .first()
    )


def _build_allocation_response(
    allocation: OutboundOrderAllocation,
) -> OutboundOrderAllocationResponse:
    stock = allocation.item_stock
    item = stock.item if stock else None
    return OutboundOrderAllocationResponse(
        id=allocation.id,
        outbound_order_detail_id=allocation.outbound_order_detail_id,
        item_stock_id=allocation.item_stock_id,
        quantity=allocation.quantity,
        status=allocation.status,
        from_location_id=allocation.from_location_id,
        to_location_id=allocation.to_location_id,
        from_location_code=(
            allocation.from_location.location_code if allocation.from_location else None
        ),
        from_location_name=(
            allocation.from_location.location_name if allocation.from_location else None
        ),
        to_location_code=(
            allocation.to_location.location_code if allocation.to_location else None
        ),
        to_location_name=(
            allocation.to_location.location_name if allocation.to_location else None
        ),
        item_id=stock.item_id if stock else None,
        sku=item.sku if item else None,
        item_name=item.name if item else None,
        lot_number_from=stock.lot_number_from if stock else None,
        lot_number_to=stock.lot_number_to if stock else None,
        lot_number=(
            format_lot_number_display(stock.lot_number_from, stock.lot_number_to)
            if stock
            else None
        ),
        expiry_date=stock.expiry_date if stock else None,
        created_at=allocation.created_at,
        updated_at=allocation.updated_at,
    )


def _build_detail_response(
    detail: OutboundOrderDetail,
    unit_id_by_name: dict[str, int],
) -> OutboundOrderDetailResponse:
    item = detail.item
    return OutboundOrderDetailResponse(
        id=detail.id,
        outbound_order_id=detail.outbound_order_id,
        item_id=detail.item_id,
        sku=item.sku if item else None,
        item_name=item.name if item else None,
        quantity=detail.quantity,
        unit=detail.unit,
        unit_id=unit_id_by_name.get(detail.unit),
        detail_type=detail.detail_type,
        status=detail.status,
        details=detail.details or {},
        created_at=detail.created_at,
        updated_at=detail.updated_at,
        allocations=[
            _build_allocation_response(allocation)
            for allocation in sorted(detail.allocations, key=lambda a: a.id)
            if allocation.allocation_type == "outbound"
        ],
    )


def get_outbound_order_detail(
    db: Session, order_id: int
) -> Optional[list[OutboundOrderDetailResponse]]:
    order = get_outbound_order_by_id(db, order_id)
    if not order:
        return None

    details = (
        db.query(OutboundOrderDetail)
        .options(
            joinedload(OutboundOrderDetail.item),
            selectinload(OutboundOrderDetail.allocations)
            .joinedload(OutboundOrderAllocation.item_stock)
            .joinedload(ItemStock.item),
            selectinload(OutboundOrderDetail.allocations).joinedload(
                OutboundOrderAllocation.from_location
            ),
            selectinload(OutboundOrderDetail.allocations).joinedload(
                OutboundOrderAllocation.to_location
            ),
        )
        .filter(OutboundOrderDetail.outbound_order_id == order_id)
        .order_by(OutboundOrderDetail.id)
        .all()
    )

    unit_names = {detail.unit for detail in details}
    units = (
        db.query(Unit)
        .filter(Unit.name.in_(unit_names))
        .all()
        if unit_names
        else []
    )
    unit_id_by_name = {unit.name: unit.id for unit in units}

    return [
        _build_detail_response(detail, unit_id_by_name)
        for detail in details
    ]


def update_outbound_order(
    db: Session,
    order_id: int,
    body: OutboundOrderUpdate,
    outbound_type: str,
    user_id: int,
):
    order = db.query(OutboundOrder).filter(OutboundOrder.id == order_id).first()
    if not order:
        raise ValueError(f"Outbound order not found: {order_id}")
    if order.status != "initialize":
        raise ValueError("Only initialize order can be updated")

    payload = body.model_dump(exclude_unset=True)

    if "note" in payload:
        order.note = payload["note"]
    if "details" in payload:
        order.details = payload["details"] or {}

    if body.line_items is not None:
        for line in body.line_items:
            if line.id:
                detail = (
                    db.query(OutboundOrderDetail)
                    .filter(
                        OutboundOrderDetail.id == line.id,
                        OutboundOrderDetail.outbound_order_id == order.id,
                    )
                    .first()
                )
                if not detail:
                    raise ValueError(f"Outbound detail {line.id} not found")

                if line.delete:
                    remaining = (
                        db.query(OutboundOrderDetail)
                        .filter(OutboundOrderDetail.outbound_order_id == order.id)
                        .count()
                    )
                    if remaining <= 1:
                        raise ValueError("Outbound order must have at least one detail")
                    db.delete(detail)
                    continue

                _patch_outbound_detail(db, detail, line.model_dump(exclude_unset=True))
            else:
                if line.delete:
                    continue
                if not line.item_id or not line.quantity or not line.unit_id:
                    raise ValueError("New line requires item_id, quantity, unit_id")

                unit = db.query(Unit).filter(Unit.id == line.unit_id).first()
                if not unit:
                    raise ValueError(f"Unit not found: {line.unit_id}")

                db.add(OutboundOrderDetail(
                    outbound_order_id=order.id,
                    item_id=line.item_id,
                    quantity=line.quantity,
                    unit=unit.name,
                    detail_type=line.detail_type or outbound_type,
                    details=line.details or {},
                ))

    db.add(History(
        outbound_order_id=order.id,
        old_status=order.status,
        new_status=order.status,
        description="Outbound order updated",
        details=payload,
        created_by_id=user_id,
    ))

    try:
        db.commit()
        db.refresh(order)
        return order
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e


def _patch_outbound_detail(db: Session, detail: OutboundOrderDetail, data: dict) -> None:
    if "item_id" in data:
        detail.item_id = data["item_id"]
    if "quantity" in data:
        detail.quantity = data["quantity"]
    if "unit_id" in data:
        unit = db.query(Unit).filter(Unit.id == data["unit_id"]).first()
        if not unit:
            raise ValueError(f"Unit not found: {data['unit_id']}")
        detail.unit = unit.name
    if "detail_type" in data:
        detail.detail_type = data["detail_type"]
    if "details" in data:
        detail.details = data["details"] or {}


def _delete_outbound_order_history(db: Session, outbound_order_id: int) -> None:
    db.query(History).filter(
        History.outbound_order_id == outbound_order_id
    ).delete(synchronize_session=False)


def _purge_outbound_detail(db: Session, detail: OutboundOrderDetail) -> None:
    allocations = (
        db.query(OutboundOrderAllocation)
        .filter(OutboundOrderAllocation.outbound_order_detail_id == detail.id)
        .all()
    )
    for allocation in allocations:
        db.delete(allocation)

    db.delete(detail)


def delete_outbound_order(db: Session, order_code: str) -> None:
    order = (
        db.query(OutboundOrder)
        .filter(OutboundOrder.order_code == order_code)
        .first()
    )
    if not order:
        raise ValueError("Outbound order not found")

    if order.status != "initialize":
        raise ValueError("Only initialize order can be deleted")

    existing_details = (
        db.query(OutboundOrderDetail)
        .filter(OutboundOrderDetail.outbound_order_id == order.id)
        .all()
    )
    for detail in existing_details:
        _purge_outbound_detail(db, detail)

    _delete_outbound_order_history(db, order.id)
    db.delete(order)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e


def _strategy_loading_stocks(db: Session, item_id: int, strategy: str):
    q = (
        db.query(ItemStock)
        .join(Location, Location.id == ItemStock.location_id)
        .join(Zone, Zone.id == Location.zone_id)
        .filter(
            ItemStock.item_id == item_id,
            ItemStock.status == "available",
            Zone.code.in_(settings.zone_storage),
            ItemStock.available_quantity > 0,
            ItemStock.is_active.is_(True),
        )
    )
    
    if strategy == "fefo":
        lot_from = ItemStock.lot_number_from
        lot_to = ItemStock.lot_number_to
        lot_date_from = case(
            (
                lot_from.op("~")(r"^\d{2}/\d{2}/\d{2}$"),
                func.to_date(lot_from, "DD/MM/YY"),
            ),
            else_=func.to_date(lot_from, "DDMMYY"),
        )
        lot_date_to = case(
            (
                lot_to.op("~")(r"^\d{2}/\d{2}/\d{2}$"),
                func.to_date(lot_to, "DD/MM/YY"),
            ),
            else_=func.to_date(lot_to, "DDMMYY"),
        )
        q = q.order_by(lot_date_from.asc(), lot_date_to.asc(), ItemStock.id.asc())
    else:
        q = q.order_by(ItemStock.created_at.asc(), ItemStock.id.asc())
    return q.all()

def _check_stock_in_task(db: Session, stock_id: int, outbound_order_id: int) -> bool:
    allocation = (
        db.query(OutboundOrderAllocation)
        .join(OutboundOrderDetail, OutboundOrderDetail.id == OutboundOrderAllocation.outbound_order_detail_id)
        .filter(
            OutboundOrderAllocation.item_stock_id == stock_id,
            OutboundOrderDetail.outbound_order_id == outbound_order_id,
            OutboundOrderAllocation.status == "initialize",
        )
        .first()
    )
    if allocation:
        return allocation.robot_task_id
    return None

def greedy_allocate_stocks_to_lines(
    db: Session,
    stocks: list[ItemStock],
    lines: list[DetailForCalculate],
    outbound_order_id: int,
) -> tuple[list[StockLineAllocation], dict[int, Decimal]]:

    line_remaining = [Decimal(str(line.quantity))  for line in lines]
    stock_remaining = [Decimal(str(stock.available_quantity)) for stock in stocks]

    i = j = 0
    has_task = _check_stock_in_task(db, stocks[j].id, outbound_order_id)
    while i < len(lines) and j < len(stocks): 
        take = min(line_remaining[i], stock_remaining[j])
        stock_remaining[j] -= take
        line_remaining[i] -= take

        if not has_task:
            order_id = f"TDS_Outbound_{uuid.uuid4().hex[:8]}"
            robot_task = RobotTask(
                order_id=order_id,
                quantity=int(stocks[j].quantity),
                process_code=settings.outbound_process_code,
                system_code="Thadosoft",
                task_order_detail=json.dumps([{"taskPath": "None"}])
            )
            db.add(robot_task)
            db.flush()
            has_task = robot_task.id

        allocation = OutboundOrderAllocation(
            outbound_order_detail_id=lines[i].id,
            item_stock_id=stocks[j].id,
            quantity=int(take),
            from_location_id=stocks[j].location_id,
            robot_task_id=has_task,
            allocation_type="outbound",
        )
        db.add(allocation)
        db.flush()

        if line_remaining[i] <= 0:
            i += 1
        if stock_remaining[j] <= 0:
            j += 1
            has_task = _check_stock_in_task(db, stocks[j].id, outbound_order_id) if j < len(stocks) else None

    lacked = {
        lines[idx].id: qty
        for idx, qty in enumerate(line_remaining)
        if qty > 0
    }
    return len(lines), lacked

def calculate_outbound_order(
    db: Session,
    body: CalculateOutboundDetail,
    strategy: str = "fefo",
) -> CalculateOutboundResponse:
    _validate_calculate_outbound_lines(
        db,
        body.warehouse_id,
        body.outbound_order_id,
        body.line_items,
    )

    lines_by_item_id: dict[int, list[DetailForCalculate]] = defaultdict(list)
    for li in body.line_items:
        lines_by_item_id[li.item_id].append(li)

    try:
        for item_id, lines in lines_by_item_id.items():
            stocks = _strategy_loading_stocks(db, item_id, strategy)
            if not stocks:
                raise ValueError(f"No enough stock for item {item_id}")
            greedy_allocate_stocks_to_lines(db, stocks, lines, body.outbound_order_id)
        db.commit()
    except Exception:
        db.rollback()
        raise

    lacked = lacked_details(db, body.outbound_order_id)
    return CalculateOutboundResponse(
        outbound_order_id=body.outbound_order_id,
        is_fully_allocated=len(lacked) == 0,
        lacked=lacked,
    )

def _pick_allocated_sum():
    return func.coalesce(
        func.sum(
            case(
                (OutboundOrderAllocation.allocation_type == "return", 0),
                else_=OutboundOrderAllocation.quantity,
            )
        ),
        0,
    )

def _validate_calculate_outbound_lines(
    db: Session,
    warehouse_id: int,
    outbound_order_id: int,
    line_items: list[DetailForCalculate],
) -> None:
    if not line_items:
        raise ValueError("line_items must not be empty")

    if len({li.id for li in line_items}) != len(line_items):
        raise ValueError("Duplicate detail id in line_items")

    order = (
        db.query(OutboundOrder)
        .filter(
            OutboundOrder.id == outbound_order_id,
            OutboundOrder.warehouse_id == warehouse_id,
        )
        .first()
    )
    if not order:
        raise ValueError(
            f"Outbound order {outbound_order_id} not found in warehouse {warehouse_id}"
        )

    requested_ids = {li.id for li in line_items}
    db_details = (
        db.query(OutboundOrderDetail)
        .filter(
            OutboundOrderDetail.outbound_order_id == outbound_order_id,
            OutboundOrderDetail.id.in_(requested_ids),
        )
        .all()
    )
    db_detail_by_id = {d.id: d for d in db_details}

    missing_ids = requested_ids - db_detail_by_id.keys()
    if missing_ids:
        raise ValueError(
            f"Detail ids not found in order {outbound_order_id}: {sorted(missing_ids)}"
        )

    allocated_rows = (
        db.query(
            OutboundOrderAllocation.outbound_order_detail_id,
            _pick_allocated_sum().label("allocated"),
        )
        .outerjoin(
            RobotTask,
            RobotTask.id == OutboundOrderAllocation.robot_task_id,
        )
        .filter(OutboundOrderAllocation.outbound_order_detail_id.in_(requested_ids))
        .group_by(OutboundOrderAllocation.outbound_order_detail_id)
        .all()
    )
    allocated_by_detail_id = {
        detail_id: int(allocated) for detail_id, allocated in allocated_rows
    }

    for payload in line_items:
        db_detail = db_detail_by_id[payload.id]
        if payload.item_id != db_detail.item_id:
            raise ValueError(
                f"Detail {payload.id}: item_id mismatch "
                f"(payload={payload.item_id}, db={db_detail.item_id})"
            )
        remaining = db_detail.quantity - allocated_by_detail_id.get(payload.id, 0)
        if payload.quantity > remaining:
            raise ValueError(
                f"Detail {payload.id}: quantity {payload.quantity} exceeds "
                f"remaining {remaining}"
            )


def lacked_details(db: Session, order_id: int) -> list[LackedDetailResponse]:
    unit_by_name = {
        unit.name: unit.id
        for unit in (
            db.query(Unit)
            .join(
                OutboundOrderDetail,
                OutboundOrderDetail.unit == Unit.name,
            )
            .filter(OutboundOrderDetail.outbound_order_id == order_id)
            .distinct()
            .all()
        )
    }

    allocated_rows = (
        db.query(
            OutboundOrderAllocation.outbound_order_detail_id,
            _pick_allocated_sum().label("allocated"),
        )
        .join(
            OutboundOrderDetail,
            OutboundOrderDetail.id == OutboundOrderAllocation.outbound_order_detail_id,
        )
        .outerjoin(
            RobotTask,
            RobotTask.id == OutboundOrderAllocation.robot_task_id,
        )
        .filter(OutboundOrderDetail.outbound_order_id == order_id)
        .group_by(OutboundOrderAllocation.outbound_order_detail_id)
        .all()
    )
    allocated_by_detail_id = {
        detail_id: int(allocated) for detail_id, allocated in allocated_rows
    }

    details = (
        db.query(OutboundOrderDetail)
        .options(joinedload(OutboundOrderDetail.item))
        .filter(OutboundOrderDetail.outbound_order_id == order_id)
        .filter(
            exists(
                select(1)
                .where(
                    OutboundOrderAllocation.outbound_order_detail_id
                    == OutboundOrderDetail.id
                )
            )
        )
        .order_by(OutboundOrderDetail.id)
        .all()
    )

    lacked_lines: list[LackedDetailResponse] = []
    for detail in details:
        allocated = allocated_by_detail_id.get(detail.id, 0)
        remaining = int(detail.quantity - allocated)
        if remaining <= 0:
            continue
        unit_id = unit_by_name.get(detail.unit)
        if unit_id is None:
            raise ValueError(f"Unit not found for detail {detail.id}: {detail.unit}")
        item = detail.item
        lacked_lines.append(
            LackedDetailResponse(
                id=detail.id,
                item_id=detail.item_id,
                quantity=remaining,
                unit_id=unit_id,
                detail_type=detail.detail_type,
                details=detail.details or {},
                sku=item.sku if item else None,
                item_name=item.name if item else None,
                unit=detail.unit,
                requested_quantity=int(detail.quantity),
            )
        )
    return lacked_lines


def _parse_task_path(task_order_detail: str) -> Optional[str]:
    try:
        parsed = json.loads(task_order_detail)
    except (json.JSONDecodeError, TypeError):
        return None
    if isinstance(parsed, list) and parsed:
        first = parsed[0]
        if isinstance(first, dict):
            return first.get("taskPath")
    return None


def get_outbound_robot_tasks(
    db: Session, order_id: int
) -> list[OutboundRobotTaskResponse]:
    robot_tasks = (
        db.query(RobotTask)
        .join(
            OutboundOrderAllocation,
            OutboundOrderAllocation.robot_task_id == RobotTask.id,
        )
        .join(
            OutboundOrderDetail,
            OutboundOrderDetail.id == OutboundOrderAllocation.outbound_order_detail_id,
        )
        .filter(OutboundOrderDetail.outbound_order_id == order_id)
        .order_by(RobotTask.id)
        .distinct()
        .all()
    )

    if not robot_tasks:
        return []

    task_ids = [task.id for task in robot_tasks]
    allocations = (
        db.query(OutboundOrderAllocation)
        .join(
            OutboundOrderDetail,
            OutboundOrderDetail.id == OutboundOrderAllocation.outbound_order_detail_id,
        )
        .filter(
            OutboundOrderDetail.outbound_order_id == order_id,
            OutboundOrderAllocation.robot_task_id.in_(task_ids),
        )
        .options(
            joinedload(OutboundOrderAllocation.item_stock).joinedload(ItemStock.item),
            joinedload(OutboundOrderAllocation.from_location),
            joinedload(OutboundOrderAllocation.to_location),
        )
        .order_by(OutboundOrderAllocation.id)
        .all()
    )

    allocations_by_task_id: dict[int, list[OutboundOrderAllocationResponse]] = (
        defaultdict(list)
    )
    raw_allocations_by_task_id: dict[int, list[OutboundOrderAllocation]] = (
        defaultdict(list)
    )
    for allocation in allocations:
        if allocation.robot_task_id is None:
            continue
        raw_allocations_by_task_id[allocation.robot_task_id].append(allocation)
        allocations_by_task_id[allocation.robot_task_id].append(
            _build_allocation_response(allocation)
        )

    def _resolve_task_type(
        task: RobotTask, raw_allocs: list[OutboundOrderAllocation]
    ) -> str:
        if raw_allocs:
            return raw_allocs[0].allocation_type
        if task.process_code == settings.outbound_process_code:
            return "outbound"
        return "return"

    return [
        OutboundRobotTaskResponse(
            order_id=task.order_id,
            task_path=_parse_task_path(task.task_order_detail),
            task_type=_resolve_task_type(
                task, raw_allocations_by_task_id.get(task.id, [])
            ),
            status=task.status or "initialize",
            quantity=int(task.quantity),
            allocations=allocations_by_task_id.get(task.id, []),
        )
        for task in robot_tasks
    ]


def execute_outbound_task(
    db: Session, body: OutboundRobotTaskCreate, detail_type
) -> None:
    robot_task = (
        db.query(RobotTask).filter(RobotTask.order_id == body.order_id).first()
    )
    if not robot_task:
        raise ValueError("Robot task not found")

    if robot_task.status != "initialize":
        raise ValueError("Robot task is not initialize")

    if not body.from_location_id or not body.to_location_id:
        raise ValueError("From location and to location are required")

    first_allocation: OutboundOrderAllocation | None = None
    taken = 0
    for item in body.allocations:
        allocation = (
            db.query(OutboundOrderAllocation)
            .options(
                joinedload(OutboundOrderAllocation.outbound_order_detail).joinedload(
                    OutboundOrderDetail.outbound_order
                ),
            )
            .filter(OutboundOrderAllocation.id == item.allocation_id)
            .first()
        )
        if not allocation:
            raise ValueError(f"Allocation not found: {item.allocation_id}")
        if allocation.robot_task_id != robot_task.id:
            raise ValueError(
                f"Allocation {item.allocation_id} does not belong to robot task"
            )
        if allocation.status != "initialize":
            raise ValueError(
                f"Allocation {item.allocation_id} is not initialize"
            )
        allocation.from_location_id = body.from_location_id
        allocation.to_location_id = body.to_location_id
        allocation.status = "issued"
        taken += int(allocation.quantity)
        if first_allocation is None:
            first_allocation = allocation
        db.flush()

    start = db.query(Location).filter(Location.id == body.from_location_id).first()
    target = db.query(Location).filter(Location.id == body.to_location_id).first()
    if not start or not target:
        raise ValueError("From location or to location not found")

    task_path = f"{start.location_code},{target.location_code}"
    robot_task.task_order_detail = json.dumps([{"taskPath": task_path}])

    # Leftover return task is created only when executing an outbound pick.
    return_quantity = 0
    if (
        first_allocation is not None
        and first_allocation.allocation_type != "return"
        and first_allocation.item_stock is not None
    ):
        return_quantity = int(first_allocation.item_stock.quantity) - taken
    if return_quantity > 0:
        order_id = f"TDS_Return_{uuid.uuid4().hex[:8]}"
        return_task = RobotTask(
            order_id=order_id,
            quantity=return_quantity,
            process_code=settings.inbound_process_code,
            system_code="Thadosoft",
            task_order_detail=json.dumps([{"taskPath": f"{target.location_code},{start.location_code}"}])
        )
        db.add(return_task)
        db.flush()
        return_allocation = OutboundOrderAllocation(
            outbound_order_detail_id=first_allocation.outbound_order_detail_id,
            item_stock_id=first_allocation.item_stock_id,
            quantity=return_quantity,
            status="initialize",
            from_location_id=target.id,
            to_location_id=start.id,
            robot_task_id=return_task.id,
            allocation_type="return",
        )
        db.add(return_allocation)
        db.flush()

    if first_allocation is not None:
        outbound_order = first_allocation.outbound_order_detail.outbound_order
        db.add(
            History(
                outbound_order_id=outbound_order.id,
                old_status="initialize",
                new_status="issued",
                description=f"Outbound order {outbound_order.id} in progress",
                details=json.dumps([{"taskPath": task_path}]),
                created_by_id=outbound_order.created_by_id,
            )
        )

    try:
        task_status_service.create_robot_task(db, robot_task, not_inserted=False)
        db.commit()
    except Exception:
        db.rollback()
        raise