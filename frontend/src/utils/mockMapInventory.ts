import {
  DEMO_LOCATOR_STOCK,
  DEMO_MASAN_PRODUCTS,
  type DemoMasanProduct,
} from '@/data/demoMasanProducts'

export interface MockShelfStock {
  sku: string
  name: string
  lot: string
  base_unit: string
  quantity: number
  available_quantity: number
  reserved_quantity: number
}

const productBySku = new Map<string, DemoMasanProduct>(
  DEMO_MASAN_PRODUCTS.map((product) => [product.sku, product]),
)

/** Tồn demo theo mã locator (A01_SSO, A02_SSO, ...) */
export function getMockStockByLocator(locatorCode: string): MockShelfStock | null {
  const row = DEMO_LOCATOR_STOCK.find((item) => item.locator === locatorCode)
  if (!row) return null

  const product = productBySku.get(row.sku)
  if (!product) return null

  return {
    sku: product.sku,
    name: product.name,
    lot: row.lot,
    base_unit: product.base_unit,
    quantity: row.quantity,
    available_quantity: row.quantity,
    reserved_quantity: 0,
  }
}

/** Locator có tồn demo — dùng tô màu kệ trên map khi API chưa có stock */
export function getMockStockedLocatorCodes(
  knownLocatorCodes: Iterable<string>,
): Set<string> {
  const known = new Set(knownLocatorCodes)
  const stocked = new Set<string>()
  for (const row of DEMO_LOCATOR_STOCK) {
    if (known.has(row.locator)) {
      stocked.add(row.locator)
    }
  }
  return stocked
}
