export interface MapData {
  width: number;
  height: number;
  nodeKeys: string[];
  lineKeys: string[];
  nodeArr: (number | string | number[])[][];
  lineArr: (string | number | (number | null)[])[][];
  type?: string;
  xAttrMin?: number;
  yAttrMin?: number;
}

export interface LocationSyncSummary {
  created: number;
  updated: number;
  unchanged: number;
  reactivated: number;
  deactivated: number;
}

export interface WarehouseMapImportResult {
  id: number;
  zone_id: number;
  source_sha256: string;
  original_filename: string;
  zip_sha256: string;
  zip_size_bytes: number;
  download_url: string;
  map_type: string | null;
  width: number;
  height: number;
  node_count: number;
  shelf_count: number;
  waypoint_count: number;
  line_count: number;
  is_active: boolean;
  created_at: string;
  activated_at: string;
  location_sync: LocationSyncSummary;
  message?: string;
}

export interface WarehouseMapMetadata {
  id: number;
  zone_id: number | null;
  source_sha256: string;
  original_filename: string | null;
  zip_sha256: string | null;
  zip_size_bytes: number | null;
  map_type: string | null;
  width: number;
  height: number;
  x_attr_min: number | null;
  y_attr_min: number | null;
  node_count: number;
  shelf_count: number;
  waypoint_count: number;
  line_count: number;
  is_active: boolean;
  created_at: string;
  activated_at: string;
}

export interface InboundBufferPoint {
  id: number;
  location_code: string;
  node_name: string | null;
  status: string;
  row: string | null;
  column: string | null;
  bin: string | null;
  location_type?: string | null;
}

export interface InboundBufferPointsResponse {
  zone_id: number;
  location_type?: string;
  points: InboundBufferPoint[];
}

export interface InboundBufferMapView {
  zone_id: number;
  location_type?: string;
  map: MapData;
  points: InboundBufferPoint[];
  origin: { min_x: number; min_y: number };
  buffer_node_count: number;
  focus_node_count?: number;
}

/** Parsed map node used by WarehouseMapCanvas click/selection. */
export interface NodeInfo {
  x: number;
  y: number;
  type: number;
  content: string;
  name: string;
  isTurn: number;
  shelfIsTurn: number;
  extraTypes: number[];
}


export interface MapLocationItemStock {
  sku: string;
  lot_number: string | null;
  quantity: string;
}

export interface FullLocationDetail {
  id: number;
  location_code: string;
  location_name?: string | null;
  bin_code?: string | null;
  row: string | null;
  column: string | null;
  level: string | null;
  status: string;
  item_stock: MapLocationItemStock[];
}

export interface FullLocationsResponse {
  warehouse_id: number;
  location_codes: string[];
  locations: FullLocationDetail[];
}

export interface WarehouseLocationCell {
  id: number;
  location_code: string;
  location_name: string;
  bin_code: string | null;
  node_name: string | null;
  warehouse_id: number;
  zone_id: number | null;
  row: string | null;
  column: string | null;
  level: string | null;
  status?: string | null;
  location_type?: string;
  bin?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ItemStockDetail {
  id: number;
  item_id: number;
  sku: string;
  location_id?: number;
  lot_number: string | null;
  expiry_date: string | null;
  quantity: string;
  status: string;
}

export interface WarehouseLocationItemStockDetail {
  location: WarehouseLocationCell;
  item_stock: ItemStockDetail[];
  summary: {
    item_stock_count: number;
    total_quantity: string;
  };
}
