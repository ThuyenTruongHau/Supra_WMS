
interface ProductWritable {
  sku: string
  name: string
  lot: string
  base_unit: string
  quantity: number
  zone_id: number
  details?: Record<string, unknown>
}

export interface Product extends ProductWritable {
  id: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface GetProductsByZoneIdResponse {
  zone_id: number
  products: Product[]
}

export type CreateProductInput = Omit<ProductWritable, 'quantity'> & {
  details?: Record<string, unknown>
  is_active?: boolean
}

export type UpdateProductInput = {
  id: number
} & Partial<Omit<ProductWritable, 'zone_id'>>

export interface ItemStock {
  id: number
  product_id: number
  location_id: number
  location_code: string | null
  location_row: string | null
  location_column: string | null
  location_bin: string | null
  quantity: number
  reserved_quantity: number
  available_quantity: number
  status: string
  updated_at: string
}
export interface GetProductByIdResponse {
  product: Product
  items_in_stock: ItemStock[]
}

export interface ProductImportJobAccepted {
  job_id: string
  status: string
  message: string
}

export interface ProductImportErrorItem {
  row: number
  sku: string
  message: string
}

export interface ProductImportJobStatus {
  job_id: string
  status: 'pending' | 'running' | 'completed' | 'failed' | string
  zone_id?: number | null
  filename?: string | null
  processed: number
  total: number
  created: number
  error_count: number
  errors: ProductImportErrorItem[]
  message: string
}