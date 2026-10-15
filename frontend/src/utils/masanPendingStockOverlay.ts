import type {
  MasanPendingAllocationWithCc,
  MasanSortingZonePendingAllocationRow,
  MasanSortingZonePendingStockResponse,
} from "@/types/masan";
import { formatSortingCellLabel } from "@/utils/sortingStationOverlay";
import { toDisplayInteger } from "@/utils/number";

export function flattenPendingAllocations(
  data: MasanSortingZonePendingStockResponse | undefined,
  ccLocationIdToCode?: Map<number, string>,
): MasanPendingAllocationWithCc[] {
  const rows: MasanPendingAllocationWithCc[] = [];
  if (!data?.locations) return rows;

  for (const loc of data.locations) {
    for (const allocation of loc.allocations ?? []) {
      if ((allocation.quantity ?? 0) <= 0) continue;
      rows.push({
        ...allocation,
        ccLocationId: loc.location_id,
        ccLocationName: loc.location_name ?? null,
        ccLocationCode: ccLocationIdToCode?.get(loc.location_id) ?? null,
      });
    }
  }
  return rows;
}

export function pendingAllocationsByLocationId(
  data: MasanSortingZonePendingStockResponse | undefined,
): Map<number, MasanSortingZonePendingAllocationRow[]> {
  const map = new Map<number, MasanSortingZonePendingAllocationRow[]>();
  if (!data?.locations) return map;
  for (const loc of data.locations) {
    const list = (loc.allocations ?? []).filter((a) => (a.quantity ?? 0) > 0);
    if (list.length > 0) {
      map.set(loc.location_id, list);
    }
  }
  return map;
}

export function pendingAllocationsByToLocationId(
  data: MasanSortingZonePendingStockResponse | undefined,
  ccLocationIdToCode?: Map<number, string>,
): Map<number, MasanPendingAllocationWithCc[]> {
  const map = new Map<number, MasanPendingAllocationWithCc[]>();
  for (const row of flattenPendingAllocations(data, ccLocationIdToCode)) {
    const vtId = row.to_location_id;
    if (vtId == null || vtId <= 0) continue;
    const bucket = map.get(vtId) ?? [];
    bucket.push(row);
    map.set(vtId, bucket);
  }
  return map;
}

function skuLabelForAllocation(row: MasanSortingZonePendingAllocationRow): string {
  const sku = row.sku != null ? String(row.sku).trim() : "";
  if (sku) return sku;
  return `#${row.item_stock_id}`;
}

/** Lô chờ xác nhận cũ nhất (phần tử cuối trong danh sách BE/Redis). */
export function pickOldestPendingAllocation(
  allocations: MasanSortingZonePendingAllocationRow[],
): MasanSortingZonePendingAllocationRow | null {
  const rows = allocations.filter((a) => (a.quantity ?? 0) > 0);
  if (rows.length === 0) return null;
  return rows[rows.length - 1] ?? null;
}

function ccOverlayFromAllocationBuckets(
  buckets: Map<number, MasanSortingZonePendingAllocationRow[]>,
  ccLocationIdToCode: Map<number, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [locId, allocations] of buckets.entries()) {
    const code = ccLocationIdToCode.get(locId)?.trim();
    if (!code) continue;
    const primary = pickOldestPendingAllocation(allocations);
    if (!primary) continue;
    const detailLines = [
      `SKU::${skuLabelForAllocation(primary)}`,
      `SL::${toDisplayInteger(primary.quantity ?? 0)}`,
    ];
    const extraCount = allocations.length - 1;
    if (extraCount > 0) {
      detailLines.push(`MORE::+${extraCount}`);
    }
    out[code] = formatSortingCellLabel(detailLines);
  }
  return out;
}

/** Một allocation đại diện (cũ nhất) trên ô CC — giống commit view CC. */
export function buildCcPendingStockOverlays(
  data: MasanSortingZonePendingStockResponse | undefined,
  ccLocationIdToCode: Map<number, string>,
): Record<string, string> {
  const buckets = new Map<number, MasanSortingZonePendingAllocationRow[]>();
  if (!data?.locations) return {};

  for (const loc of data.locations) {
    const allocations = (loc.allocations ?? []).filter(
      (a) => (a.quantity ?? 0) > 0,
    );
    if (allocations.length > 0) {
      buckets.set(loc.location_id, allocations);
    }
  }
  return ccOverlayFromAllocationBuckets(buckets, ccLocationIdToCode);
}

