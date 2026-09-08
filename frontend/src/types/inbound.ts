import { randomHex } from '@/utils/randomId'

export type InboundOrderStatus =
  | 'pending'
  | 'receiving'
  | 'completed'
  | 'cancelled'

export type InboundDetailStatus = 'pending' | 'partial' | 'completed'

export interface InboundOrderDetail {
  id: number
  product_id: number
  product_sku: string | null
  product_name: string | null
  product_lot: string | null
  expected_quantity: number
  base_unit: string
  lot_number: string | null
  pallet_quantity: number | null
  event_datetime: string | null
  customer_import_time: string | null
  vehicle_number: string | null
  export_warehouse: string | null
  import_warehouse: string | null
  delivery_code: string | null
  carrier_name: string | null
  assigned_location_id: number | null
  location_code: string | null
  location_row: string | null
  location_column: string | null
  location_bin: string | null
  pickup_node_id: number | null
  pickup_node_name: string | null
  pickup_node_qr_code: string | null
  status: InboundDetailStatus
}

export interface InboundOrder {
  id: number
  order_code: string
  status: InboundOrderStatus
  zone_id: number
  created_by: number
  created_by_name: string | null
  created_at: string
  updated_at: string
  details: InboundOrderDetail[]
}

export interface InboundOrderSummary {
  zone_id: number
  total_orders: number
  pending_orders: number
  receiving_orders: number
  completed_orders: number
  cancelled_orders: number
}

/** Response mở rộng của GET /oldest-incomplete */
export interface InboundOldestIncomplete {
  order: InboundOrder
  supplier_name: string | null
  waiting_vehicles_count: number
  today_quantity: number
  empty_locators_count: number
  empty_locators_total: number
  total_quantity: number
  total_pallet_count: number
  scada_latency_seconds: number
}

export interface InboundVehicleItem {
  vehicle_number: string
  pending_line_count: number
  pending_quantity: number
}

export interface InboundVehiclesResponse {
  order_id: number
  vehicles: InboundVehicleItem[]
}

export interface InboundVehicleGroup {
  vehicle_number: string
  line_count: number
  total_quantity: number
  total_pallet_quantity: number
  details: InboundOrderDetail[]
}

export interface InboundOrderByVehicleResponse {
  order_id: number
  vehicles: InboundVehicleGroup[]
}

/** Xe chưa hoàn tất trên đơn nhập — board operator (giống incomplete-vehicles xuất). */
export interface InboundIncompleteVehicle {
  vehicle_number: string
  detail_count: number
  product_count: number
  pending_detail_count: number
  assigned_detail_count: number
  /** none | partial | full — theo mức gán buffer */
  assign_coverage: 'none' | 'partial' | 'full' | string
  statuses: string[]
  pickup_positions: string[]
  total_quantity: number
}

export interface InboundIncompleteVehiclesResponse {
  order_id: number
  vehicle_count: number
  vehicles: InboundIncompleteVehicle[]
}

export interface InboundAssignedDetail {
  detail_id: number
  vehicle_number: string | null
  product_sku: string | null
  product_name: string | null
  lot_number: string | null
  expected_quantity: number
  event_date: string | null
  status: string
  pickup_node_name: string | null
  pickup_node_code: string | null
  location_code?: string | null
  location_bin?: string | null
}

export interface InboundAssignedDetailsResponse {
  order_id: number
  details: InboundAssignedDetail[]
}

export interface InboundBufferSlotLegend {
  occupied_count: number
  empty_count: number
  total: number
}

export interface InboundGoodsStatusLegend {
  pending_count: number
  partial_count: number
  completed_count: number
  total: number
}

export interface InboundOperatorBoardSummary {
  order_id: number
  zone_id: number
  buffer_slots: InboundBufferSlotLegend
  goods_status: InboundGoodsStatusLegend
}

export interface InboundVehicleProductItem {
  product_id: number
  product_sku: string | null
  product_name: string | null
  detail_ids: number[]
  total_quantity: number
  total_pallet_quantity: number
  line_count: number
  statuses: string[]
}

export interface InboundVehicleProductsResponse {
  order_id: number
  vehicle_number: string
  status: string
  products: InboundVehicleProductItem[]
}

export interface InboundVehicleDetailLine {
  detail_id: number
  product_id: number
  product_sku: string | null
  product_name: string | null
  expected_quantity: number
  pallet_quantity: number | null
  lot_number: string | null
  status: string
  vehicle_number: string | null
  delivery_code: string | null
}

