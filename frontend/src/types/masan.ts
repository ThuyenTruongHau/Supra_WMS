import type { InboundSuggestAllocationRequest } from "@/types/inboundOrder";
import type { OutboundRobotTask } from "@/types/outbound";

export interface MasanInboundPreviewRow {
  row_no: number;
  inbound_datetime: string | null;
  vehicle_no: string | null;
  from_warehouse: string | null;
  to_warehouse: string | null;
  delivery: string | null;
  nvt: string | null;
  sku: string;
  item_name: string | null;
  lot: string | null;
  lot_status: string | null;
  quantity: number;
  pallet_count: string | null;
  storage_location: string | null;
  from_location_id: number | null;
  from_location_name: string | null;
  locator: string | null;
  item_id: number | null;
  unit_id: number | null;
  suggest_group_index: number | null;
  error: string | null;
}

export interface MasanInboundParseResponse {
  preview_rows: MasanInboundPreviewRow[];
  suggest_allocation: InboundSuggestAllocationRequest;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  group_count: number;
  warnings: string[];
}
/** Đúng 1 trong 2: vehicle_no hoặc item_id. */
export type MasanInboundDetailFilter =
  | { vehicle_no: string; item_id?: never }
  | { item_id: number; vehicle_no?: never };

export interface MasanInboundCallerRequest {
  location_ids: number[];
  assign_robot_id?: string;
  /** Username người nhập — gán `inbound_order_detail.sorting_persons`. */
  sorting_persons?: string | null;
}

export interface MasanInboundCallerResponse {
  queued: number;
  detail_ids: number[];
  job_ids: string[];
  batch_id?: number | null;
  waiting_count?: number;
}

export interface MasanClearInboundZoneRequest {
  warehouse_id: number;
}

export interface MasanClearInboundZoneResponse {
  warehouse_id: number;
  zones: string[];
  deactivated_count: number;
}

export interface MasanClearOutboundStationCacheRequest {
  warehouse_id: number;
  cc_location_ids: number[];
}

export interface MasanClearOutboundStationCacheResponse {
  warehouse_id: number;
  assigned_cc_location: number;
  assigned_cc_details: number;
  stock_ready: number;
  orphan_details: number;
  zones_seen: string[];
}

export interface MasanOutboundPreviewRow {
  row_no: number;
  vehicle_no: string | null;
  customer_name: string | null;
  trip: string | null;
  nvt: string | null;
  sku: string;
  item_name: string | null;
  lot_number: string | null;
  lot_status: string | null;
  quantity: number;
  pallet_count: string | null;
  locator: string | null;
  item_id: number | null;
  unit_id: number | null;
  error: string | null;
}

export interface MasanOutboundParseResponse {
  preview_rows: MasanOutboundPreviewRow[];
  line_items: unknown[];
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  warnings: string[];
  can_import?: boolean;
  import_errors?: string[];
}

export interface MasanCcLocationLine {
  detail_id: number;
  outbound_order_id: number;
  item_id: number;
  quantity: number;
  unit: string | null;
  detail_type: string | null;
  vehicle_no: string | number | null;
  customer_name: string | null;
  sku: string | number | null;
  trip: string | number | null;
  nvt: string | number | null;
  lot_number: string | number | null;
  pallet_count: string | number | null;
  status?: string | null;
  /** Một detail có thể có nhiều allocation stock_ready. */
  allocation_id?: number;
}

export interface MasanCcLocationResponse {
  warehouse_id: number;
  location_id: number;
  assigned: boolean;
  location_name: string | null;
  zone: string | null;
  vehicle_number: string | null;
  lines: MasanCcLocationLine[];
}

export interface MasanSortingZoneCcLocationRow {
  location_id: number;
  location_code: string;
  location_name: string | null;
  assigned: boolean;
  zone: string | null;
  vehicle_number: string | null;
  lines: MasanCcLocationLine[];
}

export interface MasanSortingZoneCcLocationsResponse {
  warehouse_id: number;
  zone: string;
  locations: MasanSortingZoneCcLocationRow[];
}

export interface MasanPickingListSummary {
  extracted: number;
  line_count: number;
  customer_count?: number;
  assigned_location: string;
  zone: string;
  vehicle_number: string;
}

