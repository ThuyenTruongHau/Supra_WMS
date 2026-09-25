import axiosInstance from "./axiosInstance";
import type {
  ReportKpiResponse,
  ReportStockAgingBucketResponse,
  ReportStockAgingOverviewResponse,
  ReportTopProductsResponse,
  ReportTrendResponse,
  StockAgingBucketKey,
  TopProductsPeriod,
  TrendGranularity,
} from "@/types/dashboard";

const BASE = "/api/v1/dashboard";

export const getReportKpisApi = async (
  warehouseId: number,
): Promise<ReportKpiResponse> => {
  const { data } = await axiosInstance.get<ReportKpiResponse>(
    `${BASE}/report-kpis`,
    { params: { warehouse_id: warehouseId } },
  );
  return data;
};

export const getReportTrendsApi = async (
  warehouseId: number,
  granularity: TrendGranularity,
): Promise<ReportTrendResponse> => {
  const { data } = await axiosInstance.get<ReportTrendResponse>(
    `${BASE}/report-trends`,
    { params: { warehouse_id: warehouseId, granularity } },
  );
  return data;
};

export const getReportTopProductsApi = async (
  warehouseId: number,
  period: TopProductsPeriod,
): Promise<ReportTopProductsResponse> => {
  const { data } = await axiosInstance.get<ReportTopProductsResponse>(
    `${BASE}/report-top-products`,
    { params: { warehouse_id: warehouseId, period } },
  );
  return data;
};

export const getReportStockAgingOverviewApi = async (
  warehouseId: number,
): Promise<ReportStockAgingOverviewResponse> => {
  const { data } = await axiosInstance.get<ReportStockAgingOverviewResponse>(
    `${BASE}/report-stock-aging`,
    { params: { warehouse_id: warehouseId } },
  );
  return data;
};

export const getReportStockAgingBucketApi = async (
  warehouseId: number,
  bucket: StockAgingBucketKey,
): Promise<ReportStockAgingBucketResponse> => {
  const { data } = await axiosInstance.get<ReportStockAgingBucketResponse>(
    `${BASE}/report-stock-aging/bucket`,
    { params: { warehouse_id: warehouseId, bucket } },
  );
  return data;
};
