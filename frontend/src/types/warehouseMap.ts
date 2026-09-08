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

/** Move every reference of a bin that left the map onto a bin that is in it. */
export interface MapRemapEntry {
  from_bin: string;
  to_bin: string;
}

export interface MapSyncMatchedItem {
  location_id: number;
  bin_code: string | null;
  location_name: string | null;
  matched_by: 'bin_code' | 'row_column_level' | 'location_code';
  previous_location_code: string | null;
  location_code: string;
}

export interface MapSyncCreatedItem {
  location_id: number;
  bin_code: string | null;
  location_name: string | null;
  location_code: string;
}

export interface MapSyncRemappedItem {
  from_location_id: number;
  from_bin: string | null;
  to_location_id: number;
  to_bin: string | null;
  moved: Record<string, number>;
}

/** Also used for `blocked`, where `quantity` is the stock that prevents retiring. */
export interface MapSyncRetiredItem {
  location_id: number;
  bin_code: string | null;
  location_name: string | null;
  references: Record<string, number>;
  quantity?: string | null;
}

export interface MapSyncFreedCode {
  location_id: number;
  bin_code: string | null;
  released_location_code: string;
}

export interface MapSyncUnnamedNode {
  location_code: string;
  node_name: string | null;
}

export interface WarehouseMapImportResult {
  total_shelves: number;
  matched: MapSyncMatchedItem[];
  created: MapSyncCreatedItem[];
  remapped: MapSyncRemappedItem[];
  retired: MapSyncRetiredItem[];
  blocked: MapSyncRetiredItem[];
  freed_codes: MapSyncFreedCode[];
  nodes_without_bin_code: MapSyncUnnamedNode[];
  counts: {
    matched: number;
    created: number;
    remapped: number;
    retired: number;
    blocked: number;
  };
  warehouse_map_id?: number | null;
  source?: string | null;
  moved_cache_entries?: number | null;
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
