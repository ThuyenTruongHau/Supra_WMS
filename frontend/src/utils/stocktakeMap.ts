import type { FullLocationDetail } from "@/types/warehouseMap";
import type { StocktakeItemStock } from "@/types/stocktake";

/** Gom dòng kiểm kê theo vị trí để hiển thị trên bản đồ kho (không gọi API preview location). */
export function buildStocktakeLocationOverrides(
  items: StocktakeItemStock[],
): FullLocationDetail[] {
  const byLocationId = new Map<number, FullLocationDetail>();

  for (const item of items) {
    if (!item.location_id || !item.location_code) continue;

    let location = byLocationId.get(item.location_id);
    if (!location) {
      location = {
        id: item.location_id,
        location_code: item.location_code,
        location_name: item.location_name,
        row: null,
        column: null,
        level: null,
        status: "has_stock",
        item_stock: [],
      };
      byLocationId.set(item.location_id, location);
    }

    location.item_stock.push({
      sku: item.item_sku || "—",
      lot_number: item.lot_number || null,
      quantity: String(
        item.actual_quantity > 0 ? item.actual_quantity : item.desired_quantity,
      ),
    });
  }

  return Array.from(byLocationId.values());
}

export function filterStocktakeItemsByMapNode(
  items: StocktakeItemStock[],
  nodeContent: string,
): StocktakeItemStock[] {
  const code = nodeContent.trim();
  if (!code) return [];
  return items.filter((item) => item.location_code === code);
}
