from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from io import BytesIO
from typing import Literal

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.modules.robot.robot_model import RobotTask, TaskStatus
from app.modules.warehouse.dashboard.dashboard_schema import ReportKpiResponse
from app.modules.warehouse.dashboard.dashboard_snapshot_service import VN_TZ, vn_today
from app.modules.warehouse.inbound_order import inbound_order_service
from app.modules.warehouse.inbound_order.inbound_order_model import (
    InboundOrder,
    InboundOrderDetail,
)
from app.modules.warehouse.item import item_service
from app.modules.warehouse.notificcation import notification_service
from app.modules.warehouse.outbound_order import outbound_order_service
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrder,
    OutboundOrderAllocation,
    OutboundOrderDetail,
)
from app.modules.warehouse.warehouse_zone.warehouse_model import Warehouse
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists

RobotReportPeriod = Literal["day", "week"]
TaskKind = Literal["inbound", "outbound"]

_TERMINAL_ICS_STATUSES = ("3", "7", "8")

_ROBOT_REPORT_TITLE = "BÁO CÁO HIỆU SUẤT ROBOT\n(Theo task_status ICS — mã 3/7/8)"
_ROBOT_REPORT_HEADERS: tuple[str, ...] = (
    "Robot",
    "Số lệnh robot nhập",
    "Số lệnh robot xuất",
    "Số lệnh nhập hoàn thành",
    "Số lệnh xuất hoàn thành",
    "Số lệnh nhập lỗi",
    "Số lệnh xuất lỗi",
)
_ROBOT_REPORT_COLUMN_WIDTHS = (14.0, 18.0, 18.0, 22.0, 22.0, 18.0, 18.0)
_HEADER_ROW = 3
_DATA_START_ROW = 4

_TITLE_FILL = PatternFill("solid", fgColor="FFFF00")
_HEADER_FONT = Font(bold=True, size=10)
_TITLE_FONT = Font(bold=True, size=11)
_DATA_FONT = Font(size=10)
_THIN_BORDER = Border(
    left=Side(style="thin", color="000000"),
    right=Side(style="thin", color="000000"),
    top=Side(style="thin", color="000000"),
    bottom=Side(style="thin", color="000000"),
)
_CENTER_WRAP = Alignment(horizontal="center", vertical="center", wrap_text=True)
_LEFT_WRAP = Alignment(horizontal="left", vertical="center", wrap_text=True)


@dataclass(frozen=True)
class _RobotTerminalRow:
    device_num: str
    order_id: str
    task_kind: TaskKind
    ics_status: str


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


def _normalize_device_num(raw: str | None) -> str | None:
    if raw is None:
        return None
    cleaned = str(raw).strip()
    return cleaned or None


def _normalize_ics_status(raw: str | None) -> str | None:
    if raw is None:
        return None
    cleaned = str(raw).strip()
    return cleaned if cleaned in _TERMINAL_ICS_STATUSES else None


def _robot_report_period_bounds(
    period: RobotReportPeriod,
) -> tuple[datetime, datetime, str]:
    today = vn_today()
    if period == "day":
        start_date = today
        end_date = today
        label = f"Ngày {today.strftime('%d/%m/%Y')}"
    else:
        start_date = today - timedelta(days=6)
        end_date = today
        label = (
            f"Từ {start_date.strftime('%d/%m/%Y')} "
            f"đến {end_date.strftime('%d/%m/%Y')}"
        )
    start_dt = datetime.combine(start_date, time.min, tzinfo=VN_TZ)
    end_dt = datetime.combine(end_date, time.max.replace(microsecond=999999), tzinfo=VN_TZ)
    return start_dt, end_dt, label


