import type {
  MasanPendingAllocationWithCc,
  MasanSortingZonePendingStockResponse,
} from "@/types/masan";
import {
  ccLabelForPendingRow,
  pendingAllocationsByToLocationId,
  pickOldestPendingAllocation,
} from "@/utils/masanPendingStockOverlay";
import { toDisplayInteger } from "@/utils/number";

export type MonitorPendingVtSection = {
  vtLocationId: number;
  /** Nhãn hiển thị VT (`location_name` ưu tiên). */
  vtDisplayLabel: string;
  /** Tóm tắt mã hàng gom theo VT. */
  stockSummary: string;
  primary: MasanPendingAllocationWithCc | null;
  extraCount: number;
  pickRows: MasanPendingAllocationWithCc[];
};

function displayLabelForVt(
  vtLocationId: number,
  vtLocationDisplayLabelById?: Map<number, string>,
  vtLocationCodeById?: Map<number, string>,
): string {
  const fromName = vtLocationDisplayLabelById?.get(vtLocationId)?.trim();
  if (fromName) return fromName;
  const code = vtLocationCodeById?.get(vtLocationId)?.trim();
  if (code) return code;
  return `#${vtLocationId}`;
}

function skuLabel(row: MasanPendingAllocationWithCc): string {
  const sku = row.sku != null ? String(row.sku).trim() : "";
  if (sku) return sku;
  return `#${row.item_stock_id}`;
}

export function summarizeSkusForVtRows(
  rows: MasanPendingAllocationWithCc[],
): string {
  const skus = [...new Set(rows.map((row) => skuLabel(row)))].filter(Boolean);
  if (skus.length === 0) return "—";
  if (skus.length === 1) return skus[0];
  if (skus.length <= 3) return skus.join(", ");
  return `${skus[0]} +${skus.length - 1} mã`;
}

export function buildMonitorPendingStockSidebar(
  data: MasanSortingZonePendingStockResponse | undefined,
  vtLocationCodeById?: Map<number, string>,
  ccLocationIdToCode?: Map<number, string>,
  vtLocationDisplayLabelById?: Map<number, string>,
  ccLocationDisplayLabelById?: Map<number, string>,
): MonitorPendingVtSection[] {
  const byVt = pendingAllocationsByToLocationId(data, ccLocationIdToCode);
  if (byVt.size === 0) return [];

  const sections: MonitorPendingVtSection[] = [];

  for (const [vtLocationId, pickRows] of byVt.entries()) {
    if (pickRows.length === 0) continue;
    sections.push({
      vtLocationId,
      vtDisplayLabel: displayLabelForVt(
        vtLocationId,
        vtLocationDisplayLabelById,
        vtLocationCodeById,
      ),
      stockSummary: summarizeSkusForVtRows(pickRows),
      primary: pickOldestPendingAllocation(pickRows),
      extraCount: Math.max(0, pickRows.length - 1),
      pickRows,
    });
  }

  sections.sort((a, b) =>
    a.vtDisplayLabel.localeCompare(b.vtDisplayLabel, undefined, {
      numeric: true,
    }),
  );

  return sections;
}

export function formatSidebarPickSku(row: MasanPendingAllocationWithCc): string {
  return skuLabel(row);
}

export function formatSidebarPickQty(row: MasanPendingAllocationWithCc): string {
  return toDisplayInteger(row.quantity ?? 0);
}

export function formatSidebarLocator(row: MasanPendingAllocationWithCc): string {
  const fromApi = row.locator != null ? String(row.locator).trim() : "";
  if (fromApi) return fromApi;
  return "—";
}

export function formatSidebarCcLabel(
  row: MasanPendingAllocationWithCc,
  ccLocationDisplayLabelById?: Map<number, string>,
): string {
  const fromMap = ccLocationDisplayLabelById?.get(row.ccLocationId)?.trim();
  if (fromMap) return fromMap;
  return ccLabelForPendingRow(row);
}
