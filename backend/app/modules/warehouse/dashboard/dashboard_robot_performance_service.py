"""Chart data at robot-task grain; deliberately independent of the Excel report."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from math import isfinite

from sqlalchemy import case, func, literal, select, union_all
from sqlalchemy.orm import Session

from app.modules.robot.robot_model import RobotTask, TaskStatus
from app.modules.warehouse.dashboard.dashboard_schema import (
    RobotPerformanceByRobot,
    RobotPerformanceMetrics,
    RobotPerformancePoint,
    RobotPerformanceResponse,
    RobotTaskKind,
)
from app.modules.warehouse.dashboard.dashboard_snapshot_service import VN_TZ
from app.modules.warehouse.inbound_order.inbound_order_model import (
    InboundOrder, InboundOrderDetail,
)
from app.modules.warehouse.outbound_order.outbound_order_model import (
    OutboundOrder, OutboundOrderAllocation, OutboundOrderDetail,
)
from app.modules.warehouse.warehouse_zone.warehouse_service import _ensure_warehouse_exists


def _clean_device(column):
    return func.nullif(func.trim(column), "")


def _query_tasks(db: Session, warehouse_id: int, start: datetime, end: datetime):
    # Aggregate CC allocations BEFORE joining callbacks: one row per physical task.
    a = OutboundOrderAllocation
    allocations = (
        select(
            a.robot_task_id.label("task_id"),
            case((func.max(case((a.allocation_type == "return", 1), else_=0)) == 1,
                  "return"), else_="outbound").label("kind"),
            func.max(a.distance).label("distance"),
            func.min(a.start_time).label("start_time"),
            func.max(a.end_time).label("end_time"),
            func.max(_clean_device(a.device)).label("device"),
        )
        .join(OutboundOrderDetail, a.outbound_order_detail_id == OutboundOrderDetail.id)
        .join(OutboundOrder, OutboundOrderDetail.outbound_order_id == OutboundOrder.id)
        .where(OutboundOrder.warehouse_id == warehouse_id,
               a.robot_task_id.isnot(None), a.allocation_type.in_(("outbound", "return")))
        .group_by(a.robot_task_id)
        .subquery()
    )
    d = InboundOrderDetail
    inbound = (
        select(
            RobotTask.id.label("task_id"), RobotTask.order_id,
            literal("inbound").label("kind"), d.distance, d.start_time, d.end_time,
            _clean_device(d.device).label("device"),
        )
        .join(d, RobotTask.inbound_order_detail_id == d.id)
        .join(InboundOrder, d.inbound_order_id == InboundOrder.id)
        .where(InboundOrder.warehouse_id == warehouse_id)
    )
    outbound = (
        select(
            RobotTask.id.label("task_id"), RobotTask.order_id,
            allocations.c.kind, allocations.c.distance,
            allocations.c.start_time, allocations.c.end_time, allocations.c.device,
        )
        .join(allocations, allocations.c.task_id == RobotTask.id)
        .where(RobotTask.inbound_order_detail_id.is_(None))
    )
    tasks = union_all(inbound, outbound).cte("warehouse_robot_tasks")
    terminal = (
        select(
            TaskStatus.order_id, TaskStatus.status, TaskStatus.created_at,
            _clean_device(TaskStatus.device_num).label("device"),
            func.row_number().over(
                partition_by=TaskStatus.order_id,
                order_by=(TaskStatus.created_at.desc(), TaskStatus.id.desc()),
            ).label("rank"),
        )
        .where(TaskStatus.order_id.in_(select(tasks.c.order_id)), TaskStatus.created_at < end,
               TaskStatus.status.in_(("3", "7", "8")))
        .subquery()
    )
    device_history = (
        select(
            TaskStatus.order_id, _clean_device(TaskStatus.device_num).label("device"),
            func.row_number().over(
                partition_by=TaskStatus.order_id,
                order_by=(TaskStatus.created_at.desc(), TaskStatus.id.desc()),
            ).label("rank"),
        )
        .where(TaskStatus.order_id.in_(select(tasks.c.order_id)),
               TaskStatus.created_at < end, _clean_device(TaskStatus.device_num).isnot(None))
        .subquery()
    )
    return db.execute(
        select(
            tasks.c.task_id, tasks.c.kind, tasks.c.distance,
            tasks.c.start_time, tasks.c.end_time,
            terminal.c.status, terminal.c.created_at,
            func.coalesce(terminal.c.device, device_history.c.device, tasks.c.device)
            .label("device_num"),
        )
        .join(terminal, (terminal.c.order_id == tasks.c.order_id) & (terminal.c.rank == 1))
        .outerjoin(device_history, (device_history.c.order_id == tasks.c.order_id)
                   & (device_history.c.rank == 1))
        .where(terminal.c.created_at >= start)
    ).mappings().all()


def _vn_datetime(value: datetime) -> datetime:
    # Naive callback timestamps in the legacy app represent local warehouse time.
    return value.replace(tzinfo=VN_TZ) if value.tzinfo is None else value.astimezone(VN_TZ)


def _metrics(rows) -> RobotPerformanceMetrics:
    result = RobotPerformanceMetrics()
    for row in rows:
        if row["status"] == "7":
            result.failed_count += 1
            continue
        if row["status"] == "3":
            result.cancelled_count += 1
            continue
        result.completed_count += 1
        kind_count = f"{row['kind']}_completed"
        setattr(result, kind_count, getattr(result, kind_count) + 1)
        distance = row["distance"]
        if distance is None or not isfinite(distance) or distance < 0:
            continue
        result.distance_count += 1
        result.distance_m = (result.distance_m or 0) + distance
        kind_distance = f"{row['kind']}_distance_m"
        setattr(result, kind_distance, (getattr(result, kind_distance) or 0) + distance)
        if row["start_time"] is None or row["end_time"] is None:
            continue
        seconds = (_vn_datetime(row["end_time"]) - _vn_datetime(row["start_time"])).total_seconds()
        if seconds <= 0:
            continue
        result.duration_seconds += seconds
        result.speed_distance_m += distance
        result.speed_eligible_count += 1
    if result.speed_eligible_count:
        result.average_speed_mps = result.speed_distance_m / result.duration_seconds
    if result.completed_count:
        result.speed_coverage_percent = 100 * result.speed_eligible_count / result.completed_count
    return result


def _by_robot(rows) -> list[RobotPerformanceByRobot]:
    groups = defaultdict(list)
    for row in rows:
        groups[row["device_num"]].append(row)
    return [
        RobotPerformanceByRobot(device_num=device, **_metrics(groups[device]).model_dump())
        for device in sorted(groups, key=lambda value: (value is None, value or ""))
    ]


def get_robot_performance(
    db: Session, *, warehouse_id: int, start_date: date, end_date: date,
    device_num: str | None = None, task_kind: RobotTaskKind | None = None,
) -> RobotPerformanceResponse:
    if start_date > end_date:
        raise ValueError("Ngày bắt đầu không được sau ngày kết thúc")
    if end_date == date.max:
        raise ValueError("Ngày kết thúc vượt quá phạm vi hỗ trợ")
    _ensure_warehouse_exists(db, warehouse_id)
    start = datetime.combine(start_date, time.min, tzinfo=VN_TZ)
    end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=VN_TZ)
    rows = _query_tasks(db, warehouse_id, start, end)
    # Options stay available when a robot filter is active.
    if task_kind is not None:
        rows = [row for row in rows if row["kind"] == task_kind]
    devices = sorted({row["device_num"] for row in rows if row["device_num"] is not None})
    if device_num is not None:
        rows = [row for row in rows if row["device_num"] == device_num.strip()]
    hourly = start_date == end_date
    groups = defaultdict(list)
    for row in rows:
        at = _vn_datetime(row["created_at"])
        key = at.replace(minute=0, second=0, microsecond=0)
        if not hourly:
            key = key.replace(hour=0)
        groups[key].append(row)
    points = []
    cursor = start
    step = timedelta(hours=1) if hourly else timedelta(days=1)
    while cursor < end:
        bucket = groups[cursor]
        points.append(RobotPerformancePoint(
            period_start=cursor, label=cursor.strftime("%H:%M" if hourly else "%d/%m/%Y"),
            robots=_by_robot(bucket), **_metrics(bucket).model_dump(),
        ))
        cursor += step
    return RobotPerformanceResponse(
        start_date=start_date, end_date=end_date, granularity="hour" if hourly else "day",
        devices=devices, summary=_metrics(rows), robots=_by_robot(rows), points=points,
    )
