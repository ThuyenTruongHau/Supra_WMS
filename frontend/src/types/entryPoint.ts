export interface EntryPoint {
  id: number;
  code: string;
  description: string;
  map_x?: number;
  map_y?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateEntryPointRequest {
  code: string;
  description: string;
  zone_id: number;
}
