export type InventoryAuditOrderStatus =
  | 'draft'
  | 'in_progress'
  | 'completed'
  | 'cancelled'

export type InventoryAuditType = 'full' | 'cycle' | 'spot'

export type InventoryAuditDetailStatus = 'pending' | 'counted' | 'adjusted'

export interface InventoryAuditDetail {
  id: number
  location_id: number
  location_code: string | null
  location_row: string | null
  location_column: string | null
  location_bin: string | null
  product_id: number
  product_sku: string | null
  product_name: string | null
  product_lot: string | null
  item_stock_id: number | null
  system_quantity: number
  counted_quantity: number | null
  variance: number | null
  base_unit: string
  status: InventoryAuditDetailStatus
  notes: string | null
}

export interface InventoryAuditOrder {
  id: number
  order_code: string
  status: InventoryAuditOrderStatus
  audit_type: InventoryAuditType
  zone_id: number
  notes: string | null
  created_by: number
  created_by_name: string | null
  completed_by: number | null
  completed_by_name: string | null
  created_at: string
  updated_at: string
  total_lines: number
  counted_lines: number
  variance_lines: number
  total_variance: number
  details: InventoryAuditDetail[]
}

export interface InventoryAuditSummary {
  zone_id: number
  total_orders: number
  draft_orders: number
  in_progress_orders: number
  completed_orders: number
  cancelled_orders: number
  with_variance_orders: number
}

export interface CreateInventoryAuditInput {
  zone_id: number
  audit_type?: InventoryAuditType
  notes?: string | null
}

export interface UpdateInventoryAuditDetailInput {
  counted_quantity: number
  notes?: string | null
}

export const AUDIT_TYPE_LABELS: Record<InventoryAuditType, string> = {
  full: 'Kiểm kê toàn bộ',
  cycle: 'Kiểm kê chu kỳ',
  spot: 'Kiểm kê đột xuất',
}

export const AUDIT_STATUS_LABELS: Record<InventoryAuditOrderStatus, string> = {
  draft: 'Khởi tạo',
  in_progress: 'Đang kiểm',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}
