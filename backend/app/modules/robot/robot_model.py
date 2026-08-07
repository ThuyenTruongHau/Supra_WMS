"""Robot task model for inbound/outbound order automation."""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import foreign, relationship

from app.core.database import Base


class RobotTask(Base):
    """Store robot task data for inbound and outbound orders."""

    __tablename__ = "robot_task"

    id = Column(Integer, primary_key=True, index=True)
    inbound_order_detail_id = Column(
        Integer,
        ForeignKey("inbound_order_detail.id"),
        nullable=True,
        index=True,
    )
    outbound_order_detail_id = Column(
        Integer,
        ForeignKey("outbound_order_detail.id"),
        nullable=True,
        index=True,
    )
    # Parent order id (inbound_order.id or outbound_order.id); no single FK table.
    order_id = Column(String(50), nullable=False, index=True)
    process_code = Column(String(50), nullable=False)
    system_code = Column(String(50), nullable=False)
    task_order_detail = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    inbound_order_detail = relationship(
        "InboundOrderDetail",
        foreign_keys=[inbound_order_detail_id],
        lazy="joined",
    )
    outbound_order_detail = relationship(
        "OutboundOrderDetail",
        foreign_keys=[outbound_order_detail_id],
        lazy="joined",
    )

    task_statuses = relationship(
        "TaskStatus",
        primaryjoin="RobotTask.order_id == foreign(TaskStatus.order_id)",
        viewonly=True,
    )

class TaskStatus(Base):

    __tablename__ = "task_status"

    id = Column(Integer, primary_key=True, index=True)
    sub_task_status = Column(String(50), nullable=True)
    order_id = Column(String(50), nullable=True, index=True)
    device_code = Column(String(50), nullable=True)
    device_num = Column(String(50), nullable=True)
    qr_code = Column(String(255), nullable=True)
    shelf_number = Column(String(50), nullable=True)
    status = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    robot_tasks = relationship(
        "RobotTask",
        primaryjoin="TaskStatus.order_id == foreign(RobotTask.order_id)",
        viewonly=True,
    )