import { getMasanCcLocationApi } from "@/api/masan";
import type {
  MasanCcLocationLine,
  MasanCcLocationResponse,
  MasanPendingAllocationWithCc,
  MasanSortingZoneCcLocationRow,
  MasanSortingZonePendingStockResponse,
} from "@/types/masan";
import {
  pendingAllocationsForCcLocationId,
  type PendingCcLocationClickMatch,
} from "@/utils/masanPendingStockOverlay";

export type MasanMapOverlayRefreshResult = {
  ccLocations?: MasanSortingZoneCcLocationRow[];
  pendingStock?: MasanSortingZonePendingStockResponse;
};

export function ccLocationLinesFromPendingStock(
  pendingStock: MasanSortingZonePendingStockResponse | undefined,
  ccLocationId: number,
  ccLocationIdToCode?: Map<number, string>,
  match?: PendingCcLocationClickMatch,
): MasanCcLocationLine[] {
  const allocations = pendingAllocationsForCcLocationId(
    pendingStock,
    ccLocationId,
    ccLocationIdToCode,
    match,
  );
  return pendingAllocationsToCcLines(allocations);
}

export function pendingAllocationsToCcLines(
  allocations: MasanPendingAllocationWithCc[],
): MasanCcLocationLine[] {
  return allocations.map((row) => ({
    detail_id: row.outbound_order_detail_id,
    outbound_order_id: row.outbound_order_id ?? 0,
    item_id: row.item_id ?? 0,
    quantity: row.quantity ?? 0,
    unit: row.unit ?? null,
    detail_type: row.detail_type ?? "outbound",
    vehicle_no: row.vehicle_no ?? null,
    customer_name: row.customer_name ?? null,
    sku: row.sku ?? null,
    trip: row.trip ?? null,
    nvt: row.nvt ?? null,
    lot_number: row.lot_number ?? row.locator ?? null,
    pallet_count: row.pallet_count ?? null,
    status: row.status ?? null,
    allocation_id: row.id,
  }));
}

function combineAssignCacheLines(
  ...sources: (MasanCcLocationLine[] | undefined)[]
): MasanCcLocationLine[] {
  const byDetailId = new Map<number, MasanCcLocationLine>();
  for (const list of sources) {
    for (const line of list ?? []) {
      const existing = byDetailId.get(line.detail_id);
      if (!existing) {
        byDetailId.set(line.detail_id, line);
        continue;
      }
      byDetailId.set(line.detail_id, mergeAssignLineMetadata(existing, line));
    }
  }
  return [...byDetailId.values()];
}

function hasDisplayValue(value: string | number | null | undefined): boolean {
  return value != null && String(value).trim() !== "";
}

function pickDisplayField<T extends string | number | null | undefined>(
  primary: T,
  fallback: T,
): T {
  return hasDisplayValue(primary) ? primary : fallback;
}

function mergeAssignLineMetadata(
  a: MasanCcLocationLine,
  b: MasanCcLocationLine,
): MasanCcLocationLine {
  return {
    ...a,
    customer_name: pickDisplayField(a.customer_name, b.customer_name),
    vehicle_no: pickDisplayField(a.vehicle_no, b.vehicle_no),
    trip: pickDisplayField(a.trip, b.trip),
    nvt: pickDisplayField(a.nvt, b.nvt),
    unit: pickDisplayField(a.unit, b.unit),
    pallet_count: pickDisplayField(a.pallet_count, b.pallet_count),
    sku: pickDisplayField(a.sku, b.sku),
    lot_number: pickDisplayField(a.lot_number, b.lot_number),
    outbound_order_id: a.outbound_order_id || b.outbound_order_id,
    item_id: a.item_id || b.item_id,
    detail_type: a.detail_type ?? b.detail_type,
  };
}

export function mergeCcLocationResponseWithPendingLines(
  api: MasanCcLocationResponse,
  pendingLines: MasanCcLocationLine[],
  extraAssignLines?: MasanCcLocationLine[],
): MasanCcLocationResponse {
  if (pendingLines.length === 0) {
    return api;
  }
  const assignLines = combineAssignCacheLines(api.lines, extraAssignLines);
  const enriched = enrichPendingCcLinesFromAssignCache(
    pendingLines,
    assignLines,
    api.vehicle_number,
  );
  return {
    ...api,
    assigned: true,
    lines: enriched,
  };
}

