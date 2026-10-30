export interface ReportKpiResponse {
  total_inbound_orders: number;
  total_outbound_orders: number;
  total_inventory_value: number | string;
  unsolved_notifications: number;
}

export type RobotTaskKind = 'inbound' | 'outbound' | 'return';

export interface RobotPerformanceFilters {
  start_date: string;
  end_date: string;
  device_num?: string;
  task_kind?: RobotTaskKind;
}

export interface RobotPerformanceMetrics {
  inbound_completed: number;
  outbound_completed: number;
  return_completed: number;
  completed_count: number;
  failed_count: number;
  cancelled_count: number;
  distance_m: number | null;
  inbound_distance_m: number | null;
  outbound_distance_m: number | null;
  return_distance_m: number | null;
  distance_count: number;
  duration_seconds: number;
  speed_distance_m: number;
  speed_eligible_count: number;
  average_speed_mps: number | null;
  speed_coverage_percent: number | null;
}

export interface RobotPerformanceByRobot extends RobotPerformanceMetrics {
  device_num: string | null;
}

export interface RobotPerformancePoint extends RobotPerformanceMetrics {
  period_start: string;
  label: string;
  robots: RobotPerformanceByRobot[];
}

export interface RobotPerformanceResponse {
  start_date: string;
  end_date: string;
  timezone: string;
  granularity: 'hour' | 'day';
  devices: string[];
  summary: RobotPerformanceMetrics;
  robots: RobotPerformanceByRobot[];
  points: RobotPerformancePoint[];
}

export type TrendGranularity = "day" | "week";

export interface ReportTrendPoint {
  label: string;
  period_start: string;
  period_end: string;
  inbound_orders: number;
  outbound_orders: number;
  inventory_quantity: number | string;
  inventory_value: number | string;
}

export interface ReportTrendResponse {
  granularity: TrendGranularity;
  points: ReportTrendPoint[];
}

export type TopProductsPeriod = "week" | "month";

export interface TopProductRow {
  item_id: number;
  label: string;
  total_quantity: number;
}

export interface ReportTopProductsResponse {
  period: TopProductsPeriod;
  inbound_top: TopProductRow[];
  outbound_top: TopProductRow[];
  stock_top: TopProductRow[];
}

export type StockAgingBucketKey = "lte_30" | "days_31_60" | "gt_60";

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
