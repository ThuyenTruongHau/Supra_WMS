import { useQuery } from "@tanstack/react-query";
import {
  getReportKpisApi,
  getReportStockAgingBucketApi,
  getReportStockAgingOverviewApi,
  getReportTopProductsApi,
  getReportTrendsApi,
} from "@/api/dashboard";
import type {
  StockAgingBucketKey,
  TopProductsPeriod,
  TrendGranularity,
} from "@/types/dashboard";
import { LIVE_QUERY_OPTIONS } from "@/utils/liveQueryOptions";

export const REPORT_KPI_POLL_INTERVAL_MS = 30_000;

export const useReportKpis = (warehouseId: number) => {
  return useQuery({
    queryKey: ["dashboard", "report-kpis", warehouseId],
    queryFn: () => getReportKpisApi(warehouseId),
    enabled: warehouseId > 0,
    refetchInterval: REPORT_KPI_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useReportTrends = (
  warehouseId: number,
  granularity: TrendGranularity,
) => {
  return useQuery({
    queryKey: ["dashboard", "report-trends", warehouseId, granularity],
    queryFn: () => getReportTrendsApi(warehouseId, granularity),
    enabled: warehouseId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useReportTopProducts = (
  warehouseId: number,
  period: TopProductsPeriod,
) => {
  return useQuery({
    queryKey: ["dashboard", "top-products", warehouseId, period],
    queryFn: () => getReportTopProductsApi(warehouseId, period),
    enabled: warehouseId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useReportStockAging = (warehouseId: number) => {
  return useQuery({
    queryKey: ["dashboard", "stock-aging", warehouseId],
    queryFn: () => getReportStockAgingOverviewApi(warehouseId),
    enabled: warehouseId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useReportStockAgingBucket = (
  warehouseId: number,
  bucket: StockAgingBucketKey | null,
) => {
  return useQuery({
    queryKey: ["dashboard", "stock-aging-bucket", warehouseId, bucket],
    queryFn: () => getReportStockAgingBucketApi(warehouseId, bucket!),
    enabled: warehouseId > 0 && bucket != null,
    ...LIVE_QUERY_OPTIONS,
  });
};