def _query_robot_terminal_rows(
    db: Session,
    *,
    warehouse_id: int,
    start: datetime,
    end: datetime,
) -> list[_RobotTerminalRow]:
    """Terminal KPIs from task_status.status only (3/7/8), joined to robot_task for kind/warehouse."""
    raw_rows = (
        db.query(
            TaskStatus.device_num,
            TaskStatus.order_id,
            TaskStatus.status,
            TaskStatus.created_at,
            TaskStatus.id,
            RobotTask.inbound_order_detail_id,
        )
        .join(RobotTask, TaskStatus.order_id == RobotTask.order_id)
        .outerjoin(
            InboundOrderDetail,
            RobotTask.inbound_order_detail_id == InboundOrderDetail.id,
        )
        .outerjoin(
            InboundOrder,
            InboundOrderDetail.inbound_order_id == InboundOrder.id,
        )
        .outerjoin(
            OutboundOrderAllocation,
            OutboundOrderAllocation.robot_task_id == RobotTask.id,
        )
        .outerjoin(
            OutboundOrderDetail,
            OutboundOrderAllocation.outbound_order_detail_id == OutboundOrderDetail.id,
        )
        .outerjoin(
            OutboundOrder,
            OutboundOrderDetail.outbound_order_id == OutboundOrder.id,
        )
        .filter(
            TaskStatus.created_at >= start,
            TaskStatus.created_at <= end,
            TaskStatus.status.in_(_TERMINAL_ICS_STATUSES),
            or_(
                and_(
                    RobotTask.inbound_order_detail_id.isnot(None),
                    InboundOrder.warehouse_id == warehouse_id,
                ),
                and_(
                    RobotTask.inbound_order_detail_id.is_(None),
                    OutboundOrder.warehouse_id == warehouse_id,
                    OutboundOrderAllocation.allocation_type == "outbound",
                ),
            ),
        )
        .order_by(
            TaskStatus.created_at.desc(),
            TaskStatus.id.desc(),
        )
        .all()
    )

    latest_by_key: dict[tuple[str, str], _RobotTerminalRow] = {}
    for row in raw_rows:
        device_num = _normalize_device_num(row.device_num)
        order_id = (row.order_id or "").strip()
        ics_status = _normalize_ics_status(row.status)
        if not device_num or not order_id or not ics_status:
            continue

        if row.inbound_order_detail_id is not None:
            task_kind: TaskKind = "inbound"
        else:
            task_kind = "outbound"

        key = (device_num, order_id)
        if key in latest_by_key:
            continue

        latest_by_key[key] = _RobotTerminalRow(
            device_num=device_num,
            order_id=order_id,
            task_kind=task_kind,
            ics_status=ics_status,
        )

    return list(latest_by_key.values())


def _aggregate_robot_report(
    rows: list[_RobotTerminalRow],
) -> list[dict[str, str | int]]:
    buckets: dict[str, dict[str, int]] = defaultdict(
        lambda: {
            "inbound_count": 0,
            "outbound_count": 0,
            "inbound_completed": 0,
            "outbound_completed": 0,
            "inbound_error_count": 0,
            "outbound_error_count": 0,
        }
    )

    for row in rows:
        bucket = buckets[row.device_num]
        if row.task_kind == "inbound":
            bucket["inbound_count"] += 1
            if row.ics_status == "8":
                bucket["inbound_completed"] += 1
            elif row.ics_status in ("3", "7"):
                bucket["inbound_error_count"] += 1
        else:
            bucket["outbound_count"] += 1
            if row.ics_status == "8":
                bucket["outbound_completed"] += 1
            elif row.ics_status in ("3", "7"):
                bucket["outbound_error_count"] += 1

    result: list[dict[str, str | int]] = []
    for device_num in sorted(buckets.keys()):
        b = buckets[device_num]
        result.append(
            {
                "device_num": device_num,
                "inbound_count": b["inbound_count"],
                "outbound_count": b["outbound_count"],
                "inbound_completed": b["inbound_completed"],
                "outbound_completed": b["outbound_completed"],
                "inbound_error_count": b["inbound_error_count"],
                "outbound_error_count": b["outbound_error_count"],
            }
        )

    if result:
        result.append(
            {
                "device_num": "Tổng cộng",
                "inbound_count": sum(r["inbound_count"] for r in result),  # type: ignore[misc]
                "outbound_count": sum(r["outbound_count"] for r in result),  # type: ignore[misc]
                "inbound_completed": sum(r["inbound_completed"] for r in result),  # type: ignore[misc]
                "outbound_completed": sum(r["outbound_completed"] for r in result),  # type: ignore[misc]
                "inbound_error_count": sum(r["inbound_error_count"] for r in result),  # type: ignore[misc]
                "outbound_error_count": sum(r["outbound_error_count"] for r in result),  # type: ignore[misc]
            }
        )
    return result


