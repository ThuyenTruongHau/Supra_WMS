/**
 * Cấu hình tính năng "Hàng lẻ" (lấy lẻ) trên QrTablet nhập kho.
 *
 * Luồng chung:
 * 1. Quét QR → API preview trả `qr_type`
 * 2. Nếu kho + loại phiếu khớp config → gọi API tồn hàng lẻ → modal preview (nếu có)
 * 3. Form hiện checkbox; đơn vị "cái" → tự tick, đổi đơn vị khác → bỏ tick
 */

import type { WarehouseOperationType } from "@/config/warehouseMode";

/** Kho áp dụng checkbox hàng lẻ. */
export const SPLIT_PRODUCT_WAREHOUSE_TYPES = ["auto"] as const satisfies readonly WarehouseOperationType[];

/** Loại phiếu QR áp dụng (backend qr_type). */
export const SPLIT_PRODUCT_QR_TYPES = ["item", "pack"] as const;

export type SplitProductQrType = (typeof SPLIT_PRODUCT_QR_TYPES)[number];

export function normalizeSplitProductQrType(
  qrType: string | null | undefined,
): string {
  return (qrType ?? "item").trim().toLowerCase();
}

export function isSplitProductWarehouse(
  inboundType: string | null | undefined,
): boolean {
  return (SPLIT_PRODUCT_WAREHOUSE_TYPES as readonly string[]).includes(
    inboundType ?? "",
  );
}

export function isSplitProductQrType(
  qrType: string | null | undefined,
): boolean {
  return (SPLIT_PRODUCT_QR_TYPES as readonly string[]).includes(
    normalizeSplitProductQrType(qrType),
  );
}

export type SplitProductToggleContext = {
  inboundType: string | null | undefined;
  previewQrType: string | null | undefined;
  /** Bước chọn người đóng gói — chưa có form sản phẩm đầy đủ. */
  isPackerItemPicker: boolean;
};

/** Hiện checkbox "Hàng lẻ" trên form sau preview. */
export function shouldShowSplitProductToggle(
  ctx: SplitProductToggleContext,
): boolean {
  if (ctx.isPackerItemPicker) return false;
  return (
    isSplitProductWarehouse(ctx.inboundType) &&
    isSplitProductQrType(ctx.previewQrType)
  );
}

export type SplitStockGatePreview = {
  item_id?: number | null;
  qr_type?: string | null;
};

/**
 * Sau API preview: có cần gọi GET /item-stocks/split và hiện modal hàng lẻ không.
 */
export function shouldRunSplitStockGate(
  inboundType: string | null | undefined,
  preview: SplitStockGatePreview | null | undefined,
): boolean {
  if (preview?.item_id == null) return false;
  return (
    isSplitProductWarehouse(inboundType) &&
    isSplitProductQrType(preview.qr_type)
  );
}

/** Giá trị `is_split` gửi lên API khi submit (undefined = không gửi). */
export function splitProductSubmitFlag(
  ctx: SplitProductToggleContext,
  checked: boolean,
): boolean | undefined {
  if (!shouldShowSplitProductToggle(ctx)) return undefined;
  return checked || undefined;
}
