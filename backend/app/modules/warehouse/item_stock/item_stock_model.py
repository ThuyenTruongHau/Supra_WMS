"""Item stock model for warehouse cell inventory."""

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
    Boolean,
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import uuid
from app.core.database import Base


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
    quantity = Column(Numeric(12, 3), nullable=False, default=0)
    lot_number = Column(String(50), nullable=True, index=True)
    expiry_date = Column(Date, nullable=True, index=True)
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
    location = relationship(
        "Location",
        back_populates="stocks",
        lazy="joined"
    )
    inbound_order_detail = relationship("InboundOrderDetail", foreign_keys=[inbound_order_detail_id], lazy="joined")

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_item_stock_quantity_non_negative"),
        # CheckConstraint(
        #     "status IN ('available', 'reserved', 'cross_dock_reserved', "
        #     "'in_transit', 'at_outbound_station', 'damaged', 'quarantine', 'expired')",
        #     name="ck_item_stock_status",
        # ),
    )



