"""Item stock model for warehouse cell inventory."""

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
    Boolean,
    case,
    or_,
    func,
    select,
    and_,
)
from sqlalchemy.orm import relationship, column_property
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.core.database import Base
from app.modules.warehouse.outbound_order.outbound_order_model import OutboundOrderAllocation

_NON_COUNTABLE_ALLOCATION_STATUSES = ("completed", "failed")
def countable_allocation_quantity():
    return case(
        (
            and_(
                OutboundOrderAllocation.allocation_type == "outbound",
                OutboundOrderAllocation.status.notin_(_NON_COUNTABLE_ALLOCATION_STATUSES),
            ),
            OutboundOrderAllocation.quantity,
        ),
        else_=0,
    )
def pick_allocated_sum():
    return func.coalesce(func.sum(countable_allocation_quantity()), 0)


class ItemStock(Base):
    """Current item stock rows stored in warehouse locations."""

    __tablename__ = "item_stock"

    id = Column(Integer, primary_key=True, index=True)
    stock_code = Column(UUID(as_uuid=True), unique=True, nullable=False, index=True, default=uuid.uuid4)
    item_id = Column("item_id", Integer, ForeignKey("item.id"), nullable=False, index=True)
    location_id = Column(
        "location_id",
        Integer,
        ForeignKey("location.id"),
        nullable=False,
        index=True,
    )
    inbound_order_detail_id = Column(Integer, ForeignKey("inbound_order_detail.id"), nullable=True, index=True)
    unit_id = Column(Integer, ForeignKey("unit.id"), nullable=False, index=True)
    quantity = Column(Numeric(12, 3), nullable=False, default=0)
    lot_number = Column(String(50), nullable=True, index=True)
    expiry_date = Column(String(50), nullable=True, index=True)
    status = Column(
        String(20),
        nullable=False,
        default="available",
        server_default="available",
        index=True,
    )
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    item = relationship("Item", lazy="joined")
    unit = relationship("Unit", foreign_keys=[unit_id], lazy="joined")
    location = relationship(
        "Location",
        back_populates="stocks",
        lazy="joined"
    )
    inbound_order_detail = relationship("InboundOrderDetail", foreign_keys=[inbound_order_detail_id], lazy="joined")
    available_quantity = column_property(
        quantity
        - select(
            func.coalesce(
                func.sum(countable_allocation_quantity()),
                0,
            )
        )
        .where(OutboundOrderAllocation.item_stock_id == id)
        .correlate_except(OutboundOrderAllocation)
        .scalar_subquery()
    )

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_item_stock_quantity_non_negative"),
        # CheckConstraint(
        #     "status IN ('available', 'reserved', 'cross_dock_reserved', "
        #     "'in_transit', 'at_outbound_station', 'damaged', 'quarantine', 'expired')",
        #     name="ck_item_stock_status",
        # ),
    )