/** Overlay CC chỉ allocation có đích ``vtLocationId`` (khi chọn VT trên Monitor). */
export function buildCcPendingStockOverlaysForVt(
  data: MasanSortingZonePendingStockResponse | undefined,
  vtLocationId: number,
  ccLocationIdToCode: Map<number, string>,
): Record<string, string> {
  const buckets = new Map<number, MasanSortingZonePendingAllocationRow[]>();
  for (const row of flattenPendingAllocations(data, ccLocationIdToCode)) {
    if (row.to_location_id !== vtLocationId) continue;
    const bucket = buckets.get(row.ccLocationId) ?? [];
    bucket.push(row);
    buckets.set(row.ccLocationId, bucket);
  }
  return ccOverlayFromAllocationBuckets(buckets, ccLocationIdToCode);
}

/** Mã ô CC có hàng stock_ready cho VT đích. */
export function ccLocationCodesForVt(
  data: MasanSortingZonePendingStockResponse | undefined,
  vtLocationId: number,
  ccLocationIdToCode: Map<number, string>,
): string[] {
  const codes = new Set<string>();
  for (const row of flattenPendingAllocations(data, ccLocationIdToCode)) {
    if (row.to_location_id !== vtLocationId) continue;
    const code = row.ccLocationCode?.trim();
    if (code) codes.add(code);
  }
  return [...codes];
}

/** Một allocation đại diện trên ô VT (confirm); kèm MORE nếu nhiều dòng gom VT. */
export function buildVtPendingStockOverlays(
  data: MasanSortingZonePendingStockResponse | undefined,
  vtLocationIdToCode: Map<number, string>,
  ccLocationIdToCode?: Map<number, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const byVt = pendingAllocationsByToLocationId(data, ccLocationIdToCode);

  for (const [vtId, allocations] of byVt.entries()) {
    const code = vtLocationIdToCode.get(vtId)?.trim();
    if (!code) continue;
    const primary = pickOldestPendingAllocation(allocations);
    if (!primary) continue;

    const detailLines = [
      `SKU::${skuLabelForAllocation(primary)}`,
      `SL::${toDisplayInteger(primary.quantity ?? 0)}`,
    ];
    const extraCount = allocations.length - 1;
    if (extraCount > 0) {
      detailLines.push(`MORE::+${extraCount}`);
    }
    out[code] = formatSortingCellLabel(detailLines);
  }
  return out;
}

/** Overlay map: chỉ ô CC (stock_ready / hàng cần lấy). VT dùng tồn API map status. */
export function buildPendingStockMapOverlays(
  data: MasanSortingZonePendingStockResponse | undefined,
  _vtLocationIdToCode: Map<number, string>,
  ccLocationIdToCode: Map<number, string>,
): Record<string, string> {
  return buildCcPendingStockOverlays(data, ccLocationIdToCode);
}

/** @deprecated Dùng buildPendingStockMapOverlays hoặc buildVtPendingStockOverlays */
export function buildPendingStockOverlays(
  data: MasanSortingZonePendingStockResponse | undefined,
  vtLocationIdToCode: Map<number, string>,
  ccLocationIdToCode?: Map<number, string>,
): Record<string, string> {
  const ccMap = ccLocationIdToCode ?? new Map<number, string>();
  return buildPendingStockMapOverlays(data, vtLocationIdToCode, ccMap);
}

export function pendingAllocationsForCcLocationId(
  data: MasanSortingZonePendingStockResponse | undefined,
  ccLocationId: number,
  ccLocationIdToCode?: Map<number, string>,
): MasanPendingAllocationWithCc[] {
  return flattenPendingAllocations(data, ccLocationIdToCode).filter(
    (row) => row.ccLocationId === ccLocationId,
  );
}

export function mergePendingStockOverlays(
  base: Record<string, string>,
  pendingOverlays: Record<string, string>,
): Record<string, string> {
  if (Object.keys(pendingOverlays).length === 0) return base;
  return { ...base, ...pendingOverlays };
}

/** Mã ô VT có hàng chờ xác nhận (overlay từ pending-stock). */
export function pendingConfirmOverlayCodes(
  data: MasanSortingZonePendingStockResponse | undefined,
  vtLocationIdToCode: Map<number, string>,
  ccLocationIdToCode?: Map<number, string>,
): Set<string> {
  const codes = new Set<string>();
  const byVt = pendingAllocationsByToLocationId(data, ccLocationIdToCode);
  for (const vtId of byVt.keys()) {
    const code = vtLocationIdToCode.get(vtId)?.trim();
    if (code) codes.add(code);
  }
  return codes;
}

export function ccLabelForPendingRow(row: MasanPendingAllocationWithCc): string {
  const name = (row.ccLocationName ?? "").trim();
  if (name) return name;
  const code = (row.ccLocationCode ?? "").trim();
  if (code) return code;
  return `#${row.ccLocationId}`;
}
