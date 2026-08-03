export interface OutboundCreator {
    id: number
    username: string
  }
  
  /** 1 dòng trong GET /api/v1/outbound-orders */
  export interface OutboundOrderListItem {
    id: number
    order_code: string
    customers: string[]
    requested_date: string | null
    status: string
    notes: string | null
    created_by: number
    creator: OutboundCreator
    created_at: string
    updated_at: string
    total_items: number
    total_customers: number
    total_requested_quantity: string // Decimal từ BE, ví dụ "50.000"
  }
  
  export interface OutboundOrderListParams {
    q?: string
    status?: string
    zone_id?: number
    date_from?: string
    date_to?: string
    skip?: number
    limit?: number
  }
  
  export interface OutboundOrderListResponse {
    items: OutboundOrderListItem[]
    total: number
    skip: number
    limit: number
  }
  
  export interface OutboundOrderAnalyzeResponse {
    total: number
    total_quantity: number
    not_finished_order: number
    finised_order: number
  }
  
  /** @deprecated dùng OutboundOrderListItem */
  export type OutboundOrder = OutboundOrderListItem

export interface OutboundOrderAnalyzeResponse {
    total: number
    total_quantity: number
    not_finished_order: number
    finised_order: number
  }

  export interface OutboundDetailCreateInput {
    item_id?: string
    sku?: string
    item_pk?: number
    requested_quantity: number
    picking_condition?: Record<string, unknown>
    notes?: string
  }
  export interface OutboundShipmentCreateInput {
    customer_name: string
    vehicle_number?: string | null
    trip?: string | null
    carrier_name?: string | null
    requested_date?: string | null // "YYYY-MM-DD"
    notes?: string | null
    details: OutboundDetailCreateInput[]
  }
  export interface OutboundOrderCreateInput {
    zone_id: number
    requested_date?: string | null
    notes?: string | null
    shipments: OutboundShipmentCreateInput[]
  }

  /** Item lồng trong mỗi detail (BE: ItemSummary) */
export interface OutboundItemSummary {
    id: number
    product_code: string
    sku: string
    name: string
    base_unit: string
  }
  
  /** 1 sản phẩm trong 1 shipment (BE: OutboundDetailOut) */
  export interface OutboundDetail {
    id: number
    outbound_shipment_id: number
    item_id: number
    item: OutboundItemSummary
    requested_quantity: string // Decimal từ BE, ví dụ "10.000"
    requested_unit: string
    picking_condition: Record<string, unknown>
    allocation_strategy: string
    notes: string | null
    created_at: string
    updated_at: string
  }
  
  /** 1 khách hàng trong đơn (BE: OutboundShipmentOut) */
  export interface OutboundShipment {
    id: number
    customer_name: string
    vehicle_number: string | null
    trip: string | null
    carrier_name: string | null
    requested_date: string | null
    notes: string | null
    created_at: string
    updated_at: string
    details: OutboundDetail[]
  }
  
  /** GET /api/v1/outbound-orders/{order_code} (BE: OutboundOrderOut) */
  export interface OutboundOrderDetail {
    id: number
    order_code: string
    requested_date: string | null
    status: string
    notes: string | null
    created_by: number
    updated_by: number | null
    creator: OutboundCreator
    created_at: string
    updated_at: string
    shipments: OutboundShipment[]
  }

  export interface OutboundDetailUpdateInput {
    id?: number
    sku?: string
    item_id?: string
    item_pk?: number
    requested_quantity: number
    picking_condition?: Record<string, unknown>
    notes?: string | null
  }
  
  export interface OutboundShipmentUpdateInput {
    id?: number
    customer_name: string
    vehicle_number?: string | null
    trip?: string | null
    carrier_name?: string | null
    requested_date?: string | null
    notes?: string | null
    details: OutboundDetailUpdateInput[]
  }
  
  export interface OutboundOrderUpdateInput {
    zone_id: number
    requested_date?: string | null
    notes?: string | null
    shipments: OutboundShipmentUpdateInput[]
  }
  
  export interface OutboundOrderDeleteResponse {
    order_code: string
    status: string
    message: string
  }

  /** POST allocations/suggest | confirm (BE: OutboundWorkflowOut) */
  export interface OutboundWorkflowAllocation {
    id: number
    outbound_order_detail_id: number
    item_stock_id: number
    customer_name: string
    item: OutboundItemSummary
    source_location: {
      id: number
      zone_id: number
      location_code: string
      pallet_quantity: string
      location_type: string
    }
    item_stock: {
      id: number
      item_id: number
      lot_number: string | null
      expiry_date: string | null
      quantity: string
      reserved_quantity: string
      status: string
    }
    moved_quantity: string
    planned_ship_quantity: string
    actual_ship_quantity: string
    expected_return_quantity: string
    actual_return_quantity: string
    strategy_used: string
    status: string
    allocation_source: string
    robot_tasks: RobotTask[]
  }

  export interface OutboundShortage {
    outbound_order_detail_id: number
    customer_name: string
    item: OutboundItemSummary
    requested_quantity: string
    allocated_quantity: string
    shortage_quantity: string
  }

  export interface OutboundWorkflowOut {
    order_code: string
    zone_id: number
    status: string
    requested_quantity: string
    planned_ship_quantity: string
    actual_ship_quantity: string
    pending_return_quantity: string
    allocations: OutboundWorkflowAllocation[]
    shortages: OutboundShortage[]
    bypass_requests?: OutboundBypassRequest[]
  }

  /** POST /{order_code}/bypass-requests */
  export interface BypassRequestCreateInput {
    detail_ids?: number[]
    notes?: string | null
  }

  export interface OutboundBypassRequest {
    id: number
    outbound_order_detail_id: number
    order_code: string
    zone_id: number
    customer_name: string
    item: OutboundItemSummary
    required_quantity: string
    fulfilled_quantity: string
    remaining_quantity: string
    status: string
    notes: string | null
    requested_by: number
    acknowledged_by: number | null
    created_at: string
    acknowledged_at: string | null
    completed_at: string | null
    cancelled_at: string | null
  }

  /** BE: RobotTaskOut — bảng robot_tasks */
  export interface RobotTask {
    id: number
    outbound_allocation_id: number
    task_type: string
    location_code: string
    destination_location_code: string | null
    end_point_id: number | null
    end_point_code: string | null
    quantity: string
    status: string
    idempotency_key: string
    failure_code: string | null
    failure_message: string | null
    created_at: string
    started_at: string | null
    completed_at: string | null
  }

  /** BE: RobotTaskTrackingOut */
  export interface RobotTaskTracking {
    order_code: string
    zone_id: number
    order_status: string
    outbound_allocation_id: number
    allocation_status: string
    customer_name: string
    task: RobotTask
  }

  /** GET /api/v1/outbound-orders/{order_code}/robot-tasks/status */
  export interface OutboundRobotTasksTracking {
    order_code: string
    zone_id: number
    order_status: string
    total_tasks: number
    pending_tasks: number
    active_tasks: number
    succeeded_tasks: number
    failed_tasks: number
    tasks: RobotTaskTracking[]
  }