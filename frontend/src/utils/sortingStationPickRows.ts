import type {
  SortingStationAssignment,
  SortingStationFillStation,
} from "@/types/outbound";
import { formatSortingCellLabel } from "@/utils/sortingStationOverlay";
import type { WarehouseLocation } from "@/types/warehouseLocation";
import { toDisplayInteger } from "@/utils/number";

/** Khóa lưu SL đã lấy theo ô (chia theo xe — không theo KH). */
export const STATION_PICK_TOTAL_KEY = "__total__";

export type StationPickConfirm = Record<string, number>;

export const EMPTY_STATION_PICK_CONFIRM: StationPickConfirm = {};

export type VehiclePickSummary = {
  plateHeader: string | null;
  totalQuantity: number;
  productSku: string;
  productName: string;
};

function collectFillLines(
  assignment: SortingStationAssignment | null,
  fillStation: SortingStationFillStation | null | undefined,
) {
  return (
    (fillStation?.lines?.length ? fillStation.lines : null) ??
    assignment?.fill_lines ??
    []
  );
}

function sumPreviousPicks(previousPicks: StationPickConfirm): number {
  const direct = previousPicks[STATION_PICK_TOTAL_KEY];
  if (direct != null && direct > 0) return direct;
  return Object.values(previousPicks).reduce((sum, qty) => sum + qty, 0);
}

export function buildVehiclePickSummary(
  assignment: SortingStationAssignment | null,
  fillStation: SortingStationFillStation | null | undefined,
): VehiclePickSummary {
  const lines = collectFillLines(assignment, fillStation);
  const vehicles = new Set<string>();
  let totalQty = Number(fillStation?.fill_total_quantity || 0);
  let productSku = "—";
  let productName = "—";

  for (const line of lines) {
    if (totalQty <= 0) totalQty += Number(line.quantity || 0);
    const plate = (line.vehicle_number || "").trim();
    if (plate) vehicles.add(plate);
    const sku = (line.product_sku || "").trim();
    const name = (line.product_name || "").trim();
    if (sku) productSku = sku;
    if (name) productName = name;
  }

  for (const detail of assignment?.details ?? []) {
    const plate = (detail.vehicle_number || "").trim();
    if (plate) vehicles.add(plate);
  }

  let plateHeader: string | null = null;
  if (vehicles.size === 1) plateHeader = [...vehicles][0];
  else if (vehicles.size > 1) plateHeader = `${vehicles.size} xe`;
  else plateHeader = assignment?.display_label?.trim() || null;

  return {
    plateHeader,
    totalQuantity: totalQty,
    productSku,
    productName,
  };
}

export function buildVehiclePickWithRemaining(
  assignment: SortingStationAssignment | null,
  fillStation: SortingStationFillStation | null | undefined,
  previousPicks: StationPickConfirm = EMPTY_STATION_PICK_CONFIRM,
): VehiclePickSummary & { remainingQuantity: number } {
  const summary = buildVehiclePickSummary(assignment, fillStation);
  const picked = sumPreviousPicks(previousPicks);
  return {
    ...summary,
    remainingQuantity: Math.max(0, summary.totalQuantity - picked),
  };
}

export function resolveStationPlateHeader(
  assignment: SortingStationAssignment | null,
  fillStation: SortingStationFillStation | null | undefined,
): string | null {
  return buildVehiclePickSummary(assignment, fillStation).plateHeader;
}

export function applyConfirmedPicksToOverlayLabels(
  labels: Record<string, string>,
  fillStations: SortingStationFillStation[],
  confirmedByStation: Record<string, StationPickConfirm>,
  locationByCode: Record<string, WarehouseLocation> = {},
): Record<string, string> {
  const next = { ...labels };

  for (const [locationCode, picks] of Object.entries(confirmedByStation)) {
    const fillStation = fillStations.find((s) => s.location_code === locationCode);
    const summary = buildVehiclePickSummary(null, fillStation);
    if (summary.totalQuantity <= 0) continue;

    const picked = sumPreviousPicks(picks);
    const remaining = Math.max(0, summary.totalQuantity - picked);

    if (remaining <= 0) {
      next[locationCode] = "Đã lấy đủ";
      continue;
    }

    const existingLines = (labels[locationCode] || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const plateLine =
      existingLines.find(
        (line) => !line.startsWith("SL:") && !/^B[PX]|^CX|^VTC/i.test(line),
      ) ||
      summary.plateHeader ||
      "";

    const detailLines: string[] = [];
    if (plateLine) detailLines.push(plateLine);
    detailLines.push(`SL: ${toDisplayInteger(remaining)}`);
    next[locationCode] = formatSortingCellLabel(detailLines);
  }

  return next;
}
