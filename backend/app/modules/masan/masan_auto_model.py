"""Durable zone switches, VT cycles and ICS submission records."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, func, text

from app.core.database import Base


class OutboundAutoZone(Base):
    __tablename__ = "outbound_auto_zone"
    __table_args__ = (UniqueConstraint("warehouse_id", "display_zone_id", name="uq_auto_zone"),)

    id = Column(Integer, primary_key=True)
    warehouse_id = Column(Integer, ForeignKey("warehouse.id"), nullable=False, index=True)
    display_zone_id = Column(Integer, nullable=False)
    enabled = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    state = Column(String(20), nullable=False, default="stopped", server_default="stopped")
    message = Column(Text, nullable=True)
    next_pair = Column(Integer, nullable=False, default=0, server_default="0")
    started_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class OutboundAutoCycle(Base):
    __tablename__ = "outbound_auto_cycle"
    __table_args__ = (
        Index("uq_auto_active_vt", "vt_location_id", unique=True,
              postgresql_where=text("completed_at IS NULL"), sqlite_where=text("completed_at IS NULL")),
    )

    id = Column(Integer, primary_key=True)
    zone_id = Column(Integer, ForeignKey("outbound_auto_zone.id"), nullable=False, index=True)
    vt_location_id = Column(Integer, ForeignKey("location.id"), nullable=False)
    source_location_id = Column(Integer, ForeignKey("location.id"), nullable=False)
    phase = Column(String(30), nullable=False, default="supplying")
    execution_mode = Column(String(24), nullable=False, default="native", server_default="native")
    stock_ids = Column(JSON, nullable=False, default=list)
    allocation_ids = Column(JSON, nullable=False, default=list)
    cc_assignments = Column(JSON, nullable=False, default=dict)
    pick_task_id = Column(Integer, ForeignKey("robot_task.id"), nullable=True, unique=True)
    return_task_id = Column(Integer, ForeignKey("robot_task.id"), nullable=True, unique=True)
    message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    cache_pending = Column(Boolean, nullable=False, default=True, server_default=text("true"))
    completed_at = Column(DateTime(timezone=True), nullable=True)


class OutboundAutoCommand(Base):
    __tablename__ = "outbound_auto_command"
    __table_args__ = (UniqueConstraint("cycle_id", "kind", name="uq_auto_cycle_command"),)

    id = Column(Integer, primary_key=True)
    cycle_id = Column(Integer, ForeignKey("outbound_auto_cycle.id"), nullable=True, index=True)
    robot_task_id = Column(Integer, ForeignKey("robot_task.id"), nullable=False, unique=True)
    kind = Column(String(10), nullable=False)
    state = Column(String(20), nullable=False, default="prepared")
    error = Column(Text, nullable=True)
    verified_unsent_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    verified_unsent_at = Column(DateTime(timezone=True), nullable=True)
    verification_note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
