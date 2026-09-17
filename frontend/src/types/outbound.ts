export type OutboundOrderStatus =
  | "initialize"
  | "in_progress"
  | "pre_completed"
  | "completed"
  | string;

export interface OutboundOrder {
  id: number;
  order_code: string;
  status: OutboundOrderStatus;
  note: string | null;
  created_by_id: number;
  warehouse_id: number;
  details: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface OutboundOrderListResponse {
  items: OutboundOrder[];
  total: number;
  page: number;
  page_size: number;
  summary: OrderListSummary;
}

export interface OrderListSummary {
  total: number;
  initialize: number;
  in_progress: number;
  completed: number;
}

export interface GetOutboundOrdersParams {
  warehouse_id: number;
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
}

export interface OutboundOrderLineItemCreate {
  item_id: number;
  quantity: number;
  unit_id: number;
  detail_type: string;
  details?: Record<string, unknown>;
}

export interface OutboundOrderCreateRequest {
  order_code: string;
  note?: string | null;
  warehouse_id: number;
  details?: Record<string, unknown>;
  line_items: OutboundOrderLineItemCreate[];
}

export interface OutboundOrderLineItemUpdate {
  id?: number | null;
  delete?: boolean;
  item_id?: number | null;
  quantity?: number | null;
  unit_id?: number | null;
  detail_type?: string | null;
  details?: Record<string, unknown> | null;
}

export interface OutboundOrderUpdateRequest {
  note?: string | null;
  details?: Record<string, unknown> | null;
  line_items?: OutboundOrderLineItemUpdate[];
}

export interface OutboundOrderDeleteResponse {
  order_code: string;
  status: string;
  message: string;
}

export interface OutboundOrderAllocation {
  id: number;
  outbound_order_detail_id: number;
  item_stock_id: number;
  quantity: number;
  status: string;
  from_location_id?: number | null;
  to_location_id?: number | null;
  from_location_code: string | null;
  from_location_name: string | null;
  to_location_code: string | null;
  to_location_name: string | null;
  item_id: number | null;
  sku: string | null;
  item_name: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface OutboundOrderDetail {
  id: number;
  outbound_order_id: number;
  item_id: number;
  sku: string | null;
  item_name: string | null;
  quantity: number;
  unit: string;
  unit_id: number | null;
  detail_type: string;
  status: OutboundOrderStatus;
  details: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  allocations: OutboundOrderAllocation[];
}

export interface LackedDetail {
  id: number;
  item_id: number;
  quantity: number;
  unit_id: number;
  detail_type: string;
  details: Record<string, unknown>;
  sku: string | null;
  item_name: string | null;
  unit: string | null;
  requested_quantity: number;
}

export interface DetailForCalculate {
  id: number;
  item_id: number;
  quantity: number;
  unit_id: number;
  detail_type: string;
  details?: Record<string, unknown>;
}

export interface CalculateOutboundRequest {
  warehouse_id: number;
  outbound_order_id: number;
  line_items: DetailForCalculate[];
}

export interface CalculateOutboundResponse {
  outbound_order_id: number;
  is_fully_allocated: boolean;
  lacked: LackedDetail[];
}

export interface OutboundRobotTask {
  order_id: string;
  task_path: string | null;
  task_type: "outbound" | "return";
  status: string;
  quantity: number;
  allocations: OutboundOrderAllocation[];
}

export interface AllocationOutboundTaskExecute {
  allocation_id: number;
}

export interface OutboundRobotTaskExecuteRequest {
  order_id: string;
  from_location_id: number;
  to_location_id: number;
  allocations: AllocationOutboundTaskExecute[];
}


export interface OutboundOrderSummary {
  zone_id: number
  total_orders: number
  pending_orders: number
  picking_orders: number
  completed_orders: number
  cancelled_orders: number
}

export interface IncompleteVehicleDetail {
  id: number
  outbound_order_id: number
  order_code: string
  customer_name: string
  vehicle_number: string
  carrier_name: string | null
  trip_code: string | null
  status: string
  sorting_position: string | null
  sorting_assign_mode?: 'vehicle' | 'customer' | string | null
}

export interface IncompleteVehicle {
  vehicle_number: string
  detail_count: number
  customer_count: number
  assigned_detail_count?: number
  /** none | partial | full â€” má»©c Ä‘á»™ gĂ¡n sorting trĂªn xe */
  assign_coverage?: 'none' | 'partial' | 'full' | string
  statuses: string[]
  sorting_positions: string[]
  /** Tá»•ng SL hĂ ng chÆ°a hoĂ n táº¥t trĂªn xe */
  total_quantity?: number
  details: IncompleteVehicleDetail[]
}

export interface IncompleteVehiclesResponse {
  zone_id: number
  vehicle_count: number
  vehicles: IncompleteVehicle[]
}

export interface OutboundVehicleProductLine {
  customer_name: string
  product_id: number
  product_sku: string | null
  product_name: string | null
  item_ids: number[]
  total_quantity: number
  total_pallet_quantity: number
  statuses: string[]
}

export interface OutboundVehicleProductsResponse {
  zone_id: number
  vehicle_number: string
  status: string
  products: OutboundVehicleProductLine[]
}

export interface AssignSortingPositionInput {
  zone_id: number
  sorting_position: string
  mode: 'vehicle' | 'customer'
  vehicle_number?: string | null
  customer_name?: string | null
}

export interface AssignSortingPositionResult {
  zone_id: number
  sorting_position: string
  mode: 'vehicle' | 'customer'
  updated_count: number
  detail_ids: number[]
}

export interface UnassignSortingPositionInput {
  zone_id: number
  sorting_position: string
}

export interface UnassignSortingPositionResult {
  zone_id: number
  sorting_position: string
  updated_count: number
  detail_ids: number[]
}

export interface SortingStationAssignmentDetail {
  id: number
  outbound_order_id: number
  order_code: string
  customer_name: string
  vehicle_number: string
  status: string
  sorting_position: string | null
  sorting_assign_mode?: 'vehicle' | 'customer' | string | null
}

export interface SortingStationFillLine {
  id: number
  sorting_wave_id: number
  outbound_order_id: number
  order_code: string
  customer_name: string
  vehicle_number: string | null
  product_id: number
  product_sku: string | null
  product_name: string | null
  quantity: number
}

export interface SortingStationAssignment {
  zone_id: number
  location_id: number
  location_code: string
  location_status: string
  is_assigned: boolean
  display_label: string | null
  assign_mode?: 'vehicle' | 'customer' | string | null
  details: SortingStationAssignmentDetail[]
  has_fill?: boolean
  fill_total_quantity?: number
  fill_lines?: SortingStationFillLine[]
}

export interface SortingStationFillStation {
  location_code: string
  has_fill: boolean
  fill_total_quantity: number
  summary_label: string | null
  lines: SortingStationFillLine[]
}

export interface SortingStationFillsResponse {
  zone_id: number
  sorting_wave_id: number | null
  stations: SortingStationFillStation[]
  /** NhĂ£n gĂ¡n sá»‘ xe/KH theo Ă´ â€” Clear fill khĂ´ng xĂ³a */
  assignment_labels?: Record<string, string>
}

export interface ClearSortingStationFillInput {
  zone_id: number
  sorting_position: string
}

export interface ClearSortingStationFillResult {
  zone_id: number
  sorting_position: string
  deleted_count: number
}

export interface ItemOutboundInput {
  product_id: number
  requested_quantity: number
  pallet_quantity?: number | null
  locator?: string | null
}

export interface DetailGroupInput {
  customer_name: string
  vehicle_number: string
  carrier_name?: string | null
  trip_code?: string | null
  lot_number?: string | null
  items: ItemOutboundInput[]
}

export interface CreateOutboundInput {
  zone_id: number
  detail_groups: DetailGroupInput[]
  auto_assign_sorting?: boolean
}

export interface UpdateOutboundInput {
  detail_groups?: DetailGroupInput[]
}

export interface PickOutboundItemInput {
  picked_quantity: number
}

export interface OutboundDailyReportLine {
  updated_at: string
  updated_at_display: string
  vehicle_number: string
  customer_name: string
  trip_code: string
  carrier_name: string
  item_code: string
  item_name: string
  lot: string | null
  lot_status: string
  quantity: number
  pallet_count: number
  locator: string
}

export interface OutboundDailyReport {
  zone_id: number
  report_date: string
  title: string
  subtitle: string
  lines: OutboundDailyReportLine[]
}

export interface ExecuteQrManualRequest {
  allocation_ids: number[];
  qr_code: string;
  to_location_id?: number;
}

export interface ExecuteQrManualResponse {
  allocation_ids: number[];
  qr_code: string;
  to_location_id?: number | null;
  message: string;
}
