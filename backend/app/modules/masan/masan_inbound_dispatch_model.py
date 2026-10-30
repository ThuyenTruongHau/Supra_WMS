"""Durable inbound queue and the warehouse-wide RCS send switch."""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func, text

from app.core.database import Base


class InboundDispatchControl(Base):
    __tablename__ = "inbound_dispatch_control"
    warehouse_id = Column(Integer, ForeignKey("warehouse.id"), primary_key=True)
    enabled = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    legacy_migrated = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    message = Column(Text, nullable=True)


class InboundDispatchBatch(Base):
    __tablename__ = "inbound_dispatch_batch"
    __table_args__ = (Index("uq_inbound_dispatch_open_batch", "warehouse_id", unique=True,
                           postgresql_where=text("completed_at IS NULL"), sqlite_where=text("completed_at IS NULL")),)
    id = Column(Integer, primary_key=True)
    code = Column(String(50), nullable=False, unique=True)
    warehouse_id = Column(Integer, ForeignKey("warehouse.id"), nullable=False, index=True)
    location_ids = Column(JSON, nullable=False)
    assign_robot_id = Column(String(50), nullable=True)
    sorting_persons = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class InboundDispatchCommand(Base):
    __tablename__ = "inbound_dispatch_command"
    __table_args__ = (UniqueConstraint("batch_id", "position", name="uq_inbound_dispatch_position"),)
    id = Column(Integer, primary_key=True)
    warehouse_id = Column(Integer, ForeignKey("warehouse.id"), nullable=False, index=True)
    batch_id = Column(Integer, ForeignKey("inbound_dispatch_batch.id"), nullable=True, index=True)
    # Keep the original detail identifier even when an unsent order is deleted.
    detail_id = Column(Integer, nullable=False, index=True)
    position = Column(Integer, nullable=True)
    from_location_id = Column(Integer, nullable=True)
    to_location_id = Column(Integer, nullable=True)
    assign_robot_id = Column(String(50), nullable=True)
    state = Column(String(20), nullable=False, default="pending", index=True)
    token = Column(String(36), nullable=True)
    reserved_at = Column(DateTime(timezone=True), nullable=True)
    order_id = Column(String(50), nullable=True, unique=True)
    robot_task_id = Column(Integer, ForeignKey("robot_task.id", ondelete="SET NULL"), nullable=True, unique=True)
    message = Column(Text, nullable=True)
    verified_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    verification_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
