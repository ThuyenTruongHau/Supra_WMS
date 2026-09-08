import { suggestEmptyLocationsApi } from "@/api/warehouseLocation";
import type { InboundDetailInput } from "@/types/inbound";
import type { Product } from "@/types/product";
import type { EmptyLocation, WarehouseLocation } from "@/types/warehouseLocation";
import type { ImportPreviewRow } from "@/utils/inboundExcelImport";

export function toEmptyLocation(
  location: WarehouseLocation | EmptyLocation,
): EmptyLocation {
  return {
    id: location.id,
    location_code: location.location_code,
    level: location.level,
    row: location.row,
    column: location.column,
    bin: location.bin,
  };
}

export async function applyImportLocationSuggestions(
  zoneId: number,
  details: InboundDetailInput[],
  locations: WarehouseLocation[],
  initialExcludeLocationIds: number[] = [],
): Promise<{
  lookup: Record<number, EmptyLocation>;
  optionsByRow: Record<number, EmptyLocation[]>;
  assignments: number[];
}> {
  const lookup: Record<number, EmptyLocation> = {};
  const optionsByRow: Record<number, EmptyLocation[]> = {};
  const assignments = new Array<number>(details.length).fill(0);

  const excludeLocationIds = [...new Set(initialExcludeLocationIds.filter((id) => id > 0))];
  const missingRowIndices: number[] = [];

  for (let index = 0; index < details.length; index += 1) {
    const locationId = details[index].assigned_location_id;
    if (locationId && locationId > 0) {
      const location = locations.find((loc) => loc.id === locationId);
      if (location) {
        const emptyLoc = toEmptyLocation(location);
        lookup[location.id] = emptyLoc;
        optionsByRow[index] = [emptyLoc];
        assignments[index] = location.id;
        excludeLocationIds.push(location.id);
      } else {
        missingRowIndices.push(index);
      }
    } else {
      missingRowIndices.push(index);
    }
  }

  if (missingRowIndices.length > 0) {
    const suggest = await suggestEmptyLocationsApi({
      zone_id: zoneId,
      count: missingRowIndices.length,
      exclude_location_ids: excludeLocationIds,
    });

    if (suggest.suggestions.length < missingRowIndices.length) {
      throw new Error(
        `Không đủ vị trí trống: cần ${missingRowIndices.length}, còn ${suggest.total_available} vị trí khả dụng`,
      );
    }

    missingRowIndices.forEach((rowIndex, suggestIndex) => {
      const location = suggest.suggestions[suggestIndex];
      lookup[location.id] = location;
      optionsByRow[rowIndex] = [location];
      assignments[rowIndex] = location.id;
    });
  }

  return { lookup, optionsByRow, assignments };
}

export function buildPreviewRowsFromDetails(
  details: InboundDetailInput[],
  products: Product[],
): ImportPreviewRow[] {
  const productById = new Map(products.map((product) => [product.id, product]));

  return details.map((detail, index) => {
    const product = productById.get(detail.product_id);
    const expectedQuantity = Number(detail.expected_quantity);

    return {
      excelRowNumber: index + 1,
      sku: product?.sku ?? String(detail.product_id),
      productName: product?.name ?? "—",
      dbProductName: product?.name ?? "—",
      lotNumber: detail.lot_number ?? "",
      lotStatus: "",
      totalQuantity: expectedQuantity,
      expectedQuantity,
      palletQuantity: detail.pallet_quantity ?? 1,
      nameMismatch: false,
    };
  });
}

export function isNewInboundDetailLine(detail: InboundDetailInput): boolean {
  return !detail.assigned_location_id || detail.assigned_location_id <= 0;
}

export function mergeLocationAssignmentsIntoDetails(
  details: InboundDetailInput[],
  newLineIndices: number[],
  locationAssignments: number[],
): InboundDetailInput[] {
  return details.map((detail, index) => {
    const newLineIndex = newLineIndices.indexOf(index);
    if (newLineIndex < 0) {
      return detail;
    }

    return {
      ...detail,
      assigned_location_id: locationAssignments[newLineIndex] ?? null,
    };
  });
}
