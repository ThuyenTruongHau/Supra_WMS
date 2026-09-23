from sqlalchemy.orm import Session

from app.modules.warehouse.dashboard.dashboard_schema import ReportKpiResponse
from app.modules.warehouse.inbound_order import inbound_order_service
from app.modules.warehouse.item import item_service
from app.modules.warehouse.notificcation import notification_service
from app.modules.warehouse.outbound_order import outbound_order_service
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists


def get_report_kpis(db: Session, *, warehouse_id: int) -> ReportKpiResponse:
    _ensure_warehouse_exists(db, warehouse_id)
    return ReportKpiResponse(
        total_inbound_orders=inbound_order_service.count_inbound_orders(
            db, warehouse_id
        ),
        total_outbound_orders=outbound_order_service.count_outbound_orders(
            db, warehouse_id
        ),
        total_inventory_value=item_service.compute_total_inventory_value(
            db, warehouse_id
        ),
        unsolved_notifications=notification_service.count_unsolved_notifications(
            db, warehouse_id
        ),
    )
