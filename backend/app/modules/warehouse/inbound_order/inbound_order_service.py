from datetime import date, timedelta
from decimal import Decimal
from typing import Optional
import uuid
import json
from sqlalchemy import func, cast, Integer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.modules.warehouse.inbound_order.inbound_order_model import (
    InboundOrder, 
    InboundOrderDetail, 
    InboundOrderAllocation,
)
from app.modules.warehouse.inbound_order.inbound_order_schema import (
    InboundOrderCreate, 
    InboundOrderDetailCreate, 
    InboundOrderAllocationCreate, 
    InboundSuggestAllocation,
    InboundSuggestAllocationResponse,
    InboundSuggestAllocationItemResponse,
    InboundOrderDetailResponse,
    InboundOrderUpdate,
    InboundOrderDetailUpdate,
)
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.robot.robot_service import task_status_service
from app.modules.robot.robot_model import RobotTask
from app.core.config import settings
from app.core.cache import cache_scan_keys, cache_set, cache_delete

def suggest_allocation_inbound(db: Session, body: InboundSuggestAllocation):
    needed = len(body.line_items)
    reversed_keys = cache_scan_keys("inbound:reserved:*")   
    reversed_location_ids = [int(k.rsplit(":", 1)[-1]) for k in reversed_keys]

    query = (
        db.query(Location)
        .filter(
            Location.warehouse_id == body.warehouse_id,
            Location.is_active.is_(True),
            Location.status == "empty",
        )
    )
    if reversed_location_ids:
        query = query.filter(Location.id.notin_(reversed_location_ids))

    empty_locations = (
        query
        .order_by(
            cast(Location.row, Integer).nulls_last(),
            cast(Location.column, Integer).nulls_last(),
            cast(Location.level, Integer).nulls_last(),
            Location.id,
        )
        .limit(needed)
        .all()
    )

    if len(empty_locations) < needed:
        raise ValueError(
            f"Not enough empty locations: need {len(body.line_items)}, "
            f"found {len(empty_locations)}"
        )

    line_items = []
    for i, line_item in enumerate(body.line_items):
        line_items.append(
            InboundSuggestAllocationItemResponse(
                item_id=line_item.item_id,
                quantity=line_item.quantity,
                unit_id=line_item.unit_id,
                detail_type=line_item.detail_type,
                details=line_item.details or {},
                target_location_name=empty_locations[i].location_name,
                target_location_id=empty_locations[i].id,
            )
        )
        cache_set(f"inbound:reserved:{empty_locations[i].id}", line_item.model_dump())
    
    return InboundSuggestAllocationResponse(line_items=line_items)


def delete_allocated_locations(location_ids: list[int]):
    for location_id in location_ids:
        cache_delete(f"inbound:reserved:{location_id}")
    
    return len(location_ids)

def create_inbound_order(db: Session, body: InboundOrderCreate, user_id: int, inbound_type: str):
    try:
        inbound_order = InboundOrder(
            warehouse_id=body.warehouse_id,
            order_code=body.order_code,
            note=body.note,
            details=body.details or {},
            created_by_id=user_id,
        )
        db.add(inbound_order)
        db.flush()
        for line_item in body.line_items:
            inbound_order_detail = InboundOrderDetail(
                inbound_order_id=inbound_order.id,
                item_id=line_item.item_id,
                quantity=line_item.quantity,
                lot_number=line_item.lot_number,
                expiry_date=line_item.expiry_date,
                unit_id=line_item.unit_id,
                detail_type=inbound_type,
                details=line_item.details or {},
            )
            db.add(inbound_order_detail)

            item_stock = ItemStock(
                item_id=line_item.item_id,
                location_id=line_item.allocation.from_location_id,
                inbound_order_detail_id=inbound_order_detail.id,
                quantity=inbound_order_detail.quantity,
                lot_number=inbound_order_detail.lot_number,
                expiry_date=inbound_order_detail.expiry_date,
            )
            db.add(item_stock)

            allocation = InboundOrderAllocation(
                inbound_order_detail_id=inbound_order_detail.id,
                item_stock_id=item_stock.id,
                quantity=line_item.quantity,
                from_location_id=line_item.allocation.from_location_id,
                to_location_id=line_item.allocation.to_location_id,
            )
            cache_delete(f"inbound:reserved:{line_item.allocation.to_location_id}")
            db.add(allocation)
            db.flush()
        db.commit()
        db.refresh(inbound_order)
        return inbound_order
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e

