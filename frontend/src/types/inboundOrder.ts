export type InboundOrderStatus =
  | "initialize"
  | "reserved"
  | "reversed"
  | "in_transit"
  | "in-progress"
  | "completed"
  | string;

export interface InboundOrder {
  id: number;
  order_code: string;
  status: InboundOrderStatus;
  note: string | null;
  created_by_id: number;
  warehouse_id: number;
  details: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface OrderListSummary {
  total: number;
  initialize: number;
  in_progress: number;
  completed: number;
}

export interface InboundOrderListResponse {
  items: InboundOrder[];
  total: number;
  page: number;
  page_size: number;
  summary: OrderListSummary;
}

/** Một SKU nằm trong vị trí đích của detail. */
export interface InboundOrderAllocation {
  id: number;
  inbound_order_detail_id: number;
  item_stock_id: number;
  unit_id: number;
  quantity: number;
  status: string;
  item_id: number | null;
  sku: string | null;
  item_name: string | null;
  unit_name: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** Một vị trí đích (nhóm/pallet) kèm danh sách SKU. */
export interface InboundOrderDetail {
  id: number;
  inbound_order_id: number;
  from_location_id: number | null;
  to_location_id: number | null;
  from_location_code: string | null;
  from_location_name: string | null;
  to_location_code: string | null;
  to_location_name: string | null;
  status: string;
  detail_type: string;
  details: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  allocations: InboundOrderAllocation[];
}

export interface GetInboundOrdersParams {
  warehouse_id: number;
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
}

/** --- Suggest allocation --- */
export interface InboundSuggestAllocationItem {
  item_id: number;
  quantity: number;
  unit_id: number;
  lot_number?: string | null;
}

export interface InboundSuggestLineItem {
  items: InboundSuggestAllocationItem[];
  details?: Record<string, unknown>;
}

export interface InboundSuggestAllocationRequest {
  warehouse_id: number;
  detail_type: string;
  line_items: InboundSuggestLineItem[];
}

export interface InboundSuggestAllocationItemResponse {
  item_id: number;
  quantity: number;
  unit_id: number;
  lot_number: string | null;
  details: Record<string, unknown>;
}

export interface InboundSuggestAllocationGroupResponse {
  detail_type: string;
  target_location_name: string;
  target_location_id: number;
  line_items: InboundSuggestAllocationItemResponse[];
}

export interface InboundSuggestAllocationResponse {
  line_items: InboundSuggestAllocationGroupResponse[];
}

export interface InboundReleaseLocationsRequest {
  location_ids: number[];
}

export interface InboundReleaseLocationsResponse {
  deleted: number;
}

/** --- Create --- */
export interface InboundOrderAllocationCreate {
  item_id: number;
  quantity: number;
  unit_id: number;
  lot_number?: string | null;
  expiry_date?: string | null;
}

export interface InboundOrderDetailCreate {
  from_location_id: number;
  to_location_id: number;
  details?: Record<string, unknown>;
  allocations: InboundOrderAllocationCreate[];
}

export interface InboundOrderCreateRequest {
  order_code: string;
  note?: string | null;
  warehouse_id: number;
  details?: Record<string, unknown>;
  line_items: InboundOrderDetailCreate[];
}

/** --- Update --- */
export interface InboundOrderAllocationUpdate {
  id?: number | null;
  delete?: boolean;
  item_id?: number | null;
  quantity?: number | null;
  unit_id?: number | null;
  lot_number?: string | null;
  expiry_date?: string | null;
}

export interface InboundOrderDetailUpdate {
  id?: number | null;
  delete?: boolean;
  from_location_id?: number | null;
  to_location_id?: number | null;
  details?: Record<string, unknown> | null;
  allocations?: InboundOrderAllocationUpdate[] | null;
}

export interface InboundOrderUpdateRequest {
  note?: string | null;
  details?: Record<string, unknown> | null;
  line_items?: InboundOrderDetailUpdate[];
}

export interface InboundOrderDeleteResponse {
  order_code: string;
  message: string;
}
