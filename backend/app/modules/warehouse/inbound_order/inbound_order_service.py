from typing import Optional
import uuid
import json
from sqlalchemy import cast, Integer, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload, joinedload

from app.modules.auth.auth_model import User
from app.modules.warehouse.inbound_order.inbound_order_model import (
    InboundOrder,
    InboundOrderDetail,
    InboundOrderAllocation,
)
from app.modules.warehouse.inbound_order.inbound_order_schema import (
    InboundOrderCreate,
    InboundOrderAllocationCreate,
    InboundSuggestAllocation,
    InboundSuggestAllocationResponse,
    InboundSuggestAllocationItemResponse,
    InboundOrderAllocationResponse,
    InboundOrderDetailResponse,
    InboundOrderUpdate,
    InboundOrderDetailUpdate,
    InboundOrderAllocationUpdate,
    SuggestAdditionalResponse,
)
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.item_stock.item_stock_model import ItemStock
from app.modules.robot.robot_service import task_status_service
from app.modules.robot.robot_model import RobotTask
from app.core.config import settings
from app.core.cache import cache_scan_keys, cache_set, cache_delete
from app.core.logger import get_logger

logger = get_logger("main")


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
            f"Not enough empty locations: need {needed}, "
            f"found {len(empty_locations)}"
        )

    line_items = []
    for i, detail_group in enumerate(body.line_items):
        location = empty_locations[i]
        items = [
            InboundSuggestAllocationItemResponse(
                item_id=item.item_id,
                quantity=item.quantity,
                unit_id=item.unit_id,
                lot_number=item.lot_number,
            )
            for item in detail_group.items
        ]

        line_items.append(
            SuggestAdditionalResponse(
                detail_type=body.detail_type,
                target_location_name=location.location_name,
                target_location_id=location.id,
                line_items=items,
            )
        )
        cache_set(f"inbound:reserved:{location.id}", detail_group.model_dump())

    return InboundSuggestAllocationResponse(line_items=line_items)


def delete_allocated_locations(location_ids: list[int]):
    for location_id in location_ids:
        cache_delete(f"inbound:reserved:{location_id}")

    return len(location_ids)


def _create_stock_and_allocation(
    db: Session,
    detail: InboundOrderDetail,
    payload: InboundOrderAllocationCreate | InboundOrderAllocationUpdate,
) -> InboundOrderAllocation:
    """Create ItemStock at the pickup location plus its allocation row."""
    if payload.item_id is None:
        raise ValueError("Allocation requires item_id")
    if payload.unit_id is None:
        raise ValueError("Allocation requires unit_id")
    if payload.quantity is None:
        raise ValueError("Allocation requires quantity")
    if not detail.from_location_id:
        raise ValueError("Detail requires from_location_id to create stock")

    item_stock = ItemStock(
        item_id=payload.item_id,
        location_id=detail.from_location_id,
        inbound_order_detail_id=detail.id,
        quantity=payload.quantity,
        lot_number=payload.lot_number,
        expiry_date=payload.expiry_date,
        status="in_transit",
        is_active=True,
    )
    db.add(item_stock)
    db.flush()

    allocation = InboundOrderAllocation(
        inbound_order_detail_id=detail.id,
        item_stock_id=item_stock.id,
        unit_id=payload.unit_id,
        quantity=payload.quantity,
    )
    db.add(allocation)
    db.flush()
    return allocation


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
            detail = InboundOrderDetail(
                inbound_order_id=inbound_order.id,
                from_location_id=line_item.from_location_id,
                to_location_id=line_item.to_location_id,
                details=line_item.details or {},
                detail_type=inbound_type,
            )
            db.add(detail)
            db.flush()

            for allocation_payload in line_item.allocations:
                _create_stock_and_allocation(db, detail, allocation_payload)

            cache_delete(f"inbound:reserved:{detail.to_location_id}")

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

    _purge_detail(db, detail)


def _delete_allocation(db: Session, allocation: InboundOrderAllocation) -> None:
    stock = (
        db.query(ItemStock)
        .filter(ItemStock.id == allocation.item_stock_id)
        .first()
    )
    db.delete(allocation)
    if stock:
        db.delete(stock)


