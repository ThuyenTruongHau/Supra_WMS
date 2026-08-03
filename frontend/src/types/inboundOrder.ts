export interface DraftInboundOrderDetail {
  sku: string;
  item_name: string;
  item_lot_code: string;
  item_expire_at?: string; // ISO String format
  ordered_quantity: number;
  vehicle_number?: string;
  detail_datetime?: string;
  source_warehouse?: string;
  target_warehouse?: string;
  delivery_type?: string;
  nvt_code?: string;
  status?: string;
}

export interface DraftInboundOrderRequest {
  supplier_name: string;
  notes: string;
  details: DraftInboundOrderDetail[];
}

export interface DraftInboundOrderResponse {
  session_id: string;
  expires_at: string;
  message: string;
}

export interface StorageLocationSuggestion {
  location_code: string;
  distance_meters: number;
  has_same_sku_nearby: boolean;
  score: number;
  zone_name: string;
}

export interface GetStorageLocationSuggestionsResponse {
  session_id: string;
  suggestions: StorageLocationSuggestion[];
}

export interface CreateInboundOrderDetail extends DraftInboundOrderDetail {
  location_code: string;
}

export interface CreateInboundOrderRequest {
  supplier_name: string;
  notes: string;
  details: CreateInboundOrderDetail[];
}

export interface CreateInboundOrderResponse {
  id?: number;
  message?: string;
  [key: string]: any;
}

export interface GetInboundOrdersParams {
  zone_id: number;
  vehicle_number?: string;
  status?: string;
  supplier_name?: string;
  created_by?: string | number;
  created_from?: string;
  created_to?: string;
  cursor?: string | number;
  limit?: number;
}

export interface InboundVehicle {
  vehicle_number: string;
}

export interface InboundOrderLocation {
  id: number;
  location_code: string;
  zone_name: string;
}

export interface InboundOrderItemDetail {
  id: number;
  item_sku: string;
  item_name: string;
  item_unit: string;
  item_lot_code: string;
  item_expire_at: string;
  ordered_quantity: string | number;
  received_quantity: string | number;
  status: string;
  location: InboundOrderLocation;
  // Worker inbound – trường mới
  num_pallets?: number;
  detail_datetime?: string;
  vehicle_number?: string;
  order_code?: string;
}

export interface InboundOrderDetail {
  id: number;
  order_code: string;
  supplier_name: string;
  status: string;
  notes: string | null;
  details: InboundOrderItemDetail[];
  creator: {
    id: number;
    username: string;
  };
  created_at: string;
  updated_at: string;
  // Worker inbound – trường mới (key từ PalletGroupForm)
  source_warehouse?: string | null;
  target_warehouse?: string | null;
  delivery_type?: string | null;
  nvt_code?: string | null;
}

export interface GetInboundOrdersResponse {
  orders: InboundOrderDetail[];
  next_cursor?: string | number | null;
}

export interface ReceiveInboundOrderDetailRequest {
  received_quantity: number;
  actual_location_code: string;
  "start-location"?: string;
}
