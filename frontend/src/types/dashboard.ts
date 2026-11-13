export interface ReportKpiResponse {
  total_inbound_orders: number;
  total_outbound_orders: number;
  total_inventory_value: number | string;
  unsolved_notifications: number;
}

export type TrendGranularity = "week" | "month" | "quarter" | "year";

export interface ReportTrendPoint {
  label: string;
  period_start: string;
  period_end: string;
  inbound_quantity: number;
  outbound_quantity: number;
  inventory_quantity: number | string;
  inventory_value: number | string;
}

export interface ReportTrendResponse {
  granularity: TrendGranularity;
  points: ReportTrendPoint[];
}

export type TopProductsPeriod = "week" | "month" | "three_months";
export type TopProductsLimit = 5 | 10 | 15;

export interface TopProductRow {
  item_id: number;
  label: string;
  total_quantity: number;
  sku?: string | null;
  name?: string | null;
}

export interface ReportTopProductsResponse {
  period: TopProductsPeriod;
  limit: TopProductsLimit;
  inbound_top: TopProductRow[];
  outbound_top: TopProductRow[];
  stock_top: TopProductRow[];
}

export type StockAgingBucketKey = "lte_90" | "days_91_180" | "days_181_360" | "gt_360";

export interface StockAgingBucketSummary {
  key: StockAgingBucketKey;
  label: string;
  total_quantity: number | string;
  percent: number;
}

export interface StockAgingRow {
  item_stock_id: number;
  sku: string;
  quantity: number | string;
  lot: string | null;
  created_at: string;
  holding_days: number;
}

export interface ReportStockAgingOverviewResponse {
  buckets: StockAgingBucketSummary[];
  longest_holding: StockAgingRow[];
}

export interface ReportStockAgingBucketResponse {
  bucket: StockAgingBucketKey;
  items: StockAgingRow[];
}
