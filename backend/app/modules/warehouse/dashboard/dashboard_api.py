from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.modules.warehouse.dashboard import dashboard_service
from app.modules.warehouse.dashboard import dashboard_trend_service
from app.modules.warehouse.dashboard import dashboard_top_products_service
from app.modules.warehouse.dashboard import dashboard_stock_aging_service
from app.modules.warehouse.dashboard import dashboard_robot_performance_service
from app.modules.warehouse.dashboard.dashboard_schema import (
    ReportKpiResponse,
    ReportStockAgingBucketResponse,
    ReportStockAgingOverviewResponse,
    ReportTopProductsResponse,
    ReportTrendResponse,
    StockAgingBucketKey,
    RobotPerformanceResponse,
    RobotTaskKind,
)

router = APIRouter(tags=["Dashboard"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get(
    "/dashboard/report-kpis",
    response_model=ReportKpiResponse,
    dependencies=[Depends(get_current_user)],
)
def get_report_kpis(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
):
    return dashboard_service.get_report_kpis(db, warehouse_id=warehouse_id)


@router.get(
    "/dashboard/report-robot-performance",
    response_model=RobotPerformanceResponse,
    dependencies=[Depends(get_current_user)],
)
def get_report_robot_performance(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
    start_date: date = Query(...),
    end_date: date = Query(...),
    device_num: str | None = Query(None, min_length=1, max_length=50),
    task_kind: RobotTaskKind | None = Query(None),
):
    try:
        return dashboard_robot_performance_service.get_robot_performance(
            db, warehouse_id=warehouse_id, start_date=start_date, end_date=end_date,
            device_num=device_num, task_kind=task_kind,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get(
    "/dashboard/report-robot-performance/export",
    dependencies=[Depends(get_current_user)],
)
def export_report_robot_performance(
    db: DbSession,
    warehouse_id: int = Query(..., gt=0),
    period: Literal["day", "week", "timeline"] = Query("day"),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
):
    try:
        content, filename = dashboard_service.export_robot_performance_report(
            db,
            warehouse_id=warehouse_id,
            period=period,
            start_date=start_date,
            end_date=end_date,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get(
    "/dashboard/report-trends",
    response_model=ReportTrendResponse,
    dependencies=[Depends(get_current_user)],
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
    dependencies=[Depends(get_current_user)],
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


@router.get(
    "/dashboard/report-stock-aging",
    response_model=ReportStockAgingOverviewResponse,
    dependencies=[Depends(get_current_user)],
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
    dependencies=[Depends(get_current_user)],
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
