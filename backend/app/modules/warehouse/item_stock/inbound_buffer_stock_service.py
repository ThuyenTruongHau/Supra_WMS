"""Edit one staged inbound stock and its allocation atomically."""
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session, lazyload

from app.core.config import settings
from app.modules.robot.robot_model import RobotTask
from app.modules.warehouse.inbound_order.inbound_lock import lock_inbound_detail
from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrderAllocation
from app.modules.warehouse.item_stock.item_stock_model import ItemStock, ItemStockRelation
from app.modules.warehouse.item_stock.item_stock_schema import ItemStockUpdate
from app.modules.warehouse.location_map.location_model import Location
from app.modules.warehouse.unit.unit_service import convert_quantity
from app.modules.warehouse.warehouse_zone.warehouse_model import Zone


class InboundBufferStockConflict(ValueError):
    def __init__(self, message: str, *, code: str = "inbound_stock_conflict"):
        super().__init__(message)
        self.code = code


def _allocation_quantity(db: Session, stock: ItemStock, allocation: InboundOrderAllocation,
                         quantity: Decimal) -> int:
    if (not quantity.is_finite() or quantity < 0 or quantity > 999999999
            or quantity != quantity.to_integral_value()):
        raise ValueError("Số lượng phải là số nguyên từ 0 đến 999999999")
    # Convert one unit to reuse existing factors, including when editing to 0.
    stock_factor = Decimal(str(convert_quantity(db, stock.item_id, stock.unit_id, 1).converted_quantity))
    divisor = Decimal(str(convert_quantity(db, stock.item_id, allocation.unit_id, 1).converted_quantity))
    if stock_factor <= 0 or divisor <= 0:
        raise ValueError("Hệ số quy đổi đơn vị không hợp lệ")
    result = quantity * stock_factor / divisor
    if result != result.to_integral_value() or result > 2147483647:
        raise ValueError("Số lượng không thể quy đổi chính xác sang đơn vị của đơn nhập")
    return int(result)


def update_inbound_buffer_stock(db: Session, stock_id: int, body: ItemStockUpdate,
                                location_id: int) -> ItemStock:
    try:
        return _update(db, stock_id, body, location_id)
    except Exception:
        db.rollback()
        raise


def _update(db: Session, stock_id: int, body: ItemStockUpdate, location_id: int) -> ItemStock:
    data = body.model_dump(exclude_unset=True)
    if set(data) - {"quantity", "lot_number", "lot_number_from", "lot_number_to", "expiry_date"}:
        raise ValueError("Chỉ được sửa số lượng, LOT và hạn dùng tại buffer nhập")
    # All three writers lock detail before stock to avoid inverse lock order.
    owner_id = db.query(ItemStock.inbound_order_detail_id).filter(ItemStock.id == stock_id).scalar()
    detail = lock_inbound_detail(db, owner_id) if owner_id is not None else None
    stock = (
        db.query(ItemStock).options(lazyload("*"))
        .filter(ItemStock.id == stock_id).with_for_update(of=ItemStock)
        .populate_existing().first()
    )
    if (stock is None or not stock.is_active or stock.location_id != location_id
            or detail is None or stock.inbound_order_detail_id != detail.id
            or detail.from_location_id != location_id or detail.status == "completed"):
        raise InboundBufferStockConflict(
            "Hàng không còn chờ nhập tại buffer này. Vui lòng tải lại vị trí.",
            code="inbound_buffer_changed",
        )
    location = db.get(Location, location_id)
    zone = db.get(Zone, location.zone_id) if location and location.zone_id else None
    if (not location or not location.is_active or not zone
            or not ({zone.code, zone.name} & set(settings.zone_inbound))
            or location.warehouse_id != detail.inbound_order.warehouse_id):
        raise InboundBufferStockConflict("Vị trí này không phải buffer chờ nhập của đơn")
    if (stock.status == "virtual" or (stock.stock_level is not None and stock.stock_level > 1)
            or db.query(ItemStockRelation.id).filter(or_(
                ItemStockRelation.parent_stock_id == stock_id,
                ItemStockRelation.child_stock_id == stock_id,
            )).first()):
        raise InboundBufferStockConflict("Hàng có liên kết phân cấp, không thể sửa trực tiếp tại buffer")
    allocations = (
        db.query(InboundOrderAllocation).options(lazyload("*"))
        .filter(InboundOrderAllocation.item_stock_id == stock_id)
        .populate_existing().all()
    )
    if len(allocations) != 1 or allocations[0].inbound_order_detail_id != detail.id:
        raise InboundBufferStockConflict("Không xác định được duy nhất allocation cần đồng bộ")
    allocation = allocations[0]
    if "quantity" in data:
        quantity = data["quantity"]
        if quantity is None:
            raise ValueError("Số lượng không được để trống")
        allocation.quantity = _allocation_quantity(db, stock, allocation, quantity)
        stock.quantity = quantity
    for field in ("lot_number_from", "lot_number_to", "expiry_date"):
        if field in data:
            setattr(stock, field, data[field])
    db.flush()
    if "quantity" in data:
        total = sum(row[0] for row in db.query(InboundOrderAllocation.quantity).filter(
            InboundOrderAllocation.inbound_order_detail_id == detail.id,
        ).all())
        if total > 2147483647:
            raise ValueError("Tổng số lượng của lệnh robot vượt giới hạn cho phép")
        tasks = db.query(RobotTask).filter(
            RobotTask.inbound_order_detail_id == detail.id,
        ).populate_existing().all()
        for task in tasks:
            if task.status not in {"completed", "failed", "cancelled"}:
                task.quantity = total
    db.commit()
    db.refresh(stock)
    return stock
