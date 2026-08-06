from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, String, func,
    select, case, exists,
)
from sqlalchemy.orm import relationship, column_property
from app.core.database import Base
from app.modules.warehouse.item_stock.item_stock_model import ItemStock


class Location(Base):
    """Warehouse location model for storing materials and products."""
    
    __tablename__ = "location"
    
    id = Column(Integer, primary_key=True, index=True)
    location_code = Column(String(50), unique=True, nullable=False, index=True)
    location_name = Column(String(100), unique=True, nullable=False, index=True)
    row = Column(String(10))  # Mapped from DB 'row' column
    column = Column("column", String(10))  # 'column' is SQL keyword, use mapped name
    level = Column(String(10))
    node_name = Column(String(50))  # Additional node identifier
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouse.id"),
        nullable=False,
        index=True,
    )
    zone_id = Column(
        Integer,
        ForeignKey("zone.id"),
        nullable=True,
        index=True,
    )
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    occupied_quantity = column_property(
        select(
            func.coalesce(
                func.sum(ItemStock.quantity),
                0
            )
        )
        .where(
            ItemStock.location_id == id,
            ItemStock.is_active.is_(True)
        )
        .correlate_except(ItemStock)
        .scalar_subquery()
    )

    status = column_property(
        select(
            case(
                (
                    exists(
                        select(1).where(
                            ItemStock.location_id == id,
                            ItemStock.quantity > 0,
                            ItemStock.is_active.is_(True),
                        )
                    ),
                    "has_stock",  # hoặc "has_stock" / "có hàng"
                ),
                else_="empty",
            )
        )
        .correlate_except(ItemStock)
        .scalar_subquery()
    )

    warehouse = relationship("Warehouse", lazy="joined")
    zone = relationship("Zone", lazy="joined")
    stocks = relationship(
        "ItemStock",
        back_populates="location",
        lazy="selectin"
    )

class WarehouseMap(Base):
    __tablename__ = "warehouse_map"

    id = Column(Integer, primary_key=True, index=True)
    warehouse_id = Column(
        Integer,
        ForeignKey("warehouse.id"),
        nullable=False,
        index=True,
    )
    zone_id = Column(
        Integer,
        ForeignKey("zone.id"),
        nullable=True,
        index=True,
    )
    source = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_active = Column(Boolean, default=True, nullable=False)

    zone = relationship("Zone", lazy="joined")
    warehouse = relationship("Warehouse", lazy="joined")

    