export interface InboundVehicleDetailsResponse {
  order_id: number
  vehicle_number: string
  product_id: number
  details: InboundVehicleDetailLine[]
}

export interface AssignInboundToBufferInput {
  location_id: number
  detail_id: number
}

export interface UnassignInboundFromBufferInput {
  location_id: number
  detail_id: number
}

export interface InboundBufferAssignmentDetail {
  detail_id: number
  product_id: number
  product_sku: string | null
  product_name: string | null
  expected_quantity: number
  status: string
  vehicle_number: string | null
}

export interface InboundBufferAssignment {
  location_id: number
  location_code: string
  is_assigned: boolean
  inbound_order_id: number | null
  order_code: string | null
  details: InboundBufferAssignmentDetail[]
}

export interface DirectOutboundFromInboundInput {
  zone_id: number
  inbound_location_id: number
  outbound_location_id: number
  inbound_order_id: number
  inbound_detail_id: number
  sorting_wave_id: number
  item_outbound_ids: number[]
  quantity?: number | null
}

export interface DirectOutboundAllocation {
  item_outbound_id: number
  outbound_order_id: number
  quantity: number
}

export interface DirectOutboundFromInboundResult {
  zone_id: number
  command_id: number
  inbound_order_id: number
  inbound_location_id: number
  inbound_location_code: string
  outbound_location_id: number
  outbound_location_code: string
  product_id: number
  quantity: number
  applied_quantity: number
  surplus_quantity: number
  return_task_id: number | null
  inbound_detail_id: number
  inbound_detail_status: string
  allocations: DirectOutboundAllocation[]
}

export interface InboundDetailInput {
  product_id: number
  expected_quantity: number
  lot_number?: string | null
  pallet_quantity?: number | null
  assigned_location_id?: number | null
  event_datetime?: string | null
  customer_import_time?: string | null
  vehicle_number?: string | null
  export_warehouse?: string | null
  import_warehouse?: string | null
  delivery_code?: string | null
  carrier_name?: string | null
}

export interface CreateInboundInput {
  zone_id: number
  details: InboundDetailInput[]
}

export interface UpdateInboundInput {
  details?: InboundDetailInput[]
}

export interface SendInboundCommandInput {
  assigned_location_id?: number | null
  pickup_node_id?: number | null
}

export interface SendInboundCommandsInput {
  detail_ids: number[]
}

/** @deprecated Use SendInboundCommandInput */
export type ReceiveInboundDetailInput = SendInboundCommandInput

export interface UpdateInboundDetailPickupInput {
  pickup_node_id: number
}

export function hasAnyInboundDetailExecuted(details: InboundOrderDetail[]): boolean {
  return details.some((detail) => detail.status === 'completed')
}

const ORDER_CODE_UUID_LEN = 8

export function previewInboundOrderCode(at = new Date()): string {
  const uuid = randomHex(ORDER_CODE_UUID_LEN)
  const createdAt = [
    at.getUTCFullYear(),
    String(at.getUTCMonth() + 1).padStart(2, '0'),
    String(at.getUTCDate()).padStart(2, '0'),
    String(at.getUTCHours()).padStart(2, '0'),
    String(at.getUTCMinutes()).padStart(2, '0'),
    String(at.getUTCSeconds()).padStart(2, '0'),
  ].join('')
  return `${uuid}_${createdAt}`
}

export type InboundExcelTemplate = 'legacy' | 'daily_report'

export interface InboundDetailReportLine {
  stt: number
  item_code: string
  item_name: string
  lot: string | null
  lot_status: string
  quantity: number
  pallet_count: number
  locator: string
  status: string
  status_display: string
}

export interface InboundDetailReport {
  order_id: number
  order_code: string
  title: string
  subtitle: string
  lines: InboundDetailReportLine[]
}

export interface InboundDailyReportLine {
  customer_import_time: string | null
  customer_import_time_display: string
  vehicle_number: string
  export_warehouse: string
  import_warehouse: string
  delivery_code: string
  carrier_name: string
  item_code: string
  item_name: string
  lot: string | null
  lot_status: string
  quantity: number
  pallet_count: number
  locator: string
  status: string
  status_display: string
}

export interface InboundDailyReport {
  zone_id: number
  report_date: string
  title: string
  subtitle: string
  lines: InboundDailyReportLine[]
}
