
export interface Item {
  id: number
  sku: string
  name: string
  description: string | null
  base_unit: string
  zone_id: number
  product_code: string        // ← mới, bắt buộc khi tạo
  supplier: string
  details: Record<string, unknown>
  is_active: boolean
  quantity: number
  created_at: string
  updated_at: string
}
export interface ItemListParams {
  zone_id?: number
  q?: string
  offset?: number
  limit?: number
  is_active?: boolean
}
export interface ItemListResponse {
  items: Item[]
  total: number
}
export type CreateItemInput = {
  sku: string
  name: string
  description?: string | null
  base_unit: string
  zone_id: number
  product_code: string
  supplier: string
  details?: Record<string, unknown>
}
export type UpdateItemInput = Partial<
  Omit<CreateItemInput, 'sku' | 'product_code' | 'zone_id'> & {
    is_active: boolean
  }
>
export interface ItemStock {
  id: number
  item_id: number             
  location_id: number
  lot_number: string | null
  expiry_date: string | null
  quantity: number
  reserved_quantity: number
  available_quantity: number
  status: string
  created_at: string | null
  updated_at: string
}

export interface ItemDetails {
  item: Item
  stocks: ItemStock[]
}

//New
export interface ItemAnalyzeResponse {
  total_items: number
  total_quantity: number
  total_nearly_outdated: number
  total_low_stock: number
}

export interface ItemImportJobAccepted {
  job_id: string
  status: string
  message: string
}

export interface ItemImportErrorItem {
  row: number
  sku: string
  message: string
}

export interface ItemImportJobStatus {
  job_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | string
  zone_id?: number | null
  filename?: string | null
  processed: number
  total: number
  created: number
  error_count: number
  errors: ItemImportErrorItem[]
  message: string
}