function enrichPendingCcLinesFromAssignCache(
  pendingLines: MasanCcLocationLine[],
  assignLines: MasanCcLocationLine[],
  bucketVehicleNumber?: string | null,
): MasanCcLocationLine[] {
  const byDetailId = new Map<number, MasanCcLocationLine>();
  for (const line of assignLines) {
    byDetailId.set(line.detail_id, line);
  }
  const headerVehicle = (bucketVehicleNumber ?? "").trim() || null;
  return pendingLines.map((pending) => {
    const cached = byDetailId.get(pending.detail_id);
    if (!cached) {
      if (!headerVehicle || hasDisplayValue(pending.vehicle_no)) {
        return pending;
      }
      return { ...pending, vehicle_no: headerVehicle };
    }
    return {
      ...cached,
      quantity: pending.quantity,
      status: pending.status ?? cached.status,
      allocation_id: pending.allocation_id,
      sku: pickDisplayField(pending.sku, cached.sku),
      lot_number: pickDisplayField(pending.lot_number, cached.lot_number),
      customer_name: pickDisplayField(pending.customer_name, cached.customer_name),
      vehicle_no: pickDisplayField(
        pending.vehicle_no,
        pickDisplayField(cached.vehicle_no, headerVehicle),
      ),
      trip: pickDisplayField(pending.trip, cached.trip),
      nvt: pickDisplayField(pending.nvt, cached.nvt),
      unit: pickDisplayField(pending.unit, cached.unit),
      pallet_count: pickDisplayField(pending.pallet_count, cached.pallet_count),
      outbound_order_id: cached.outbound_order_id || pending.outbound_order_id,
      item_id: cached.item_id || pending.item_id,
      detail_type: cached.detail_type ?? pending.detail_type,
    };
  });
}

export function ccLocationResponseFromPendingAndCache(
  warehouseId: number,
  locationId: number,
  locationName: string,
  pendingLines: MasanCcLocationLine[],
  cachedRow?: MasanSortingZoneCcLocationRow | null,
  ccBucketZoneCode?: string | null,
): MasanCcLocationResponse {
  const vehicle_number = cachedRow?.vehicle_number ?? null;
  const lines = enrichPendingCcLinesFromAssignCache(
    pendingLines,
    cachedRow?.lines ?? [],
    vehicle_number,
  );
  return {
    warehouse_id: warehouseId,
    location_id: locationId,
    assigned: cachedRow?.assigned ?? pendingLines.length > 0,
    location_name: cachedRow?.location_name ?? locationName,
    zone: cachedRow?.zone ?? ccBucketZoneCode ?? null,
    vehicle_number,
    lines,
  };
}

/** Bảng chi tiết CC: pending-stock (đủ dòng) + enrich từ GET cc-locations. */
export async function loadCcLocationModalData(params: {
  warehouseId: number;
  locationId: number;
  locationCode: string;
  locationName: string;
  pendingStock?: MasanSortingZonePendingStockResponse;
  ccLocationIdToCode?: Map<number, string>;
  cachedRow?: MasanSortingZoneCcLocationRow | null;
  ccBucketZoneCode?: string | null;
}): Promise<MasanCcLocationResponse> {
  const match: PendingCcLocationClickMatch = {
    locationCode: params.locationCode,
    locationName: params.locationName,
  };
  const pendingLines = ccLocationLinesFromPendingStock(
    params.pendingStock,
    params.locationId,
    params.ccLocationIdToCode,
    match,
  );
  const fallback = ccLocationResponseFromPendingAndCache(
    params.warehouseId,
    params.locationId,
    params.locationName,
    pendingLines,
    params.cachedRow,
    params.ccBucketZoneCode,
  );

  try {
    const api = await getMasanCcLocationApi(
      params.warehouseId,
      params.locationId,
    );
    if (pendingLines.length === 0) {
      return api;
    }
    return mergeCcLocationResponseWithPendingLines(
      api,
      pendingLines,
      params.cachedRow?.lines,
    );
  } catch {
    if (pendingLines.length > 0) {
      return fallback;
    }
    throw new Error("Không tải được hàng đã chia của ô");
  }
}
