from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_permission
from app.modules.warehouse.dashboard import dashboard_service
from app.modules.warehouse.dashboard import dashboard_trend_service
from app.modules.warehouse.dashboard import dashboard_top_products_service
from app.modules.warehouse.dashboard import dashboard_stock_aging_service
from app.modules.warehouse.dashboard.dashboard_schema import (
    ReportKpiResponse,
    ReportStockAgingBucketResponse,
    ReportStockAgingOverviewResponse,
    ReportTopProductsResponse,
    ReportTrendResponse,
    StockAgingBucketKey,
)

router = APIRouter(tags=["Dashboard"])

DbSession = Annotated[Session, Depends(get_db)]

_REPORT_KPI_READ = require_permission(
    "inbound:read",
    "outbound:read",
    "item:read",
    "notification:read",
)

_REPORT_TREND_READ = require_permission(
    "inbound:read",
    "outbound:read",
    "item:read",
)


@router.get(
    "/dashboard/report-kpis",
    response_model=ReportKpiResponse,
    dependencies=[Depends(_REPORT_KPI_READ)],
)
def get_report_kpis(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
):
    return dashboard_service.get_report_kpis(db, warehouse_id=warehouse_id)


@router.get(
    "/dashboard/report-trends",
    response_model=ReportTrendResponse,
    dependencies=[Depends(_REPORT_TREND_READ)],
)
def get_report_trends(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
    granularity: Literal["day", "week"] = Query("day"),
):
    return dashboard_trend_service.get_report_trends(
        db,
        warehouse_id=warehouse_id,
        granularity=granularity,
    )


@router.get(
    "/dashboard/report-top-products",
    response_model=ReportTopProductsResponse,
    dependencies=[Depends(_REPORT_TREND_READ)],
)
def get_report_top_products(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
    period: Literal["week", "month"] = Query("week"),
):
    return dashboard_top_products_service.get_report_top_products(
        db,
        warehouse_id=warehouse_id,
        period=period,
    )


_REPORT_STOCK_AGING_READ = require_permission("item:read")


@router.get(
    "/dashboard/report-stock-aging",
    response_model=ReportStockAgingOverviewResponse,
    dependencies=[Depends(_REPORT_STOCK_AGING_READ)],
)
def get_report_stock_aging_overview(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
):
    return dashboard_stock_aging_service.get_report_stock_aging_overview(
        db,
        warehouse_id=warehouse_id,
    )


@router.get(
    "/dashboard/report-stock-aging/bucket",
    response_model=ReportStockAgingBucketResponse,
    dependencies=[Depends(_REPORT_STOCK_AGING_READ)],
)
def get_report_stock_aging_bucket(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
    bucket: StockAgingBucketKey = Query(...),
):
    return dashboard_stock_aging_service.get_report_stock_aging_bucket(
        db,
        warehouse_id=warehouse_id,
        bucket=bucket,
    )
