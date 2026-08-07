export interface Zone {
  id: number;
  warehouse_id: number;
  code: string;
  name: string | null;
  description: string | null;
}

export interface ZoneListResponse {
  items: Zone[];
  total: number;
  page: number;
  page_size: number;
}

export type CreateZoneInput = {
  warehouse_id: number;
  code: string;
  name?: string | null;
  description?: string | null;
};

export type UpdateZoneInput = Partial<CreateZoneInput>;

export interface LocationSummary {
  id: number;
  location_code: string;
  location_name: string;
  warehouse_id: number;
  zone_id: number | null;
  is_active: boolean;
}

export interface LocationListResponse {
  items: LocationSummary[];
  total: number;
  page: number;
  page_size: number;
}