def _delete_detail_with_related(
    db: Session,
    order_id: int,
    detail_id: int,
) -> None:
    detail = (
        db.query(InboundOrderDetail)
        .options(selectinload(InboundOrderDetail.allocations))
        .filter(
            InboundOrderDetail.id == detail_id,
            InboundOrderDetail.inbound_order_id == order_id,
        )
        .first()
    )
    if not detail:
        raise ValueError(f"Inbound detail {detail_id} not found")

    remaining = (
        db.query(InboundOrderDetail)
        .filter(InboundOrderDetail.inbound_order_id == order_id)
        .count()
    )
    if remaining <= 1:
        raise ValueError("Inbound order must have at least one detail")

    for allocation in detail.allocations:
        cache_delete(f"inbound:reserved:{allocation.to_location_id}")
        db.delete(allocation)

    stocks = (
        db.query(ItemStock)
        .filter(ItemStock.inbound_order_detail_id == detail.id)
        .all()
    )
    for stock in stocks:
        db.delete(stock)

    db.delete(detail)

def update_inbound_order(db: Session, order_code: str, body: InboundOrderUpdate, inbound_type: str) -> InboundOrder:
    order = (
        db.query(InboundOrder)
        .filter(InboundOrder.order_code == order_code)
        .first()
    )
    if not order:
        raise ValueError("Inbound order not found")

    if order.status != "initialize":
        raise ValueError("Only initialize order can be updated")

    payload = body.model_dump(exclude_unset=True)

    if "note" in payload:
        order.note = payload["note"]
    if "details" in payload:
        order.details = payload["details"] or {}

    if "line_items" in payload:
        for line in body.line_items:
            line_data = line.model_dump(exclude_unset=True)

            if line.id:
                if line.delete:
                    _delete_detail_with_related(db, order.id, line.id)
                    continue
                detail = (
                    db.query(InboundOrderDetail)
                    .options(selectinload(InboundOrderDetail.allocations))
                    .filter(
                        InboundOrderDetail.id == line.id,
                        InboundOrderDetail.inbound_order_id == order.id,
                    )
                    .first()
                )
                if not detail:
                    _patch_detail(db, detail, line_data)
                    if "allocation" in line_data and line.allocation:
                        alloc_data = line.allocation.model_dump(exclude_unset=True)
                        allocation = detail.allocations[0] 
                        _patch_allocation(db, allocation, alloc_data, detail)
            else:
                _create_detail_with_stock_and_allocation(db, order, line, inbound_type)

    try:
        db.commit()
        db.refresh(order)
        return order
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e

def _patch_detail(db, detail: InboundOrderDetail, data: dict):
    if "item_id" in data:
        detail.item_id = data["item_id"]
    if "quantity" in data:
        detail.quantity = data["quantity"]
    if "unit_id" in data:
        detail.unit_id = data["unit_id"]
    if "lot_number" in data:
        detail.lot_number = data["lot_number"]
    if "expiry_date" in data:
        detail.expiry_date = data["expiry_date"]
    if "details" in data:
        detail.details = data["details"] or {}

    stock = (
        db.query(ItemStock)
        .filter(ItemStock.inbound_order_detail_id == detail.id)
        .first()
    )

    if stock:
        if "quantity" in data:
            stock.quantity = detail.quantity
        if "lot_number" in data:
            stock.lot_number = detail.lot_number
        if "expiry_date" in data:
            stock.expiry_date = detail.expiry_date
        if "item_id" in data:
            stock.item_id = detail.item_id

def _patch_allocation(db, allocation: InboundOrderAllocation, data: dict, detail: InboundOrderDetail):
    old_to = allocation.to_location_id

    if "from_location_id" in data:
        allocation.from_location_id = data["from_location_id"]
    if "to_location_id" in data:
        allocation.to_location_id = data["to_location_id"]
    if "quantity" in data:
        allocation.quantity = data["quantity"]

    stock = db.query(ItemStock).filter(ItemStock.id == allocation.item_stock_id).first()
    if stock:
        if "from_location_id" in data:
            stock.location_id = allocation.from_location_id
        if "quantity" in data:
            stock.quantity = allocation.quantity

    if "to_location_id" in data and allocation.to_location_id != old_to:
        cache_delete(f"inbound:reserved:{old_to}")

