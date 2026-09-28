import { DEMO_MASAN_PRODUCTS } from "@/data/demoMasanProducts";
import type { IncompleteVehicle, SortingStationFillStation } from "@/types/outbound";
import type { WarehouseLocation } from "@/types/warehouseLocation";
import { formatDisplayBin } from "@/utils/locationBin";
import { toDisplayInteger } from "@/utils/number";

/** Bật mô phỏng FE: 2 outbound station + sorting xung quanh (dev/demo). */
export const OUTBOUND_STATION_FE_SIM_ENABLED =
  import.meta.env.VITE_FE_OUTBOUND_STATION_SIM === "true";

const DEMO_PRODUCT = DEMO_MASAN_PRODUCTS[0];
const QTY_PER_OUTBOUND_STATION = 60;

export type OutboundStationFeSimulation = {
  overlayLabels: Record<string, string>;
  statusOverrideByCode: Record<string, string>;
  fillStations: SortingStationFillStation[];
  outboundStationCodes: string[];
  sortingStationCodes: string[];
  totalOutboundQuantity: number;
  productSku: string;
};

function locationCodesForIds(
  locationByCode: Record<string, WarehouseLocation>,
  ids: number[],
): string[] {
  const idSet = new Set(ids);
  return Object.values(locationByCode)
    .filter((loc) => idSet.has(loc.id))
    .sort((a, b) => {
      const rowA = (a.row || "").padStart(4, "0");
      const rowB = (b.row || "").padStart(4, "0");
      if (rowA !== rowB) return rowA.localeCompare(rowB);
      const colA = (a.column || "").padStart(4, "0");
      const colB = (b.column || "").padStart(4, "0");
      if (colA !== colB) return colA.localeCompare(colB);
      return a.location_code.localeCompare(b.location_code);
    })
    .map((loc) => loc.location_code);
}

function distributeQuantity(total: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  let remainder = total % parts;
  return Array.from({ length: parts }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (extra) remainder -= 1;
    return base + extra;
  });
}

function scaleQuantities(values: number[], targetTotal: number): number[] {
  if (values.length === 0) return [];
  const sum = values.reduce((acc, v) => acc + v, 0);
  if (sum <= 0) return distributeQuantity(targetTotal, values.length);
  if (sum === targetTotal) return values;

  const scaled = values.map((v) => Math.max(1, Math.round((v * targetTotal) / sum)));
  let diff = targetTotal - scaled.reduce((acc, v) => acc + v, 0);
  let idx = 0;
  while (diff !== 0 && scaled.length > 0) {
    const i = idx % scaled.length;
    if (diff > 0) {
      scaled[i] += 1;
      diff -= 1;
    } else if (scaled[i] > 1) {
      scaled[i] -= 1;
      diff += 1;
    }
    idx += 1;
    if (idx > scaled.length * 20) break;
  }
  return scaled;
}

type SortingPickLine = {
  locationCode: string;
  vehicleNumber: string;
  customerName: string;
  quantity: number;
};

function buildSortingPickLinesFromVehicles(
  incompleteVehicles: IncompleteVehicle[],
  sortingCodes: Set<string>,
): SortingPickLine[] {
  const lines: SortingPickLine[] = [];
  for (const vehicle of incompleteVehicles) {
    for (const detail of vehicle.details) {
      const pos = (detail.sorting_position || "").trim();
      if (!pos || !sortingCodes.has(pos)) continue;
      const plate = (detail.vehicle_number || vehicle.vehicle_number || "").trim();
      const customer = (detail.customer_name || "").trim() || "—";
      lines.push({
        locationCode: pos,
        vehicleNumber: plate || "XE",
        customerName: customer,
        quantity: 1,
      });
    }
  }
  return lines;
}

function buildDemoSortingPickLines(
  sortingCodes: string[],
  totalQuantity: number,
): SortingPickLine[] {
  const amounts = distributeQuantity(totalQuantity, sortingCodes.length);
  return sortingCodes.map((code, index) => ({
    locationCode: code,
    vehicleNumber: `DEMO-${String(index + 1).padStart(2, "0")}`,
    customerName: `Khách ${String.fromCharCode(65 + (index % 26))}`,
    quantity: amounts[index] ?? 0,
  }));
}

