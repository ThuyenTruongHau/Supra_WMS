import type { ItemOutbound } from "@/types/outbound";

export function resolveTotalAndPalletCount(
  requestedQuantity: number,
  palletQuantity: number | null | undefined,
): { totalQuantity: number; palletCount: number } {
  let totalQuantity = Math.trunc(requestedQuantity);
  let palletCount = Math.max(1, palletQuantity ?? 1);

  // Trường hợp nhập ngược: SL=2, pallet=120 (đúng ra tổng SL=120, 2 pallet)
  if (palletCount > totalQuantity && totalQuantity > 0) {
    [totalQuantity, palletCount] = [palletCount, totalQuantity];
  }

  return { totalQuantity, palletCount };
}

export function effectivePalletQuantity(
  value: number | null | undefined,
): number {
  return value != null && Number(value) > 0 ? Number(value) : 1;
}

export function sumItemPallets(items: ItemOutbound[]): number {
  return items.reduce(
    (sum, item) => sum + effectivePalletQuantity(item.pallet_quantity),
    0,
  );
}
