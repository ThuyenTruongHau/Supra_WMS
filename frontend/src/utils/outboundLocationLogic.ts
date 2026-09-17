import type { WarehouseOperationType } from "@/config/warehouseMode";

export type OutboundLocationLogicType = "outbound_buffer" | "qc_buffer";

const QC_BUFFER_TYPES = new Set(["tuyển chọn", "lấy lỗi", "lấy lẻ"]);

function isQcBufferType(value: unknown): boolean {
  if (value == null) return false;
  const normalized = String(value).trim().toLocaleLowerCase("vi-VN");
  return QC_BUFFER_TYPES.has(normalized);
}

export function resolveOutboundLocationLogicType(
  details?: Record<string, unknown> | null,
): OutboundLocationLogicType {
  return isQcBufferType(details?.type) ? "qc_buffer" : "outbound_buffer";
}

/**
 * Manual warehouse → always zone_outbound.
 * Auto + Tuyển chọn / Lấy lỗi / Lấy lẻ → zone_qc.
 */
export function resolveOutboundLocationLogicTypeForOrder(
  orderDetails?: Record<string, unknown> | null,
  lineDetails?: Array<{ details?: Record<string, unknown> }>,
  warehouseOutboundType: WarehouseOperationType = "auto",
): OutboundLocationLogicType {
  if (warehouseOutboundType === "manual") {
    return "outbound_buffer";
  }

  if (resolveOutboundLocationLogicType(orderDetails) === "qc_buffer") {
    return "qc_buffer";
  }
  if (
    lineDetails?.some(
      (line) => resolveOutboundLocationLogicType(line.details) === "qc_buffer",
    )
  ) {
    return "qc_buffer";
  }
  return "outbound_buffer";
}