export interface MasanPickingListAvailableLine {
  detail_id: number;
  sku: string;
  item_name: string;
  customer_name: string;
  nvt: string;
  trip: string;
  quantity: number;
  unit: string;
  lot_number: string;
  extracted: number;
}

export interface MasanPickingListListResponse {
  vehicle_number: string;
  items: MasanPickingListSummary[];
  available_lines?: MasanPickingListAvailableLine[];
}

export interface MasanPickingListCreateRequest {
  warehouse_id: number;
  vehicle_no: string;
  location_id?: number | null;
  detail_ids?: number[];
}

export interface MasanSortingItemNeededRow {
  item_id: number;
  sku: string;
  item_name: string;
  total_quantity: number;
}

export interface MasanSortingItemsNeededResponse {
  warehouse_id: number;
  zone: string;
  items: MasanSortingItemNeededRow[];
  line_count: number;
}

export interface MasanSortingOutboundDispatchRequest {
  warehouse_id: number;
  zone: string;
  item_id: number;
  to_location_id: number;
}

export interface MasanSortingOutboundLackedRow {
  id: number;
  item_id: number;
  quantity: number;
  unit_id: number;
  detail_type: string;
  details: Record<string, unknown>;
  sku?: string | null;
  item_name?: string | null;
  unit?: string | null;
  requested_quantity: number;
}

export interface MasanSortingOutboundDispatchResponse {
  warehouse_id: number;
  zone: string;
  item_id: number;
  lacked: MasanSortingOutboundLackedRow[];
}

export interface MasanSortingZoneRobotTasksResponse {
  zone: string;
  tasks: OutboundRobotTask[];
}

export interface MasanSortingZoneReturnTasksResponse {
  warehouse_id: number;
  zone: string;
  rows: { outbound_order_id: number; task: OutboundRobotTask }[];
}

export interface MasanSortingZonePendingAllocationRow {
  id: number;
  outbound_order_detail_id: number;
  item_stock_id: number;
  quantity: number;
  status: string;
  allocation_type: string;
  sku?: string | null;
  robot_task_id: number | null;
  from_location_id: number | null;
  to_location_id: number | null;
  /** Nguồn: `from_location.location_name` (BE enrich) hoặc locator detail. */
  locator?: string | null;
  /** Enrich từ outbound detail (BM.04) — hiển thị modal CC. */
  outbound_order_id?: number;
  item_id?: number;
  unit?: string | null;
  detail_type?: string | null;
  vehicle_no?: string | number | null;
  customer_name?: string | null;
  trip?: string | number | null;
  nvt?: string | number | null;
  lot_number?: string | number | null;
  pallet_count?: string | number | null;
}

export interface MasanSortingZoneLocationPendingStock {
  location_id: number;
  location_name: string | null;
  allocations: MasanSortingZonePendingAllocationRow[];
}

export interface MasanSortingZonePendingStockResponse {
  warehouse_id: number;
  zone: string;
  locations: MasanSortingZoneLocationPendingStock[];
  published_events?: number;
}

export interface MasanStartSortingTimeRequest {
  allocation_ids: number[];
}

export interface MasanStartSortingTimeResponse {
  started_at: string | null;
  already_started: boolean;
}

export interface MasanConfirmAllocationOutboundRequest {
  warehouse_id: number;
  zone: string;
  quantities: Record<number, number>;
  /** Username người xuất; nhiều người nối bằng dấu phẩy. */
  sorting_persons: string;
}

export interface MasanConfirmAllocationOutboundResponse {
  warehouse_id: number;
  zone: string;
  quantities: Record<number, number>;
  allocation_statuses: Record<number, string>;
  detail_statuses: Record<number, string>;
  /** Detail đầu tiên trong batch (tương thích) */
  outbound_order_detail_id: number | null;
  detail_status: string | null;
}

/** Allocation pending-stock kèm ô CC nguồn (Redis bucket). */
export type MasanPendingAllocationWithCc =
  MasanSortingZonePendingAllocationRow & {
    ccLocationId: number;
    ccLocationName: string | null;
    ccLocationCode?: string | null;
  };
