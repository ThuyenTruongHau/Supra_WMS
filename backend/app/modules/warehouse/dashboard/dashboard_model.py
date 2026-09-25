from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    UniqueConstraint,
    func,
)

from app.core.database import Base


class InventoryDailySnapshot(Base):
    __tablename__ = "inventory_daily_snapshot"
    __table_args__ = (
        UniqueConstraint(
            "warehouse_id",
            "snapshot_date",
            name="uq_inventory_daily_snapshot_wh_date",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    warehouse_id = Column(
        Integer, ForeignKey("warehouse.id"), nullable=False, index=True
    )
    snapshot_date = Column(Date, nullable=False)
    total_quantity = Column(Numeric(20, 4), nullable=False, server_default="0")
    total_inventory_value = Column(Numeric(20, 2), nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
