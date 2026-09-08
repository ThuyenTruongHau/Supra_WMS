export type OutboundTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type OutboundTaskType = 'pick' | 'return'

export const OUTBOUND_TASK_STATUS_LABELS: Record<OutboundTaskStatus, string> = {
  pending: 'Chờ xử lý',
  in_progress: 'Đang xử lý',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

export const OUTBOUND_TASK_TYPE_LABELS: Record<OutboundTaskType, string> = {
  pick: 'Lấy hàng',
  return: 'Trả hàng',
}

export interface OutboundTask {
  id: number
  sorting_wave_id: number
  product_id: number
  product_sku: string | null
  product_name: string | null
  outbound_order_id: number
  outbound_order_code: string | null
  location_id: number | null
  location_code: string | null
  quantity: number
  type: OutboundTaskType
  node_id: number | null
  node_name: string | null
  node_qr_code: string | null
  status: OutboundTaskStatus
  created_at: string
  updated_at: string
}

export interface CurrentOrderVehicle {
  vehicle_number: string
  total_quantity: number
  remaining_quantity: number
  picked_quantity: number
  percent: number
  customer_count: number
  order_codes: string[]
  order_ids: number[]
}

export interface CurrentOrdersResponse {
  zone_id: number
  sorting_wave_id: number
  vehicles: CurrentOrderVehicle[]
}

export interface SortingWaveCustomer {
  id: number
  sorting_wave_id: number
  outbound_order_detail_id: number
  zone_id: number
  customer_name: string | null
  vehicle_number: string | null
  outbound_order_code: string | null
  task_count: number
  created_at: string
}

export interface AssignCustomerToWaveInput {
  sorting_wave_id: number
  outbound_order_detail_id: number
}

export interface AssignCustomerToWaveResult {
  wave_customer: SortingWaveCustomer
  tasks: OutboundTask[]
}

export interface UpdateOutboundTaskInput {
  node_id: number | null
}

export interface SendOutboundTaskCommandInput {
  node_id?: number | null
}

export interface SendOutboundTaskCommandsInput {
  task_ids: number[]
  node_id?: number | null
}

export interface SendOutboundTaskCommandsResult {
  sent_count: number
  tasks: OutboundTask[]
}

export interface CustomerOption {
  detailId: number
  orderId: number
  orderCode: string
  customerName: string
  vehicleNumber: string
  pendingItemCount: number
  totalPallets: number
}

/** Station pick wizard — bước 1: gom hàng theo sorting stations */
export interface StationCustomerLine {
  customer_name: string
  vehicle_number: string
  sorting_position: string
  assign_mode: string | null
}

export interface StationProductByCustomer {
  customer_name: string
  quantity: number
  item_outbound_ids: number[]
}

export interface StationProductLine {
  product_id: number
  product_sku: string | null
  product_name: string | null
  total_quantity: number
  by_customer: StationProductByCustomer[]
}

export interface StationProductAggregate {
  zone_id: number
  sorting_wave_id: number
  outbound_location_code: string | null
  customers: StationCustomerLine[]
  products: StationProductLine[]
}

export interface StationProductByCustomerInput {
  customer_name: string
  quantity: number
  item_outbound_ids: number[]
}

export interface StationProductLineInput {
  product_id: number
  total_quantity: number
  by_customer: StationProductByCustomerInput[]
}

export interface StationStockPreviewInput {
  zone_id: number
  sorting_wave_id: number
  outbound_location_id?: number | null
  products: StationProductLineInput[]
}

export interface StationStockAllocationLine {
  item_outbound_id: number
  quantity: number
  pallet_quantity: number
}

export interface StationStockPickLine {
  product_id: number
  product_sku: string | null
  product_name: string | null
  outbound_order_id: number
  outbound_order_code: string | null
  location_id: number
  location_code: string
  location_bin: string | null
  quantity: number
  allocations: StationStockAllocationLine[]
}

export interface StationStockReturnLine {
  product_id: number
  product_sku: string | null
  product_name: string | null
  outbound_order_id: number
  outbound_order_code: string | null
  location_id: number | null
  location_code: string | null
  location_bin: string | null
  quantity: number
}

export interface StationStockPreview {
  zone_id: number
  sorting_wave_id: number
  current_location_id: number | null
  current_location_code: string | null
  current_location_bin: string | null
  picks: StationStockPickLine[]
  returns: StationStockReturnLine[]
}

export interface StationStockConfirmResult {
  zone_id: number
  sorting_wave_id: number
  created_task_count: number
  tasks: OutboundTask[]
  preview: StationStockPreview
}