def _build_robot_performance_workbook(
    *,
    period_label: str,
    warehouse_name: str,
    rows: list[dict[str, str | int]],
) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Robot"

    col_count = len(_ROBOT_REPORT_HEADERS)
    for col_idx in range(1, col_count + 1):
        ws.cell(row=1, column=col_idx).fill = _TITLE_FILL

    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=col_count)
    title_cell = ws.cell(row=1, column=1)
    title_cell.value = _ROBOT_REPORT_TITLE
    title_cell.font = _TITLE_FONT
    title_cell.alignment = _CENTER_WRAP
    ws.row_dimensions[1].height = 42.0

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=col_count)
    meta_cell = ws.cell(row=2, column=1)
    meta_cell.value = f"Kho: {warehouse_name} | Kỳ: {period_label}"
    meta_cell.font = Font(size=10, bold=True)
    meta_cell.alignment = _CENTER_WRAP
    ws.row_dimensions[2].height = 22.0

    for col_idx, header in enumerate(_ROBOT_REPORT_HEADERS, start=1):
        cell = ws.cell(row=_HEADER_ROW, column=col_idx, value=header)
        cell.font = _HEADER_FONT
        cell.alignment = _CENTER_WRAP
        cell.border = _THIN_BORDER
        letter = get_column_letter(col_idx)
        ws.column_dimensions[letter].width = _ROBOT_REPORT_COLUMN_WIDTHS[col_idx - 1]
    ws.row_dimensions[_HEADER_ROW].height = 28.0

    last_data_row = _DATA_START_ROW - 1
    for offset, row in enumerate(rows):
        row_idx = _DATA_START_ROW + offset
        last_data_row = row_idx
        values = [
            row["device_num"],
            row["inbound_count"],
            row["outbound_count"],
            row["inbound_completed"],
            row["outbound_completed"],
            row["inbound_error_count"],
            row["outbound_error_count"],
        ]
        for col_idx, value in enumerate(values, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.font = _DATA_FONT
            cell.border = _THIN_BORDER
            if col_idx == 1:
                cell.alignment = _LEFT_WRAP
            else:
                cell.alignment = Alignment(horizontal="right", vertical="center")
        if row["device_num"] == "Tổng cộng":
            for col_idx in range(1, col_count + 1):
                ws.cell(row=row_idx, column=col_idx).font = Font(size=10, bold=True)

    for row_idx in range(_DATA_START_ROW, last_data_row + 1):
        ws.row_dimensions[row_idx].height = 20.0

    ws.freeze_panes = ws.cell(row=_DATA_START_ROW, column=1)

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def export_robot_performance_report(
    db: Session,
    *,
    warehouse_id: int,
    period: RobotReportPeriod,
) -> tuple[bytes, str]:
    _ensure_warehouse_exists(db, warehouse_id)
    warehouse = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    warehouse_label = (
        (warehouse.code if warehouse and warehouse.code else None)
        or (warehouse.name if warehouse and warehouse.name else None)
        or str(warehouse_id)
    )
    warehouse_name = warehouse.name if warehouse and warehouse.name else warehouse_label

    start_dt, end_dt, period_label = _robot_report_period_bounds(period)
    terminal_rows = _query_robot_terminal_rows(
        db,
        warehouse_id=warehouse_id,
        start=start_dt,
        end=end_dt,
    )
    if not terminal_rows:
        raise ValueError(
            "Không có lệnh robot nào có trạng thái 3/7/8 trong kỳ đã chọn"
        )

    aggregated = _aggregate_robot_report(terminal_rows)
    content = _build_robot_performance_workbook(
        period_label=period_label,
        warehouse_name=warehouse_name,
        rows=aggregated,
    )
    period_suffix = "ngay" if period == "day" else "tuan"
    filename = (
        f"BaoCaoRobot_{warehouse_label}_{period_suffix}_"
        f"{vn_today().isoformat()}.xlsx"
    )
    return content, filename