function groupSortingLinesByStation(
  lines: SortingPickLine[],
): Map<string, SortingPickLine[]> {
  const grouped = new Map<string, SortingPickLine[]>();
  for (const line of lines) {
    const bucket = grouped.get(line.locationCode) ?? [];
    bucket.push(line);
    grouped.set(line.locationCode, bucket);
  }
  return grouped;
}

function formatStationBin(
  locationByCode: Record<string, WarehouseLocation>,
  code: string,
): string {
  const loc = locationByCode[code];
  return (
    formatDisplayBin(loc?.bin, loc?.location_type) ||
    (code || "").trim() ||
    "—"
  ).toUpperCase();
}

type MergedVehicleLine = {
  vehicleNumber: string;
  quantity: number;
};

/** Ô demo đang lấy hàng (màu vàng) — cố định theo mã bin. */
const DEMO_TAKING_BIN = "VTC03";

function findLocationCodeByBin(
  locationByCode: Record<string, WarehouseLocation>,
  targetBin: string,
): string | null {
  const normalized = targetBin.trim().toUpperCase();
  for (const loc of Object.values(locationByCode)) {
    const code = (loc.location_code || "").trim();
    if (!code) continue;
    const displayBin = formatStationBin(locationByCode, code);
    if (displayBin === normalized) return code;
    const rawBin = (loc.bin || "").trim().toUpperCase();
    if (rawBin === normalized || rawBin === `A${normalized}`) return code;
  }
  return null;
}

function mergeLinesByVehicle(
  lines: Array<{
    vehicleNumber: string;
    quantity: number;
  }>,
): MergedVehicleLine[] {
  const byVehicle = new Map<string, number>();
  for (const line of lines) {
    const plate = (line.vehicleNumber || "").trim() || "XE";
    byVehicle.set(plate, (byVehicle.get(plate) ?? 0) + line.quantity);
  }
  return [...byVehicle.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "vi"))
    .map(([vehicleNumber, quantity]) => ({ vehicleNumber, quantity }));
}