def _create_detail_with_stock_and_allocation(
    db: Session,
    order: InboundOrder,
    line: InboundOrderDetailUpdate,
    inbound_type: str,
) -> InboundOrderDetail:
    if line.item_id is None:
        raise ValueError("New line item requires item_id")
    if line.quantity is None:
        raise ValueError("New line item requires quantity")
    if line.unit_id is None:
        raise ValueError("New line item requires unit_id")
    if not line.allocation:
        raise ValueError("New line item requires allocation")
    if line.allocation.from_location_id is None or line.allocation.to_location_id is None:
        raise ValueError("New line item allocation requires from_location_id and to_location_id")

    detail = InboundOrderDetail(
        inbound_order_id=order.id,
        item_id=line.item_id,
        quantity=line.quantity,
        lot_number=line.lot_number,
        expiry_date=line.expiry_date,
        unit_id=line.unit_id,
        detail_type=inbound_type,
        details=line.details or {},
    )
    db.add(detail)
    db.flush()  

    stock = ItemStock(
        item_id=line.item_id,
        location_id=line.allocation.from_location_id,
        inbound_order_detail_id=detail.id,
        quantity=line.quantity,
        lot_number=line.lot_number,
        expiry_date=line.expiry_date,
    )
    db.add(stock)
    db.flush() 

    allocation = InboundOrderAllocation(
        inbound_order_detail_id=detail.id,
        item_stock_id=stock.id,
        quantity=line.quantity,
        from_location_id=line.allocation.from_location_id,
        to_location_id=line.allocation.to_location_id,
    )
    db.add(allocation)

    cache_delete(f"inbound:reserved:{line.allocation.to_location_id}")

    return detail


def get_inbound_order_detail(db: Session, order_code: str) -> Optional[list[InboundOrderDetailResponse]]:
    order = (
        db.query(InboundOrder)
        .filter(InboundOrder.order_code == order_code)
        .first()
    )
    if not order:
        return None

    details = (
        db.query(InboundOrderDetail)
        .options(selectinload(InboundOrderDetail.allocations))
        .filter(InboundOrderDetail.inbound_order_id == order.id)
        .order_by(InboundOrderDetail.id)
        .all()
    )
    return [InboundOrderDetailResponse.model_validate(d) for d in details]

def execute_inbound_task(db: Session, detail_id: int, detail_type: str) -> RobotTask:
    detail = (
        db.query(InboundOrderDetail)
        .options(selectinload(InboundOrderDetail.allocations))
        .filter(InboundOrderDetail.id == detail_id)
        .first()
    )
    if not detail:
        raise ValueError("Detail not found")

    if detail_type == "manual":
        detail.status = "issued"
        db.commit()
        db.refresh(detail)
        return detail
        
    start = detail.allocations[0].from_location.location_code  
    target = detail.allocations[0].to_location.location_code
    order_id = f"tds_inbound_{uuid.uuid4().hex[:8]}"
    robot_task = RobotTask(
        inbound_order_detail_id=detail.id,
        order_id=order_id,
        process_code=settings.inbound_process_code,
        system_code="Thadosoft",
        task_order_detail=json.dumps([{"taskPath": f"{start},{target}"}]),
    )

    try:
        task_status_service.create_robot_task(db, robot_task)
        detail.status = "issued"
        db.commit()
        db.refresh(detail)
        return robot_task
    except Exception:
        db.rollback()
        raise


def get_inbound_order(db: Session, warehouse_id: int, page: int = 1, page_size: int = 10):
    query = (
        db.query(InboundOrder)
        .filter(InboundOrder.warehouse_id == warehouse_id)
        .order_by(InboundOrder.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return query.all()

def caller_inbound_order(db: Session, body: InboundOrderCreate, inbound_type: str):
    try:
        inbound_order = create_inbound_order(db, body, 1, inbound_type)

        details = (
            db.query(InboundOrderDetail)
            .filter(InboundOrderDetail.inbound_order_id == inbound_order.id)
            .all()
        )

        for detail in details:
            accept_inbound_task(db, detail.id)
        return inbound_order
    except Exception as e:
        raise ValueError(f"Error calling inbound order: {e}") from e

