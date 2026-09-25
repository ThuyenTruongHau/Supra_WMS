import type { LotNumberValidationOptions } from "@/utils/lotNumberValidation";

export type WarehouseOperationType = "manual" | "auto";

function parseWarehouseIds(raw: string | undefined): number[] {
  if (!raw?.trim()) return [];

  const trimmed = raw.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map(Number).filter((id) => !Number.isNaN(id));
    }
  } catch {
    // Fallback: comma-separated values, e.g. "2,3"
  }

  return trimmed
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((id) => !Number.isNaN(id));
}

export const INBOUND_MANUAL_WAREHOUSE_IDS = parseWarehouseIds(
  import.meta.env.VITE_INBOUND_MANUAL_WAREHOUSES,
);

export const OUTBOUND_MANUAL_WAREHOUSE_IDS = parseWarehouseIds(
  import.meta.env.VITE_OUTBOUND_MANUAL_WAREHOUSES,
);

export let INBOUND_TYPE: WarehouseOperationType = "auto";
export let OUTBOUND_TYPE: WarehouseOperationType = "auto";

export function resolveInboundType(warehouseId: number): WarehouseOperationType {
  return INBOUND_MANUAL_WAREHOUSE_IDS.includes(warehouseId) ? "manual" : "auto";
}

/** Kho manual: FE chỉ bắt buộc nhập; kho auto: FE kiểm tra định dạng legacy. BE luôn chấp nhận raw nếu client gửi. */
export function resolveInboundLotValidation(
  warehouseId: number,
): LotNumberValidationOptions {
  return resolveInboundType(warehouseId) === "manual"
    ? { required: true, format: "any" }
    : { required: true, format: "legacy" };
}

export function resolveOutboundType(
  warehouseId: number,
): WarehouseOperationType {
  return OUTBOUND_MANUAL_WAREHOUSE_IDS.includes(warehouseId)
    ? "manual"
    : "auto";
}

export function syncWarehouseOperationTypes(warehouseId: number) {
  INBOUND_TYPE = resolveInboundType(warehouseId);
  OUTBOUND_TYPE = resolveOutboundType(warehouseId);
}

/** Kho manual dùng nhãn QR thuần (30×50mm); kho auto dùng phiếu Bacviet có dòng ghi tay. */
export function isManualPrintWarehouse(warehouseId: number): boolean {
  return OUTBOUND_MANUAL_WAREHOUSE_IDS.includes(warehouseId);
}

export const QR_PRINT_LABELS_PER_PAGE_AUTO = 9;
export const QR_PRINT_LABELS_PER_PAGE_MANUAL = 30;

export function resolveQrPrintLabelsPerPage(warehouseId: number): number {
  return isManualPrintWarehouse(warehouseId)
    ? QR_PRINT_LABELS_PER_PAGE_MANUAL
    : QR_PRINT_LABELS_PER_PAGE_AUTO;
}
