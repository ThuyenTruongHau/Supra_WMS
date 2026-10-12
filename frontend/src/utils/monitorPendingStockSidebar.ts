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
  displayLabel: string;
  primary: MasanPendingAllocationWithCc | null;
  extraCount: number;
  pickRows: MasanPendingAllocationWithCc[];
};

function displayLabelForVt(
  vtLocationId: number,
  vtLocationCodeById?: Map<number, string>,
): string {
  const code = vtLocationCodeById?.get(vtLocationId)?.trim();
  if (code) return code;
  return `#${vtLocationId}`;
}

function skuLabel(row: MasanPendingAllocationWithCc): string {
  const sku = row.sku != null ? String(row.sku).trim() : "";
  if (sku) return sku;
  return `#${row.item_stock_id}`;
}

export function buildMonitorPendingStockSidebar(
  data: MasanSortingZonePendingStockResponse | undefined,
  vtLocationCodeById?: Map<number, string>,
  ccLocationIdToCode?: Map<number, string>,
): MonitorPendingVtSection[] {
  const byVt = pendingAllocationsByToLocationId(data, ccLocationIdToCode);
  if (byVt.size === 0) return [];

  const sections: MonitorPendingVtSection[] = [];

  for (const [vtLocationId, pickRows] of byVt.entries()) {
    if (pickRows.length === 0) continue;
    sections.push({
      vtLocationId,
      displayLabel: displayLabelForVt(vtLocationId, vtLocationCodeById),
      primary: pickOldestPendingAllocation(pickRows),
      extraCount: Math.max(0, pickRows.length - 1),
      pickRows,
    });
  }

  sections.sort((a, b) =>
    a.displayLabel.localeCompare(b.displayLabel, undefined, { numeric: true }),
  );

  return sections;
}

export function formatSidebarPickSku(row: MasanPendingAllocationWithCc): string {
  return skuLabel(row);
}

export function formatSidebarPickQty(row: MasanPendingAllocationWithCc): string {
  return toDisplayInteger(row.quantity ?? 0);
}

export function formatSidebarCcLabel(row: MasanPendingAllocationWithCc): string {
  return ccLabelForPendingRow(row);
}
