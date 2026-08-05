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
  message: string;
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
