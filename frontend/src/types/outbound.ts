export type OutboundOrderStatus =
  | "initialize"
  | "in_progress"
  | "completed"
  | string;

export interface OutboundOrder {
  id: number;
  order_code: string;
  status: OutboundOrderStatus;
  note: string | null;
  created_by_id: number;
  warehouse_id: number;
  details: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface OutboundOrderListResponse {
  items: OutboundOrder[];
  total: number;
  page: number;
  page_size: number;
  summary: OrderListSummary;
}

export interface OrderListSummary {
  total: number;
  initialize: number;
  in_progress: number;
  completed: number;
}

export interface GetOutboundOrdersParams {
  warehouse_id: number;
  page?: number;
  page_size?: number;
  q?: string;
  status?: string;
}

export interface OutboundOrderLineItemCreate {
  item_id: number;
  quantity: number;
  unit_id: number;
  detail_type: string;
  details?: Record<string, unknown>;
}

export interface OutboundOrderCreateRequest {
  order_code: string;
  note?: string | null;
  warehouse_id: number;
  details?: Record<string, unknown>;
  line_items: OutboundOrderLineItemCreate[];
}

export interface OutboundOrderLineItemUpdate {
  id?: number | null;
  delete?: boolean;
  item_id?: number | null;
  quantity?: number | null;
  unit_id?: number | null;
  detail_type?: string | null;
  details?: Record<string, unknown> | null;
}

export interface OutboundOrderUpdateRequest {
  note?: string | null;
  details?: Record<string, unknown> | null;
  line_items?: OutboundOrderLineItemUpdate[];
}

export interface OutboundOrderDeleteResponse {
  order_code: string;
  status: string;
  message: string;
}

export interface OutboundOrderAllocation {
  id: number;
  outbound_order_detail_id: number;
  item_stock_id: number;
  quantity: number;
  status: string;
  from_location_id?: number | null;
  to_location_id?: number | null;
  from_location_code: string | null;
  from_location_name: string | null;
  to_location_code: string | null;
  to_location_name: string | null;
  item_id: number | null;
  sku: string | null;
  item_name: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface OutboundOrderDetail {
  id: number;
  outbound_order_id: number;
  item_id: number;
  sku: string | null;
  item_name: string | null;
  quantity: number;
  unit: string;
  unit_id: number | null;
  detail_type: string;
  status: OutboundOrderStatus;
  details: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  allocations: OutboundOrderAllocation[];
}

export interface LackedDetail {
  id: number;
  item_id: number;
  quantity: number;
  unit_id: number;
  detail_type: string;
  details: Record<string, unknown>;
  sku: string | null;
  item_name: string | null;
  unit: string | null;
  requested_quantity: number;
}

export interface DetailForCalculate {
  id: number;
  item_id: number;
  quantity: number;
  unit_id: number;
  detail_type: string;
  details?: Record<string, unknown>;
}

export interface CalculateOutboundRequest {
  warehouse_id: number;
  outbound_order_id: number;
  line_items: DetailForCalculate[];
}

export interface CalculateOutboundResponse {
  outbound_order_id: number;
  is_fully_allocated: boolean;
  lacked: LackedDetail[];
}

export interface OutboundRobotTask {
  order_id: string;
  task_path: string | null;
  task_type: "outbound" | "return";
  status: string;
  quantity: number;
  allocations: OutboundOrderAllocation[];
}
