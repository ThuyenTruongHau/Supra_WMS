import type { OutboundRobotTask } from "@/types/outbound";

export function getManualScanTitle(task: OutboundRobotTask): string {
  const status = task.allocations[0]?.status;
  if (status === "initialize") return "Quét QR sản phẩm";
  if (status === "pre_completed") return "Quét QR vị trí đích";
  if (status === "double_check_stock") return "Quét lại QR sản phẩm";
  return "Quét QR xuất kho";
}

export function canShowManualQrScan(displayStatus: string): boolean {
  return (
    displayStatus === "initialize" ||
    displayStatus === "pre_completed" ||
    displayStatus === "double_check_stock"
  );
}

/** Show QR scan on tablet manual flow, or on any UI when awaiting double-check. */
export function shouldShowOutboundQrScanButton(
  displayStatus: string,
  options: { isManualOutbound: boolean; hasAllocations: boolean },
): boolean {
  if (!options.hasAllocations) return false;
  if (displayStatus === "double_check_stock") return true;
  if (options.isManualOutbound && canShowManualQrScan(displayStatus)) {
    return true;
  }
  return false;
}
