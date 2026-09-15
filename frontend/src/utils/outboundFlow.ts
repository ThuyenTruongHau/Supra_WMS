const PICK_SPLIT_OUTBOUND_TYPES = new Set(["Lấy lẻ", "lấy lẻ"]);

export function isPickSplitOutboundOrder(
  orderDetails: Record<string, unknown> | null | undefined,
): boolean {
  const type = orderDetails?.type;
  return typeof type === "string" && PICK_SPLIT_OUTBOUND_TYPES.has(type);
}

/** Manual warehouse or Lấy lẻ — allocations have no robot_task_id. */
export function shouldUseManualAllocationFlow(
  warehouseOutboundType: "manual" | "auto",
  orderDetails: Record<string, unknown> | null | undefined,
): boolean {
  return (
    warehouseOutboundType === "manual" ||
    isPickSplitOutboundOrder(orderDetails)
  );
}

export function resolveExecuteDetailType(
  warehouseOutboundType: "manual" | "auto",
  orderDetails: Record<string, unknown> | null | undefined,
): "manual" | "auto" {
  return shouldUseManualAllocationFlow(warehouseOutboundType, orderDetails)
    ? "manual"
    : warehouseOutboundType;
}
