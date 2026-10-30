"""Serialize buffer edits, task creation and callbacks on their inbound detail."""
from sqlalchemy.orm import Session, lazyload

from app.modules.warehouse.inbound_order.inbound_order_model import InboundOrderDetail


def lock_inbound_detail(db: Session, detail_id: int) -> InboundOrderDetail | None:
    # Lock only the detail, not nullable sides of eager outer joins; refresh any
    # object already in this session after waiting for the previous writer.
    return (
        db.query(InboundOrderDetail).options(lazyload("*"))
        .filter(InboundOrderDetail.id == detail_id)
        .with_for_update(of=InboundOrderDetail).populate_existing().first()
    )
