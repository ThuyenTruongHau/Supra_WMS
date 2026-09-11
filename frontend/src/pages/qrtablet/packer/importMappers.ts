import type { ImportGroupDraft, ImportItemDraft } from "@/pages/components/CreateImportModal";
import {
  nextKeyValueEntryId,
  type KeyValueEntry,
} from "@/utils/keyValueDetails";
import type {
  AssignedItemStock,
  AssignOrGetItemStockResponse,
  InboundOrderAllocationCreate,
} from "@/types/inboundOrder";
import { normalizeLotNumber } from "@/utils/lotNumberValidation";

const STAFF_LIST_SEPARATOR = ",";

function parseStaffTokens(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  return raw
    .split(STAFF_LIST_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Gom tên unique, phân tách bằng dấu phẩy (SX, QC, cavity). */
export function normalizeUniqueCommaField(
  raw: string | null | undefined,
): string | undefined {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const token of parseStaffTokens(raw)) {
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    ordered.push(token);
  }

  return ordered.length > 0 ? ordered.join(STAFF_LIST_SEPARATOR) : undefined;
}

/** Người đóng gói — chỉ giữ một người. */
export function normalizePackingUserField(
  raw: string | null | undefined,
): string | undefined {
  return parseStaffTokens(raw)[0];
}

export type LocationImportContext = {
  location_id: number;
  location_name?: string | null;
  warehouse_id?: number | null;
};

export function isSplitAssignedStock(stock: AssignedItemStock): boolean {
  const type = stock.details?.type;
  if (type === "Lấy lẻ" || type === "lấy lẻ") {
    return true;
  }
  return Boolean(stock.is_split);
}

function splitDetailEntries(isSplit: boolean): KeyValueEntry[] {
  return isSplit
    ? [{ id: nextKeyValueEntryId("split"), key: "type", value: "Lấy lẻ" }]
    : [];
}

function mapAssignedStockToImportItem(
  stock: AssignedItemStock,
  key: string,
): ImportItemDraft {
  return {
    key,
    sku: stock.item_sku,
    item_id: stock.item_id,
    item_name: stock.item_name ?? undefined,
    quantity: stock.quantity,
    unit_id: stock.unit_id,
    lot_number: stock.lot_number || stock.lot_number_to || undefined,
    qr_code_id: stock.qr_code_id,
    qr_type: stock.qr_type ?? undefined,
    qr_code: stock.code,
    cavity_number: normalizeUniqueCommaField(stock.cavity_number),
    manufacturing_user: normalizeUniqueCommaField(stock.manufacturing_user),
    qc_user: normalizeUniqueCommaField(stock.qc_user),
    packing_user: normalizePackingUserField(stock.packing_user),
  };
}

export function locationContextFromStocks(
  stocks: AssignedItemStock[],
): LocationImportContext | null {
  const first = stocks[0];
  if (!first?.location_id) {
    return null;
  }
  return {
    location_id: first.location_id,
    location_name: first.location_name,
    warehouse_id: first.warehouse_id,
  };
}

export function locationContextFromScanResponse(
  response: Pick<
    AssignOrGetItemStockResponse,
    "location_id" | "location_name" | "warehouse_id" | "location_stocks"
  >,
): LocationImportContext | null {
  if (response.location_id != null) {
    return {
      location_id: response.location_id,
      location_name: response.location_name,
      warehouse_id: response.warehouse_id,
    };
  }
  return locationContextFromStocks(response.location_stocks ?? []);
}

export function mapLocationStocksToImportGroups(
  stocks: AssignedItemStock[],
): ImportGroupDraft[] {
  const buckets = new Map<boolean, AssignedItemStock[]>();
  for (const stock of stocks) {
    const isSplit = isSplitAssignedStock(stock);
    const bucket = buckets.get(isSplit) ?? [];
    bucket.push(stock);
    buckets.set(isSplit, bucket);
  }

  return Array.from(buckets.entries()).map(([isSplit, bucket], bucketIndex) => {
    const first = bucket[0];
    return {
      key: `tablet-group-${first?.location_id ?? "loc"}-${isSplit ? "split" : "normal"}-${bucketIndex}`,
      from_location_id: first?.location_id ?? undefined,
      from_location_name: first?.location_name ?? undefined,
      qr_type: first?.qr_type ?? undefined,
      detailEntries: splitDetailEntries(isSplit),
      items: bucket.map((stock, index) =>
        mapAssignedStockToImportItem(
          stock,
          `tablet-item-${stock.qr_code_id}-${index}`,
        ),
      ),
    };
  });
}

export function mapPendingItemsToImportGroups(
  items: AssignedItemStock[],
  location: LocationImportContext,
): ImportGroupDraft[] {
  const buckets = new Map<boolean, AssignedItemStock[]>();
  for (const stock of items) {
    const isSplit = isSplitAssignedStock(stock);
    const bucket = buckets.get(isSplit) ?? [];
    bucket.push(stock);
    buckets.set(isSplit, bucket);
  }

  return Array.from(buckets.entries()).map(([isSplit, bucket], bucketIndex) => ({
    key: `packer-loc-${location.location_id}-${isSplit ? "split" : "normal"}-${bucketIndex}`,
    from_location_id: location.location_id,
    from_location_name: location.location_name ?? undefined,
    qr_type: "item",
    detailEntries: splitDetailEntries(isSplit),
    items: bucket.map((stock, index) =>
      mapAssignedStockToImportItem(
        stock,
        `pending-item-${stock.qr_code_id}-${index}`,
      ),
    ),
  }));
}

export function hasTabletScanMetadata(item: ImportItemDraft): boolean {
  return Boolean(
    item.qr_code_id &&
      (item.manufacturing_user ||
        item.qc_user ||
        item.packing_user ||
        item.cavity_number),
  );
}

export function buildInboundAllocationPayload(
  item: ImportItemDraft,
  includeTabletMetadata: boolean,
): InboundOrderAllocationCreate {
  const payload: InboundOrderAllocationCreate = {
    item_id: item.item_id!,
    quantity: item.quantity,
    unit_id: item.unit_id!,
    lot_number: normalizeLotNumber(item.lot_number),
    expiry_date: item.expiry_date || null,
    qr_code_id: item.qr_code_id ?? null,
  };

  if (includeTabletMetadata) {
    payload.cavity_number = item.cavity_number ?? null;
    payload.manufacturing_user = item.manufacturing_user ?? null;
    payload.qc_user = item.qc_user ?? null;
    payload.packing_user = item.packing_user ?? null;
  }

  return payload;
}
