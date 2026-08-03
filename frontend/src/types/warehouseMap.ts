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

export interface WarehouseMapImportResult {
  id: number;
  zone_id: number;
  is_active: boolean;
}

export interface MapLocationItemStock {
  sku: string;
  lot_number: string | null;
  quantity: string;
}

export interface FullLocationDetail {
  id: number;
  location_code: string;
  node_name: string | null;
  zone_id: number;
  zone_name: string;
  row: string | null;
  column: string | null;
  map_x: number;
  map_y: number;
  grid_x: number;
  grid_y: number;
  map_node_content: string | null;
  block_id: number | null;
  level: string | null;
  bin: string | null;
  capacity: number | null;
  location_type: string;
  pallet_quantity: string;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  item_stock: MapLocationItemStock[];
}

export interface FullLocationsResponse {
  zone_id: number;
  location_codes: string[];
  locations: FullLocationDetail[];
}

export interface WarehouseLocationCell {
  id: number;
  location_code: string;
  location_type: string;
  node_name: string | null;
  zone_id: number;
  row: string | null;
  column: string | null;
  level: string | null;
  bin: string | null;
  capacity: number | null;
  pallet_quantity?: string | number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ItemStockDetail {
  id: number;
  product_id: number;
  location_id: number;
  lot_number: string | null;
  expiry_date: string | null;
  quantity: string;
  reserved_quantity: string;
  available_quantity: string;
  status: string;
}

export interface WarehouseLocationItemStockDetail {
  location: WarehouseLocationCell;
  item_stock: ItemStockDetail[];
  summary: {
    item_stock_count: number;
    total_quantity: string;
    total_reserved_quantity: string;
    total_available_quantity: string;
  };
}
