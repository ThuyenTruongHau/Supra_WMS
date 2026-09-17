import type { FullLocationDetail } from "@/types/warehouseMap";
import type {
  OutboundOrderAllocation,
  OutboundOrderDetail,
} from "@/types/outbound";

export interface OutboundMapAllocationEntry {
  detail: OutboundOrderDetail;
  allocation: OutboundOrderAllocation;
}

/** Gom phân bổ theo vị trí lấy để hiển thị trên bản đồ kho. */
export function buildOutboundLocationOverrides(
  details: OutboundOrderDetail[],
): FullLocationDetail[] {
  const byLocationId = new Map<number, FullLocationDetail>();

  for (const detail of details) {
    for (const allocation of detail.allocations) {
      if (!allocation.from_location_id || !allocation.from_location_code) continue;

      let location = byLocationId.get(allocation.from_location_id);
      if (!location) {
        location = {
          id: allocation.from_location_id,
          location_code: allocation.from_location_code,
          location_name: allocation.from_location_name,
          row: null,
          column: null,
          level: null,
          status: "has_stock",
          item_stock: [],
        };
        byLocationId.set(allocation.from_location_id, location);
      }

      location.item_stock.push({
        sku: allocation.sku || detail.sku || "—",
        lot_number: allocation.lot_number || null,
        quantity: String(allocation.quantity),
      });
    }
  }

  return Array.from(byLocationId.values());
}

export function filterOutboundAllocationsByMapNode(
  details: OutboundOrderDetail[],
  nodeContent: string,
): OutboundMapAllocationEntry[] {
  const code = nodeContent.trim();
  if (!code) return [];

  const entries: OutboundMapAllocationEntry[] = [];
  for (const detail of details) {
    for (const allocation of detail.allocations) {
      if (allocation.from_location_code === code) {
        entries.push({ detail, allocation });
      }
    }
  }
  return entries;
}
