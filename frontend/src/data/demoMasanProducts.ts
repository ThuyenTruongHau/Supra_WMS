/** Sản phẩm demo theo biểu mẫu báo cáo xuất theo ngày (7/1/2026). */

export interface DemoMasanProduct {
  sku: string
  name: string
  lot: string
  base_unit: string
  /** Tổng số lượng xuất trong biểu mẫu mẫu */
  exportQty: number
}

export const DEMO_MASAN_PRODUCTS: DemoMasanProduct[] = [
  {
    sku: '01PH00073',
    name: 'Phở Bò CHIN-SU Story (có thịt) 12tô x 134gr',
    lot: '120626',
    base_unit: 'thùng',
    exportQty: 360,
  },
  {
    sku: '01PH00174',
    name: 'Sợi tam hoa Omachi vị tôm cay xốt cà chua 24gói x 69gr',
    lot: '270526',
    base_unit: 'thùng',
    exportQty: 280,
  },
  {
    sku: '01PH00126',
    name: 'Bánh phở khô CHIN-SU Story 12túi x 500gr',
    lot: '141125',
    base_unit: 'thùng',
    exportQty: 120,
  },
  {
    sku: '01PH00075',
    name: 'Phở Bò CHIN-SU Story 30gói x 80gr',
    lot: '150426',
    base_unit: 'thùng',
    exportQty: 60,
  },
]

/** Top sản phẩm xuất nhiều — dùng cho biểu đồ báo cáo */
export const DEMO_TOP_EXPORT_PRODUCTS = DEMO_MASAN_PRODUCTS.map((p) => ({
  name: p.name.replace(' CHIN-SU Story', '').replace('Omachi ', 'Omachi\n'),
  shortName:
    p.sku === '01PH00073'
      ? 'Phở Bò CHIN-SU (có thịt)'
      : p.sku === '01PH00174'
        ? 'Omachi tôm cay'
        : p.sku === '01PH00126'
          ? 'Bánh phở khô CHIN-SU'
          : 'Phở Bò CHIN-SU 30gói',
  value: p.exportQty,
}))

/** Gán tồn demo lên locator theo biểu mẫu xuất */
export const DEMO_LOCATOR_STOCK: Array<{
  locator: string
  sku: string
  quantity: number
  lot: string
}> = [
  { locator: 'A01_SSO', sku: '01PH00073', quantity: 60, lot: '120626' },
  { locator: 'A02_SSO', sku: '01PH00073', quantity: 60, lot: '120626' },
  { locator: 'A03_SSO', sku: '01PH00073', quantity: 60, lot: '120626' },
  { locator: 'A04_SSO', sku: '01PH00075', quantity: 60, lot: '150426' },
  { locator: 'A05_SSO', sku: '01PH00126', quantity: 60, lot: '141125' },
  { locator: 'A06_SSO', sku: '01PH00174', quantity: 50, lot: '270526' },
  { locator: 'A07_SSO', sku: '01PH00174', quantity: 50, lot: '280526' },
  { locator: 'A08_SSO', sku: '01PH00174', quantity: 40, lot: '300526' },
]
