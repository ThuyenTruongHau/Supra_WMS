export interface SortingWave {
  id: number;
  zone_id: number;
  zone_name?: string | null;
  name: string;
  outbound_stations: number[];
  sorting_stations: number[];
  created_by: number;
  created_by_name?: string | null;
  created_at: string;
}

export interface CreateSortingWaveInput {
  zone_id: number;
  name: string;
  outbound_stations: number[];
  sorting_stations: number[];
}

export interface UpdateSortingWaveInput {
  name?: string;
  outbound_stations?: number[];
  sorting_stations?: number[];
}