def _purge_detail(db: Session, detail: InboundOrderDetail) -> None:
    for allocation in list(detail.allocations):
        _delete_allocation(db, allocation)

    # Safety net for stocks that lost their allocation row earlier.
    stocks = (
        db.query(ItemStock)
        .filter(ItemStock.inbound_order_detail_id == detail.id)
        .all()
    )
    for stock in stocks:
        db.delete(stock)

    cache_delete(f"inbound:reserved:{detail.to_location_id}")
    db.flush()
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

    if "line_items" in payload and body.line_items is not None:
        delete_ids = {
            line.id for line in body.line_items if line.id and line.delete
        }
        if delete_ids:
            existing_details = (
                db.query(InboundOrderDetail)
                .options(selectinload(InboundOrderDetail.allocations))
                .filter(InboundOrderDetail.inbound_order_id == order.id)
                .all()
            )
            existing_ids = {detail.id for detail in existing_details}
            has_non_delete_lines = any(
                not line.delete for line in body.line_items
            )

            if delete_ids == existing_ids and not has_non_delete_lines:
                for detail in existing_details:
                    _purge_detail(db, detail)
                db.delete(order)
                try:
                    db.commit()
                except IntegrityError as e:
                    db.rollback()
                    raise ValueError(f"Database conflict: {e.orig}") from e
                return order

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
                    raise ValueError(f"Inbound detail {line.id} not found")
                _patch_detail(db, detail, line_data)
                if line.allocations is not None:
                    _upsert_allocations(db, detail, line.allocations)
            else:
                _create_detail_with_stock_and_allocation(db, order, line, inbound_type)

    try:
        db.commit()
        db.refresh(order)
        return order
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database conflict: {e.orig}") from e


def _patch_detail(db: Session, detail: InboundOrderDetail, data: dict):
    old_to_location_id = detail.to_location_id

    if "from_location_id" in data:
        detail.from_location_id = data["from_location_id"]
    if "to_location_id" in data:
        detail.to_location_id = data["to_location_id"]
    if "details" in data:
        detail.details = data["details"] or {}

    if "from_location_id" in data:
        stocks = (
            db.query(ItemStock)
            .filter(ItemStock.inbound_order_detail_id == detail.id)
            .all()
        )
        for stock in stocks:
            stock.location_id = detail.from_location_id

    if "to_location_id" in data and detail.to_location_id != old_to_location_id:
        cache_delete(f"inbound:reserved:{old_to_location_id}")
        cache_delete(f"inbound:reserved:{detail.to_location_id}")


def _patch_allocation(db: Session, allocation: InboundOrderAllocation, data: dict):
    if "unit_id" in data:
        allocation.unit_id = data["unit_id"]
    if "quantity" in data:
        allocation.quantity = data["quantity"]

    stock = (
        db.query(ItemStock)
        .filter(ItemStock.id == allocation.item_stock_id)
        .first()
    )
    if not stock:
        return

    if "item_id" in data:
        stock.item_id = data["item_id"]
    if "quantity" in data:
        stock.quantity = allocation.quantity
    if "lot_number" in data:
        stock.lot_number = data["lot_number"]
    if "expiry_date" in data:
        stock.expiry_date = data["expiry_date"]


def _upsert_allocations(
    db: Session,
    detail: InboundOrderDetail,
    allocations: list[InboundOrderAllocationUpdate],
) -> None:
    existing = {allocation.id: allocation for allocation in detail.allocations}

    deleted_ids = {a.id for a in allocations if a.id and a.delete}
    kept_count = len(set(existing) - deleted_ids) + sum(
        1 for a in allocations if not a.id and not a.delete
    )
    if kept_count == 0:
        raise ValueError("Inbound detail must have at least one allocation")

    for payload in allocations:
        if payload.id:
            allocation = existing.get(payload.id)
            if not allocation:
                raise ValueError(f"Inbound allocation {payload.id} not found")
            if payload.delete:
                _delete_allocation(db, allocation)
                continue
            _patch_allocation(db, allocation, payload.model_dump(exclude_unset=True))
        elif not payload.delete:
            _create_stock_and_allocation(db, detail, payload)


def _create_detail_with_stock_and_allocation(
    db: Session,
    order: InboundOrder,
    line: InboundOrderDetailUpdate,
    inbound_type: str,
) -> InboundOrderDetail:
    if line.from_location_id is None:
        raise ValueError("New line item requires from_location_id")
    if line.to_location_id is None:
        raise ValueError("New line item requires to_location_id")
    if not line.allocations:
        raise ValueError("New line item requires at least one allocation")

    detail = InboundOrderDetail(
        inbound_order_id=order.id,
        from_location_id=line.from_location_id,
        to_location_id=line.to_location_id,
        detail_type=inbound_type,
        details=line.details or {},
    )
    db.add(detail)
    db.flush()

    for payload in line.allocations:
        if payload.delete:
            continue
        _create_stock_and_allocation(db, detail, payload)

    cache_delete(f"inbound:reserved:{line.to_location_id}")

    return detail


