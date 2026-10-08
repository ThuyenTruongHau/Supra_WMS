import type {
  MasanSortingZonePendingAllocationRow,
  MasanSortingZonePendingStockResponse,
} from "@/types/masan";
import { formatSortingCellLabel } from "@/utils/sortingStationOverlay";
import { toDisplayInteger } from "@/utils/number";

export function pendingAllocationsByLocationId(
  data: MasanSortingZonePendingStockResponse | undefined,
): Map<number, MasanSortingZonePendingAllocationRow[]> {
  const map = new Map<number, MasanSortingZonePendingAllocationRow[]>();
  if (!data?.locations) return map;
  for (const loc of data.locations) {
    const rows = (loc.allocations ?? []).filter(
      (a) => (a.quantity ?? 0) > 0,
    );
    if (rows.length > 0) {
      map.set(loc.location_id, rows);
    }
  }
  return map;
}

function skuLabelForAllocation(row: MasanSortingZonePendingAllocationRow): string {
  const sku = row.sku != null ? String(row.sku).trim() : "";
  if (sku) return sku;
  return `#${row.item_stock_id}`;
}

function uniqueSkuLabels(allocations: MasanSortingZonePendingAllocationRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of allocations) {
    const label = skuLabelForAllocation(row);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

export function buildPendingStockOverlays(
  data: MasanSortingZonePendingStockResponse | undefined,
  locationIdToCode: Map<number, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data?.locations) return out;

  for (const loc of data.locations) {
    const code = locationIdToCode.get(loc.location_id)?.trim();
    if (!code) continue;
    const allocations = (loc.allocations ?? []).filter(
      (a) => (a.quantity ?? 0) > 0,
    );
    if (allocations.length === 0) continue;

    let totalQty = 0;
    for (const a of allocations) {
      totalQty += Number(a.quantity || 0);
    }

    const skuLabels = uniqueSkuLabels(allocations);
    const skuHeader =
      skuLabels.length === 1
        ? skuLabels[0]
        : skuLabels.length > 1
          ? "Nhiều mã"
          : skuLabelForAllocation(allocations[0]);

    const detailLines = [
      `SKU::${skuHeader}`,
      `SL::${toDisplayInteger(totalQty)}`,
    ];
    out[code] = formatSortingCellLabel(detailLines);
  }
  return out;
}

export function mergePendingStockOverlays(
  base: Record<string, string>,
  pendingOverlays: Record<string, string>,
): Record<string, string> {
  if (Object.keys(pendingOverlays).length === 0) return base;
  return { ...base, ...pendingOverlays };
}

/** Mã ô map có hàng chờ xác nhận (overlay từ WS / pending-stock). */
export function pendingConfirmOverlayCodes(
  data: MasanSortingZonePendingStockResponse | undefined,
  locationIdToCode: Map<number, string>,
): Set<string> {
  const codes = new Set<string>();
  if (!data?.locations) return codes;
  for (const loc of data.locations) {
    const hasQty = (loc.allocations ?? []).some((a) => (a.quantity ?? 0) > 0);
    if (!hasQty) continue;
    const code = locationIdToCode.get(loc.location_id)?.trim();
    if (code) codes.add(code);
  }
  return codes;
}
