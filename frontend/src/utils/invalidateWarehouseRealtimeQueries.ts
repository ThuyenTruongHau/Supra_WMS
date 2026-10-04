import type { QueryClient } from "@tanstack/react-query";

/** Query roots refetched when robot.task.completed fires for a warehouse. */
const REALTIME_ROOTS = new Set([
  "zone_map_status",
  "zone_map_layout",
  "inbound_buffer_map_view",
  "inbound_buffer_points",
  "location_stock_labels",
  "full-locations",
  "warehouse-map",
  "warehouse_map_metadata",
  "location-detail",
  "inbound_orders",
  "inbound_summary",
  "inbound_assigned_details",
  "inbound_operator_board_summary",
  "inbound_order_by_vehicle",
  "inbound_incomplete_vehicles",
  "inbound_order",
  "inboundOrderDetails",
  "outboundOrders",
  "outboundList",
  "outbound_summary",
  "outboundSummary",
  "outboundOrder",
  "outboundOrderDetails",
  "outboundRobotTasks",
  "outboundIncompleteVehicles",
  "outbound_sorting_station_fills",
]);

/** Roots whose queryKey[1] is warehouse_id or zone_id tied to session warehouse. */
const WAREHOUSE_SCOPED_ROOTS = new Set([
  "inbound_orders",
  "inbound_summary",
  "inbound_buffer_map_view",
  "inbound_buffer_points",
  "location_stock_labels",
  "full-locations",
  "warehouse-map",
  "warehouse_map_metadata",
  "outboundSummary",
]);

function queryMatchesWarehouse(
  queryKey: readonly unknown[],
  warehouseId: number,
): boolean {
  if (queryKey.length === 0 || typeof queryKey[0] !== "string") {
    return false;
  }
  const root = queryKey[0];
  if (!REALTIME_ROOTS.has(root)) {
    return false;
  }
  if (WAREHOUSE_SCOPED_ROOTS.has(root) && queryKey.length >= 2) {
    return queryKey[1] === warehouseId;
  }
  return true;
}

export function invalidateAfterRobotCompleted(
  queryClient: QueryClient,
  warehouseId: number,
) {
  if (warehouseId <= 0) return;
  void queryClient.invalidateQueries({
    predicate: (query) =>
      queryMatchesWarehouse(query.queryKey, warehouseId),
  });
}

/** Query roots refetched on operator inbound page when an inbound robot task completes. */
const OPERATOR_INBOUND_REALTIME_ROOTS = new Set([
  "zone_map_status",
  "zone_map_layout",
  "inbound_buffer_map_view",
  "inbound_buffer_points",
  "location_stock_labels",
  "location-detail",
  "full-locations",
  "inbound-buffer-locations",
  "inbound_orders",
  "inbound_assigned_details",
  "inbound_oldest_incomplete",
  "inbound_order",
  "inboundOrderDetails",
  "masanInboundDetails",
  "inbound_order_by_vehicle",
  "inbound_incomplete_vehicles",
  "inbound_operator_board_summary",
]);

const OPERATOR_INBOUND_WAREHOUSE_SCOPED = new Set([
  "inbound_orders",
  "inbound-buffer-locations",
  "inbound_oldest_incomplete",
  "inbound_buffer_map_view",
  "inbound_buffer_points",
  "location_stock_labels",
  "full-locations",
]);

function operatorInboundQueryMatches(
  queryKey: readonly unknown[],
  warehouseId: number,
): boolean {
  if (queryKey.length === 0 || typeof queryKey[0] !== "string") {
    return false;
  }
  const root = queryKey[0];
  if (!OPERATOR_INBOUND_REALTIME_ROOTS.has(root)) {
    return false;
  }
  if (OPERATOR_INBOUND_WAREHOUSE_SCOPED.has(root) && queryKey.length >= 2) {
    return queryKey[1] === warehouseId;
  }
  return true;
}

export function invalidateOperatorInboundAfterRobotCompleted(
  queryClient: QueryClient,
  warehouseId: number,
) {
  if (warehouseId <= 0) return;
  void queryClient.invalidateQueries({
    predicate: (query) =>
      operatorInboundQueryMatches(query.queryKey, warehouseId),
  });
}
