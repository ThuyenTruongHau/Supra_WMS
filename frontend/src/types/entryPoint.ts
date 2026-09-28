/** GET/POST/PATCH /api/v1/start-points — khớp StartPointOut (BE) */
export interface EntryPoint {
  id: number
  warehouse_location_id: number
  name: string
  description: string | null
  code: string
  zone_id: number | null
  zone_name: string
  location_status: string
  location_is_active: boolean
  pallet_quantity: string | number
  is_active: boolean
  is_available: boolean
  created_at: string
  updated_at: string
}

/** Query params cho GET /api/v1/start-points */
export interface EntryPointListParams {
  code?: string
  zone_id?: number
  is_active?: boolean
  available_only?: boolean
  skip?: number
  limit?: number
}

/** POST /api/v1/start-points — khớp StartPointCreate */
export interface CreateEntryPointRequest {
  warehouse_location_id: number
  name: string
  description?: string | null
}

/** PATCH /api/v1/start-points/{id} — khớp StartPointUpdate */
export interface UpdateEntryPointRequest {
  name?: string
  description?: string | null
  is_active?: boolean
}
