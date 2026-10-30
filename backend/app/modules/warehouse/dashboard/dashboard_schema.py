from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

StockAgingBucketKey = Literal["lte_30", "days_31_60", "gt_60"]
RobotTaskKind = Literal["inbound", "outbound", "return"]


class RobotPerformanceMetrics(BaseModel):
    inbound_completed: int = 0
    outbound_completed: int = 0
    return_completed: int = 0
    completed_count: int = 0
    failed_count: int = 0
    cancelled_count: int = 0
    distance_m: float | None = None
    inbound_distance_m: float | None = None
    outbound_distance_m: float | None = None
    return_distance_m: float | None = None
    distance_count: int = 0
    duration_seconds: float = 0
    speed_distance_m: float = 0
    speed_eligible_count: int = 0
    average_speed_mps: float | None = None
    speed_coverage_percent: float | None = None


class RobotPerformanceByRobot(RobotPerformanceMetrics):
    device_num: str | None


class RobotPerformancePoint(RobotPerformanceMetrics):
    period_start: datetime
    label: str
    robots: list[RobotPerformanceByRobot]


class RobotPerformanceResponse(BaseModel):
    start_date: date
    end_date: date
    timezone: str = "Asia/Ho_Chi_Minh"
    granularity: Literal["hour", "day"]
    devices: list[str]
    summary: RobotPerformanceMetrics
    robots: list[RobotPerformanceByRobot]
    points: list[RobotPerformancePoint]


class ReportKpiResponse(BaseModel):
    total_inbound_orders: int
    total_outbound_orders: int
    total_inventory_value: Decimal
    unsolved_notifications: int


class ReportTrendPoint(BaseModel):
    label: str
    period_start: date
    period_end: date
    inbound_orders: int
    outbound_orders: int
    inventory_quantity: Decimal
    inventory_value: Decimal


class ReportTrendResponse(BaseModel):
    granularity: Literal["day", "week"]
    points: list[ReportTrendPoint]


class TopProductRow(BaseModel):
    item_id: int
    label: str
    total_quantity: int


class ReportTopProductsResponse(BaseModel):
    period: Literal["week", "month"]
    inbound_top: list[TopProductRow]
    outbound_top: list[TopProductRow]
    stock_top: list[TopProductRow]


class StockAgingBucketSummary(BaseModel):
    key: StockAgingBucketKey
    label: str
    total_quantity: Decimal
    percent: float


class StockAgingRow(BaseModel):
    item_stock_id: int
    sku: str
    quantity: Decimal
    lot: str | None
    created_at: datetime
    holding_days: int


class ReportStockAgingOverviewResponse(BaseModel):
    buckets: list[StockAgingBucketSummary]
    longest_holding: list[StockAgingRow]


class ReportStockAgingBucketResponse(BaseModel):
    bucket: StockAgingBucketKey
    items: list[StockAgingRow]
