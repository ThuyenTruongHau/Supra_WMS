from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.modules.warehouse.dashboard.dashboard_trend_periods import TrendGranularity

StockAgingBucketKey = Literal["lte_90", "days_91_180", "days_181_360", "gt_360"]
TopProductsPeriod = Literal["week", "month", "three_months"]
TopProductsLimit = Literal[5, 10, 15]


class ReportKpiResponse(BaseModel):
    total_inbound_orders: int
    total_outbound_orders: int
    total_inventory_value: Decimal
    unsolved_notifications: int


class ReportTrendPoint(BaseModel):
    label: str
    period_start: date
    period_end: date
    inbound_quantity: int
    outbound_quantity: int
    inventory_quantity: Decimal
    inventory_value: Decimal


class ReportTrendResponse(BaseModel):
    granularity: TrendGranularity
    points: list[ReportTrendPoint]


class TopProductRow(BaseModel):
    item_id: int
    label: str
    total_quantity: int
    sku: str | None = None
    name: str | None = None


class ReportTopProductsResponse(BaseModel):
    period: TopProductsPeriod
    limit: TopProductsLimit = 5
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
