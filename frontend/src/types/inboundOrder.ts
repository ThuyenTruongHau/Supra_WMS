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
  qr_code_id?: number | null;
  cavity_number?: string | null;
  manufacturing_user?: string | null;
  qc_user?: string | null;
  packing_user?: string | null;
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

export interface AssignOrGetItemStockRequest {
  qr_code?: string | null;
  raw?: string | null;
  location_id?: number | null;
  warehouse_id?: number | null;
  quantity?: number | null;
  unit_id?: number | null;
  lot_number?: string | null;
  cavity_number?: string | null;
  manufacturing_user?: string | null;
  qc_user?: string | null;
  packing_user?: string | null;
  is_split?: boolean | null;
}

export interface QrCodePreviewResponse {
  qr_code_id: number;
  code: string;
  item_id: number;
  item_sku: string;
  item_name: string;
  quantity: number;
  unit_id: number;
  unit_name: string;
  lot_number: string;
  cavity_numbers: string[];
  cavity_number?: string | null;
  qr_type: string;
  manufacturing_user?: string | null;
  qc_user?: string | null;
  packing_user?: string | null;
  is_split?: boolean;
  /** Pack đã gán vào item qua assign:item — FE gom khi quét item (luồng assign thường) */
  linked_packs?: AssignedItemStock[];
}

export interface AssignItemStockMetaResponse {
  part_number: string;
  location: string;
}

export interface QrCodePreviewRequest {
  qr_code: string;
  warehouse_id?: number | null;
}

export interface PendingCachedResponse {
  qr_code_id: number;
  code: string;
  part_number: string;
  item_name?: string;
}

export interface PackerItemAnchor {
  qr_code_id: number;
  code: string;
  item_id: number;
}

export interface CacheForPackingUserRequest {
  qr_code: string;
  warehouse_id?: number | null;
  quantity: number;
  unit_id: number;
  lot_number: string;
  cavity_number?: string | null;
  manufacturing_user?: string | null;
  qc_user?: string | null;
  packing_user?: string | null;
  /** Parent item qr_code_id; required when caching pack QR */
  relation?: number | null;
}

export interface AssignPackingToItemRequest {
  qr_code: string;
  warehouse_id?: number | null;
  target_qr_id?: string | null;
  quantity?: number;
  unit_id?: number;
  lot_number?: string;
  cavity_number?: string | null;
  manufacturing_user?: string;
  qc_user?: string | null;
  packing_user?: string | null;
}

export interface PackingUserPendingStocksResponse {
  packing_user: string;
  items: AssignedItemStock[];
}

export interface AssignedItemStock {
  qr_code_id: number;
  code: string;
  lot_number?: string | null;
  lot_number_to?: string | null;
  unit_id: number;
  unit_name: string;
  quantity: number;
  item_id: number;
  item_sku: string;
  item_name?: string | null;
  location_id?: number | null;
  location_name?: string | null;
  warehouse_id?: number | null;
  qr_type?: string | null;
  cavity_number?: string | null;
  manufacturing_user?: string | null;
  qc_user?: string | null;
  packing_user?: string | null;
  stock_level?: number | null;
  is_split?: boolean;
  details?: Record<string, unknown> | null;
  /** `"item"` = item anchor; number = linked pack parent qr_code_id; null = unlinked pack */
  relation?: number | string | null;
}

export type AssignOrGetItemStockAction =
  | "preview"
  | "assigned"
  | "location_stocks"
  | "pending_cached"
  | "location"
  | "created";

export interface AssignOrGetItemStockResponse {
  action: AssignOrGetItemStockAction;
  preview?: QrCodePreviewResponse | null;
  assigned?: AssignItemStockMetaResponse | null;
  location_stocks?: AssignedItemStock[];
  pending?: PendingCachedResponse | null;
  location_id?: number | null;
  location_name?: string | null;
  location_code?: string | null;
  warehouse_id?: number | null;
  order_code?: string | null;
}

export const isAssignOrGetPreview = (
  value: AssignOrGetItemStockResponse,
): value is AssignOrGetItemStockResponse & {
  action: "preview";
  preview: QrCodePreviewResponse;
} => value.action === "preview" && !!value.preview;

export const isAssignOrGetAssigned = (
  value: AssignOrGetItemStockResponse,
): value is AssignOrGetItemStockResponse & {
  action: "assigned";
  assigned: AssignItemStockMetaResponse;
} => value.action === "assigned" && !!value.assigned;

export const isAssignOrGetLocationStocks = (
  value: AssignOrGetItemStockResponse,
): value is AssignOrGetItemStockResponse & {
  action: "location_stocks";
  location_stocks: AssignedItemStock[];
} => value.action === "location_stocks";

export const isAssignOrGetPendingCached = (
  value: AssignOrGetItemStockResponse,
): value is AssignOrGetItemStockResponse & {
  action: "pending_cached";
  pending: PendingCachedResponse;
} => value.action === "pending_cached" && !!value.pending;

export const isManualInboundLocation = (
  value: AssignOrGetItemStockResponse,
): value is AssignOrGetItemStockResponse & {
  action: "location";
  location_id: number;
} => value.action === "location" && value.location_id != null;

export const isManualInboundCreated = (
  value: AssignOrGetItemStockResponse,
): value is AssignOrGetItemStockResponse & {
  action: "created";
  order_code: string;
} => value.action === "created" && !!value.order_code;

export interface InboundCallerResponse {
  order: InboundOrder;
  line_items: InboundCallerLineItem[];
  robot_tasks: RobotTaskInfo[];
}

export interface RobotTaskInfo {
  id: number;
  order_id: string;
  quantity: number;
  process_code: string;
  system_code: string;
  task_order_detail: string;
  inbound_order_detail_id?: number | null;
  status: string;
}

export interface InboundCallerLineItem {
  detail: InboundOrderDetail;
  robot_task?: RobotTaskInfo | null;
}

export interface TaskAddPayload {
  order_id: string;
  start_point: string;
  target_point: string;
  move_mode: string;
  metadata: {
    order_code: string;
    inbound_order_id: number;
    detail_id: number;
    from_location_id: number | null;
    to_location_id: number | null;
    allocations: InboundOrderAllocation[];
  };
}