def _build_allocation_response(
    allocation: InboundOrderAllocation,
) -> InboundOrderAllocationResponse:
    stock = allocation.item_stock
    item = stock.item if stock else None
    unit = allocation.unit
    return InboundOrderAllocationResponse(
        id=allocation.id,
        inbound_order_detail_id=allocation.inbound_order_detail_id,
        item_stock_id=allocation.item_stock_id,
        unit_id=allocation.unit_id,
        quantity=allocation.quantity,
        status=allocation.status,
        item_id=stock.item_id if stock else None,
        sku=item.sku if item else None,
        item_name=item.name if item else None,
        unit_name=unit.name if unit else None,
        lot_number=stock.lot_number if stock else None,
        expiry_date=stock.expiry_date if stock else None,
        created_at=allocation.created_at,
        updated_at=allocation.updated_at,
    )


def _build_detail_response(detail: InboundOrderDetail) -> InboundOrderDetailResponse:
    return InboundOrderDetailResponse(
        id=detail.id,
        inbound_order_id=detail.inbound_order_id,
        from_location_id=detail.from_location_id,
        to_location_id=detail.to_location_id,
        from_location_code=detail.from_location.location_code if detail.from_location else None,
        from_location_name=detail.from_location.location_name if detail.from_location else None,
        to_location_code=detail.to_location.location_code if detail.to_location else None,
        to_location_name=detail.to_location.location_name if detail.to_location else None,
        status=detail.status,
        detail_type=detail.detail_type,
        details=detail.details or {},
        created_at=detail.created_at,
        updated_at=detail.updated_at,
        allocations=[
            _build_allocation_response(allocation)
            for allocation in sorted(detail.allocations, key=lambda a: a.id)
        ],
    )


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
        .options(
            selectinload(InboundOrderDetail.allocations).joinedload(
                InboundOrderAllocation.item_stock
            ).joinedload(ItemStock.item),
            selectinload(InboundOrderDetail.allocations).joinedload(
                InboundOrderAllocation.unit
            ),
            joinedload(InboundOrderDetail.from_location),
            joinedload(InboundOrderDetail.to_location),
        )
        .filter(InboundOrderDetail.inbound_order_id == order.id)
        .order_by(InboundOrderDetail.id)
        .all()
    )
    return [_build_detail_response(d) for d in details]


def execute_inbound_task(db: Session, detail_id: int) -> RobotTask | InboundOrderDetail:
    detail = (
        db.query(InboundOrderDetail)
        .options(
            selectinload(InboundOrderDetail.allocations),
            joinedload(InboundOrderDetail.from_location),
            joinedload(InboundOrderDetail.to_location),
        )
        .filter(InboundOrderDetail.id == detail_id)
        .first()
    )
    if not detail:
        raise ValueError("Detail not found")

    if detail.detail_type == "manual":
        detail.status = "issued"
        db.commit()
        db.refresh(detail)
        return detail

    if not detail.from_location_id or not detail.from_location:
        raise ValueError("From location is required before accepting task")
    if not detail.to_location_id or not detail.to_location:
        raise ValueError("To location is required before accepting task")

    start = detail.from_location.location_code
    target = detail.to_location.location_code
    order_id = f"tds_inbound_{uuid.uuid4().hex[:8]}"
    robot_task = RobotTask(
        inbound_order_detail_id=detail.id,
        order_id=order_id,
        process_code=settings.inbound_process_code,
        system_code="Thadosoft",
        task_order_detail=[{"taskPath": f"{start},{target}"}],
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


def get_inbound_order(
    db: Session,
    warehouse_id: int,
    page: int = 1,
    page_size: int = 10,
    q: Optional[str] = None,
    status: Optional[str] = None,
):
    query = db.query(InboundOrder).filter(InboundOrder.warehouse_id == warehouse_id)

    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.join(InboundOrder.created_by).filter(
            or_(
                InboundOrder.order_code.ilike(term),
                User.username.ilike(term),
            )
        )

    if status:
        query = query.filter(InboundOrder.status == status)

    total = query.count()
    items = (
        query.order_by(InboundOrder.created_at.desc(), InboundOrder.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total


def caller_inbound_order(db: Session, body: InboundOrderCreate, user_id: int, inbound_type: str):
    try:
        inbound_order = create_inbound_order(db, body, user_id, inbound_type)

        details = (
            db.query(InboundOrderDetail)
            .filter(InboundOrderDetail.inbound_order_id == inbound_order.id)
            .all()
        )

        for detail in details:
            execute_inbound_task(db, detail.id)
        return inbound_order
    except Exception as e:
        raise ValueError(f"Error calling inbound order: {e}") from e