export function buildOutboundStationFeSimulation(params: {
  locationByCode: Record<string, WarehouseLocation>;
  outboundStationIds: number[];
  sortingStationIds: number[];
  incompleteVehicles?: IncompleteVehicle[];
}): OutboundStationFeSimulation | null {
  const outboundCodes = locationCodesForIds(
    params.locationByCode,
    params.outboundStationIds,
  ).slice(0, 2);
  const sortingCodes = locationCodesForIds(
    params.locationByCode,
    params.sortingStationIds,
  );

  if (outboundCodes.length < 1 || sortingCodes.length === 0) {
    return null;
  }

  const totalOutboundQuantity =
    QTY_PER_OUTBOUND_STATION * Math.max(outboundCodes.length, 1);
  const rawSku = DEMO_PRODUCT.sku;
  const productSku = rawSku.length > 6 ? rawSku.slice(0, 4) + rawSku.slice(6) : rawSku;

  const overlayLabels: Record<string, string> = {};
  const statusOverrideByCode: Record<string, string> = {};

  for (const code of outboundCodes) {
    statusOverrideByCode[code] = "less";
    overlayLabels[code] = [
      productSku,
      `SL: ${toDisplayInteger(QTY_PER_OUTBOUND_STATION)}`,
    ].join("\n");
  }

  const sortingCodeSet = new Set(sortingCodes);
  let pickLines = buildSortingPickLinesFromVehicles(
    params.incompleteVehicles ?? [],
    sortingCodeSet,
  );

  const stationsWithData = new Set(pickLines.map((line) => line.locationCode));
  const missingSortingCodes = sortingCodes.filter(
    (code) => !stationsWithData.has(code),
  );
  if (pickLines.length === 0) {
    pickLines = buildDemoSortingPickLines(
      sortingCodes,
      totalOutboundQuantity,
    );
  } else if (missingSortingCodes.length > 0) {
    const remaining = Math.max(
      0,
      totalOutboundQuantity -
        pickLines.reduce((sum, line) => sum + line.quantity, 0),
    );
    if (remaining > 0) {
      pickLines.push(
        ...buildDemoSortingPickLines(missingSortingCodes, remaining),
      );
    }
  }

  const perStation = groupSortingLinesByStation(pickLines);
  const stationTotals = sortingCodes.map(
    (code) =>
      (perStation.get(code) ?? []).reduce((sum, line) => sum + line.quantity, 0),
  );
  const scaledTotals = scaleQuantities(stationTotals, totalOutboundQuantity);

  const fillStations: SortingStationFillStation[] = [];

  sortingCodes.forEach((code, stationIndex) => {
    const stationLines = perStation.get(code) ?? [];
    const binLine = formatStationBin(params.locationByCode, code);
    const fallbackPlate =
      params.incompleteVehicles?.[stationIndex]?.vehicle_number?.trim() ||
      `DEMO-${String(stationIndex + 1).padStart(2, "0")}`;
    const fallbackQty = Math.max(
      1,
      Math.floor(totalOutboundQuantity / Math.max(sortingCodes.length, 1)),
    );

    if (stationLines.length === 0) {
      overlayLabels[code] = [
        `SKU::${productSku}`,
        `SL::${toDisplayInteger(fallbackQty)}`,
        `VEH::${fallbackPlate}`,
      ].join("\n");
      fillStations.push({
        location_code: code,
        has_fill: true,
        fill_total_quantity: fallbackQty,
        summary_label: `SL: ${toDisplayInteger(fallbackQty)}`,
        lines: [
          {
            id: stationIndex * 100 + 1,
            sorting_wave_id: 0,
            outbound_order_id: 0,
            order_code: "SIM",
            customer_name: fallbackPlate,
            vehicle_number: fallbackPlate,
            product_id: 0,
            product_sku: productSku,
            product_name: DEMO_PRODUCT.name,
            quantity: fallbackQty,
          },
        ],
      });
      return;
    }

    const stationTotal = scaledTotals[stationIndex] ?? 0;
    const rawWeights = stationLines.map((line) => Math.max(1, line.quantity));
    const scaledLineQty = scaleQuantities(rawWeights, stationTotal);

    const scaledStationLines = stationLines.map((line, lineIndex) => ({
      customerName: line.customerName,
      vehicleNumber: line.vehicleNumber,
      quantity: scaledLineQty[lineIndex] ?? 0,
    }));
    const mergedVehicles = mergeLinesByVehicle(scaledStationLines);

    const fillLines = mergedVehicles.map((row, lineIndex) => ({
      id: stationIndex * 100 + lineIndex + 1,
      sorting_wave_id: 0,
      outbound_order_id: 0,
      order_code: "SIM",
      customer_name: row.vehicleNumber,
      vehicle_number: row.vehicleNumber,
      product_id: 0,
      product_sku: productSku,
      product_name: DEMO_PRODUCT.name,
      quantity: row.quantity,
    }));

    const allPlates = new Set(
      stationLines.map((line) => line.vehicleNumber).filter(Boolean),
    );
    const plateHeader =
      allPlates.size === 1
        ? [...allPlates][0]
        : `${allPlates.size} xe`;

    overlayLabels[code] = [
      `SKU::${productSku}`,
      `SL::${toDisplayInteger(stationTotal)}`,
      `VEH::${plateHeader}`,
    ].join("\n");

    fillStations.push({
      location_code: code,
      has_fill: true,
      fill_total_quantity: stationTotal,
      summary_label: `SL: ${toDisplayInteger(stationTotal)}`,
      lines: fillLines,
    });
  });

  const takingCode = findLocationCodeByBin(
    params.locationByCode,
    DEMO_TAKING_BIN,
  );
  const waveCodes = [...new Set([...sortingCodes, ...outboundCodes])];
  for (const code of waveCodes) {
    statusOverrideByCode[code] = code === takingCode ? "taking" : "less";
  }

  return {
    overlayLabels,
    statusOverrideByCode,
    fillStations,
    outboundStationCodes: outboundCodes,
    sortingStationCodes: sortingCodes,
    totalOutboundQuantity,
    productSku,
  };
}

export function mergeWithOutboundStationFeSimulation(
  baseLabels: Record<string, string>,
  simulation: OutboundStationFeSimulation | null,
): Record<string, string> {
  if (!simulation) return baseLabels;
  return { ...baseLabels, ...simulation.overlayLabels };
}
