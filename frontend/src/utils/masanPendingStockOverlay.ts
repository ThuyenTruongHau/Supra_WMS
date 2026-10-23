import type {
  MasanPendingAllocationWithCc,
  MasanSortingZonePendingAllocationRow,
  MasanSortingZonePendingStockResponse,
} from "@/types/masan";
import { formatSortingCellLabel } from "./sortingStationOverlay.ts";
import { toDisplayInteger } from "./number.ts";

export function normalizePendingLocationId(
  id: number | string | null | undefined,
): number | null {
  if (id == null) return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Redis vẫn giữ allocation đã xác nhận — không hiển thị trên map/sidebar. */
const PENDING_STOCK_TERMINAL_STATUSES = new Set(["completed", "confirmed"]);

export function hasPendingStockQuantity(
  row: MasanSortingZonePendingAllocationRow,
): boolean {
  return (row.quantity ?? 0) > 0;
}

function normalizePendingStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

/** Hàng còn chờ operator (stock_ready / pre_completed). */
export function isDisplayablePendingStockAllocation(
  row: MasanSortingZonePendingAllocationRow,
): boolean {
  if (!hasPendingStockQuantity(row)) return false;
  const status = normalizePendingStatus(row.status);
  if (PENDING_STOCK_TERMINAL_STATUSES.has(status)) return false;
  return true;
}

/** Chỉ allocation robot đã đưa tới VT, chờ xác nhận lấy. */
export function isConfirmablePendingStockAllocation(
  row: MasanSortingZonePendingAllocationRow,
): boolean {
  return (
    isDisplayablePendingStockAllocation(row) &&
    normalizePendingStatus(row.status) === "pre_completed"
  );
}

export function allocationMatchesVtDestination(
  row: MasanSortingZonePendingAllocationRow,
  vtLocationId: number,
): boolean {
  const dest = normalizePendingLocationId(row.to_location_id);
  const vt = normalizePendingLocationId(vtLocationId);
  return dest != null && vt != null && dest === vt;
}

function flattenPendingAllocationsWithFilter(
  data: MasanSortingZonePendingStockResponse | undefined,
  ccLocationIdToCode: Map<number, string> | undefined,
  includeAllocation: (
    row: MasanSortingZonePendingAllocationRow,
  ) => boolean,
): MasanPendingAllocationWithCc[] {
  const rows: MasanPendingAllocationWithCc[] = [];
  if (!data?.locations) return rows;

  for (const loc of data.locations) {
    for (const allocation of loc.allocations ?? []) {
      if (!includeAllocation(allocation)) continue;
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

/** Map / sidebar / VT — ẩn completed & confirmed. */
export function flattenPendingAllocations(
  data: MasanSortingZonePendingStockResponse | undefined,
  ccLocationIdToCode?: Map<number, string>,
): MasanPendingAllocationWithCc[] {
  return flattenPendingAllocationsWithFilter(
    data,
    ccLocationIdToCode,
    isDisplayablePendingStockAllocation,
  );
}

export type PendingCcLocationClickMatch = {
  /** Mã ô trên map (`location_code` từ click). */
  locationCode?: string | null;
  /** Nhãn ô CC (`location_name` / tên hiển thị). */
  locationName?: string | null;
};

function pendingCcBucketMatchesClick(
  loc: { location_id: number; location_name: string | null },
  ccLocationId: number,
  ccLocationIdToCode: Map<number, string> | undefined,
  match?: PendingCcLocationClickMatch,
): boolean {
  if (loc.location_id === ccLocationId) return true;

  const codeNorm = (match?.locationCode ?? "").trim();
  if (codeNorm) {
    const bucketCode = ccLocationIdToCode?.get(loc.location_id)?.trim() ?? "";
    if (bucketCode && bucketCode === codeNorm) return true;
  }

  const nameNorm = (match?.locationName ?? "").trim().toLowerCase();
  if (nameNorm) {
    const bucketName = (loc.location_name ?? "").trim().toLowerCase();
    if (bucketName && bucketName === nameNorm) return true;
  }

  return false;
}

function mapPendingAllocationAtCcBucket(
  allocation: MasanSortingZonePendingAllocationRow,
  loc: { location_id: number; location_name: string | null },
  ccLocationIdToCode?: Map<number, string>,
): MasanPendingAllocationWithCc {
  return {
    ...allocation,
    ccLocationId: loc.location_id,
    ccLocationName: loc.location_name ?? null,
    ccLocationCode: ccLocationIdToCode?.get(loc.location_id) ?? null,
  };
}

export function pendingAllocationsByLocationId(
  data: MasanSortingZonePendingStockResponse | undefined,
): Map<number, MasanSortingZonePendingAllocationRow[]> {
  const map = new Map<number, MasanSortingZonePendingAllocationRow[]>();
  if (!data?.locations) return map;
  for (const loc of data.locations) {
    const list = (loc.allocations ?? []).filter((a) =>
      isDisplayablePendingStockAllocation(a),
    );
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
    const vtId = normalizePendingLocationId(row.to_location_id);
    if (vtId == null) continue;
    const bucket = map.get(vtId) ?? [];
    bucket.push(row);
    map.set(vtId, bucket);
  }
  return map;
}

/** Allocation chờ lấy có đích ``to_location_id`` = VT đang chọn. */
export function pendingAllocationsForVtLocationId(
  data: MasanSortingZonePendingStockResponse | undefined,
  vtLocationId: number,
  ccLocationIdToCode?: Map<number, string>,
): MasanPendingAllocationWithCc[] {
  return flattenPendingAllocations(data, ccLocationIdToCode).filter(
    (row) =>
      allocationMatchesVtDestination(row, vtLocationId) &&
      isConfirmablePendingStockAllocation(row),
  );
}

function skuLabelForAllocation(row: MasanSortingZonePendingAllocationRow): string {
  const sku = row.sku != null ? String(row.sku).trim() : "";
  if (sku) return sku;
  return `#${row.item_stock_id}`;
}

/** Lô cũ nhất (phần tử cuối trong danh sách BE/Redis). */
export function pickOldestPendingAllocation(
  allocations: MasanSortingZonePendingAllocationRow[],
): MasanSortingZonePendingAllocationRow | null {
  const rows = allocations.filter((a) => isDisplayablePendingStockAllocation(a));
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

/** Một allocation đại diện (cũ nhất) trên ô CC. */
export function buildCcPendingStockOverlays(
  data: MasanSortingZonePendingStockResponse | undefined,
  ccLocationIdToCode: Map<number, string>,
): Record<string, string> {
  const buckets = new Map<number, MasanSortingZonePendingAllocationRow[]>();
  if (!data?.locations) return {};

  for (const loc of data.locations) {
    const allocations = (loc.allocations ?? []).filter((a) =>
      isDisplayablePendingStockAllocation(a),
    );
    if (allocations.length > 0) {
      buckets.set(loc.location_id, allocations);
    }
  }
  return ccOverlayFromAllocationBuckets(buckets, ccLocationIdToCode);
}

/** Overlay CC: allocation có đích ``vtLocationId`` (khi chọn VT trên Monitor). */
export function buildCcPendingStockOverlaysForVt(
  data: MasanSortingZonePendingStockResponse | undefined,
  vtLocationId: number,
  ccLocationIdToCode: Map<number, string>,
): Record<string, string> {
  const buckets = new Map<number, MasanSortingZonePendingAllocationRow[]>();
  for (const row of flattenPendingAllocations(data, ccLocationIdToCode)) {
    if (!allocationMatchesVtDestination(row, vtLocationId)) continue;
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
    if (!allocationMatchesVtDestination(row, vtLocationId)) continue;
    const code = row.ccLocationCode?.trim();
    if (code) codes.add(code);
  }
  return [...codes];
}

/** Một allocation đại diện trên ô VT; kèm MORE nếu nhiều dòng gom VT. */
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

/** Overlay map: chỉ ô CC. VT dùng tồn API map status. */
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

/**
 * Allocation trong bucket GET pending-stock cho ô CC vừa click.
 * Đọc trực tiếp `locations[].allocations` (mirror API), khớp id / mã map / `location_name`.
 */
export function pendingAllocationsForCcLocationId(
  data: MasanSortingZonePendingStockResponse | undefined,
  ccLocationId: number,
  ccLocationIdToCode?: Map<number, string>,
  match?: PendingCcLocationClickMatch,
): MasanPendingAllocationWithCc[] {
  if (!data?.locations?.length) return [];

  const rows: MasanPendingAllocationWithCc[] = [];
  const seenAllocationIds = new Set<number>();

  for (const loc of data.locations) {
    if (
      !pendingCcBucketMatchesClick(
        loc,
        ccLocationId,
        ccLocationIdToCode,
        match,
      )
    ) {
      continue;
    }
    for (const allocation of loc.allocations ?? []) {
      const allocId = allocation.id;
      if (typeof allocId === "number" && seenAllocationIds.has(allocId)) {
        continue;
      }
      if (typeof allocId === "number") {
        seenAllocationIds.add(allocId);
      }
      rows.push(mapPendingAllocationAtCcBucket(allocation, loc, ccLocationIdToCode));
    }
  }

  return rows;
}

/** Allocation `pre_completed` thuộc đúng ô CC; tùy chọn thu hẹp theo VT đích. */
export function confirmableAllocationsForCcLocationId(
  data: MasanSortingZonePendingStockResponse | undefined,
  ccLocationId: number,
  ccLocationIdToCode?: Map<number, string>,
  match?: PendingCcLocationClickMatch,
  vtLocationId?: number | null,
): MasanPendingAllocationWithCc[] {
  return pendingAllocationsForCcLocationId(
    data,
    ccLocationId,
    ccLocationIdToCode,
    match,
  ).filter((row) => {
    if (!isConfirmablePendingStockAllocation(row)) return false;
    if (vtLocationId != null) {
      return allocationMatchesVtDestination(row, vtLocationId);
    }
    return true;
  });
}

export function mergePendingStockOverlays(
  base: Record<string, string>,
  pendingOverlays: Record<string, string>,
): Record<string, string> {
  if (Object.keys(pendingOverlays).length === 0) return base;
  return { ...base, ...pendingOverlays };
}

/** Mã ô VT có hàng trong pending-stock. */
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
