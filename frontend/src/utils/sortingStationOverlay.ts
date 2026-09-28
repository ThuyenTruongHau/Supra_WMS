import type {
  IncompleteVehicle,
  SortingStationFillStation,
} from "@/types/outbound";
import type { WarehouseLocation } from "@/types/warehouseLocation";
import { toDisplayInteger } from "@/utils/number";

export function formatSortingCellLabel(
  detailLines: string[],
): string {
  const parts: string[] = [];
  for (const line of detailLines) {
    const trimmed = (line || "").trim();
    if (!trimmed) continue;
    parts.push(trimmed);
  }
  return parts.join("\n");
}

export function enrichAssignmentLabels(
  labels: Record<string, string> | undefined,
  locationByCode: Record<string, WarehouseLocation>,
): Record<string, string> {
  if (!labels) return {};
  const out: Record<string, string> = {};
  for (const [code, text] of Object.entries(labels)) {
    const trimmed = (text || "").trim();
    if (!trimmed) continue;
    const isVTC = code.toUpperCase().startsWith("VTC") || code.toUpperCase().startsWith("CX");
    out[code] = formatSortingCellLabel([isVTC ? `SKU::${trimmed}` : `VEH::${trimmed}`]);
  }
  return out;
}

/** Label hiển thị trên ô map theo sorting_position đã gán (bin + xe). */
export function buildStationOverlayLabels(
  vehicles: IncompleteVehicle[],
  locationByCode: Record<string, WarehouseLocation> = {},
): Record<string, string> {
  const byPos = new Map<string, Set<string>>();

  for (const vehicle of vehicles) {
    for (const detail of vehicle.details) {
      const pos = (detail.sorting_position || "").trim();
      if (!pos) continue;
      const plates = byPos.get(pos) ?? new Set<string>();
      const plate = (detail.vehicle_number || "").trim();
      if (plate) plates.add(plate);
      byPos.set(pos, plates);
    }
  }

  const labels: Record<string, string> = {};
  for (const [pos, plates] of byPos) {
    const plateList = [...plates];
    let plateLine = "";
    if (plateList.length === 1) plateLine = plateList[0];
    else if (plateList.length > 1) plateLine = `${plateList.length} xe`;
    if (!plateLine && Object.keys(locationByCode).length === 0) continue;
    labels[pos] = formatSortingCellLabel(
      plateLine ? [`VEH::${plateLine}`] : [],
    );
  }
  return labels;
}

export function mergeStationOverlayLabels(
  assignLabels: Record<string, string>,
  fillStations: SortingStationFillStation[],
  locationByCode: Record<string, WarehouseLocation> = {},
): Record<string, string> {
  const merged = { ...assignLabels };
  for (const station of fillStations) {
    if (!station.has_fill) continue;
    const code = (station.location_code || "").trim();
    if (!code) continue;

    const vehicles = new Set<string>();
    const skus = new Set<string>();
    let totalQty = Number(station.fill_total_quantity || 0);
    for (const line of station.lines ?? []) {
      if (totalQty <= 0) totalQty += Number(line.quantity || 0);
      const plate = (line.vehicle_number || "").trim();
      if (plate) vehicles.add(plate);
      
      let sku = String(line.product_sku || line.product_name || "").trim();
      if (sku) skus.add(sku);
    }

    const plateHeader =
      vehicles.size === 1
        ? [...vehicles][0]
        : vehicles.size > 1
          ? `${vehicles.size} xe`
          : (merged[code] || "").split("\n").find(
              (line) => line.trim().startsWith("VEH::"),
            )?.replace(/^VEH::/, "").trim() || "";

    const skuHeader =
      skus.size === 1
        ? [...skus][0]
        : skus.size > 1
          ? "Nhiều mã"
          : "";

    if (totalQty <= 0 && !plateHeader && !skuHeader) continue;

    const detailLines: string[] = [];
    if (skuHeader) detailLines.push(`SKU::${skuHeader}`);
    if (totalQty > 0) detailLines.push(`SL::${toDisplayInteger(totalQty)}`);
    if (plateHeader) detailLines.push(`VEH::${plateHeader}`);
    merged[code] = formatSortingCellLabel(detailLines);
  }
  return merged;
}

/** Bổ sung nhãn tối thiểu (bin) cho mọi ô sorting của wave. */
export function ensureSortingStationLabels(
  labels: Record<string, string>,
  sortingCodes: string[],
  locationByCode: Record<string, WarehouseLocation>,
): Record<string, string> {
  const next = { ...labels };
  for (const code of sortingCodes) {
    if ((next[code] || "").trim()) continue;
    const formatted = formatSortingCellLabel([]);
    if (formatted) next[code] = formatted;
  }
  return next;
}
