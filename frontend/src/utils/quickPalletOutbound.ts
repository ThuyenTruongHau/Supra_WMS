import type { Product } from "@/types/product";
import type { DetailGroupInput } from "@/types/outbound";
import { DEMO_MASAN_PRODUCTS } from "@/data/demoMasanProducts";

/** SL mặc định / 1 pallet — khớp tồn demo trên locator. */
export const QUICK_PALLET_UNIT_QTY = 60;

export function pickQuickExportProduct(products: Product[]): Product | null {
  if (products.length === 0) return null;
  const preferredSkus = DEMO_MASAN_PRODUCTS.map((p) => p.sku);
  for (const sku of preferredSkus) {
    const match = products.find((p) => (p.sku || "").trim() === sku);
    if (match) return match;
  }
  return products[0];
}

export function buildQuickPalletDetailGroups(
  productId: number,
  palletCount: number,
): DetailGroupInput[] {
  const plate = `DEMO-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  return [
    {
      customer_name: "Khách demo",
      vehicle_number: plate,
      trip_code: "DEMO",
      carrier_name: "Demo",
      items: [
        {
          product_id: productId,
          requested_quantity: QUICK_PALLET_UNIT_QTY * palletCount,
          pallet_quantity: palletCount,
        },
      ],
    },
  ];
}
