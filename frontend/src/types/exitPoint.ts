/** GET/POST/PATCH /api/v1/end-points — khớp EndPointOut (BE) */
export interface ExitPoint {
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

/** Query params cho GET /api/v1/end-points */
export interface ExitPointListParams {
  code?: string
  zone_id?: number
  is_active?: boolean
  available_only?: boolean
  skip?: number
  limit?: number
}

/** POST /api/v1/end-points — khớp EndPointCreate */
export interface CreateExitPointRequest {
  warehouse_location_id: number
  name: string
  description?: string | null
}

/** PATCH /api/v1/end-points/{id} — khớp EndPointUpdate */
export interface UpdateExitPointRequest {
  name?: string
  description?: string | null
  is_active?: boolean
}
