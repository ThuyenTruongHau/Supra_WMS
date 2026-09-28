export type SortingOrderStatus = 'draft' | 'sorting' | 'completed' | 'pending'

export interface SortingOrderDetail {
  id: number
  sorting_wave_id: number
  sorting_wave_name: string | null
  zone_id: number
  status: SortingOrderStatus
  customer_name: string
  item_outbound_id: number
  outbound_order_id: number | null
  outbound_order_code: string | null
  product_id: number | null
  product_sku: string | null
  product_name: string | null
  requested_quantity: number | null
  base_unit: string | null
  vehicle_number: string | null
  created_at: string
  updated_at: string
}

export interface SortingOrderSummary {
  zone_id: number
  draft_count: number
}

export const SORTING_ORDER_STATUS_LABELS: Record<SortingOrderStatus, string> = {
  draft: 'Khởi tạo',
  pending: 'Khởi tạo',
  sorting: 'Đang chia',
  completed: 'Hoàn thành',
}

export interface SortingOrderTableRow {
  rowKey: string
  sorting_order_id: number
  sorting_wave_name: string | null
  outbound_order_code: string | null
  product_sku: string | null
  product_name: string | null
  requested_quantity: number | null
  base_unit: string | null
  customer_name: string | null
  vehicle_number: string | null
  status: SortingOrderStatus
  created_at: string
  updated_at: string
}

export function flattenSortingOrdersToRows(
  details: SortingOrderDetail[],
): SortingOrderTableRow[] {
  return details.map((detail) => ({
    rowKey: `detail-${detail.id}`,
    sorting_order_id: detail.id,
    sorting_wave_name: detail.sorting_wave_name,
    outbound_order_code: detail.outbound_order_code,
    product_sku: detail.product_sku,
    product_name: detail.product_name,
    requested_quantity: detail.requested_quantity,
    base_unit: detail.base_unit,
    customer_name: detail.customer_name,
    vehicle_number: detail.vehicle_number,
    status: detail.status,
    created_at: detail.created_at,
    updated_at: detail.updated_at,
  }))
}
