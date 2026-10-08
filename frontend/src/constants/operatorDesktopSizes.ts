/**
 * Kích thước desktop khóa cứng cho UI operator (role khác admin).
 * Giá trị = đúng những gì đang render trên desktop — không redesign.
 * Dùng numeric cho Ant props / style; dùng class map cho Tailwind (tránh JIT purge).
 */

export const OPERATOR_DESKTOP = {
  headerHeight: 64,
  /** main padding: p-1.5 (6) sm:p-2 (8) */
  mainPadding: { base: 6, sm: 8 },
  boardHeight: 500,
  mapMinHeight: 0,
  controlHeight: 44,
  buttonHeightMd: 40,
  buttonHeightSm: 36,
  buttonHeightXs: 32,
  iconBox: 44,
  chartHeight: 240,
  /** 100vh - 7.5rem — header + main padding ước lượng trang sorting */
  sortingPageMinHeightOffset: '7.5rem',
  scadaStripHeight: 88,
  sideStatsMinHeight: 140,
  modal: {
    /** Ant Design default khi không truyền width */
    default: 520,
    sm: 560,
    md: 800,
    lg: 900,
    xl: 920,
    mapPickerWidth: '90vw',
    mapPickerBodyHeight: '80vh',
    importInbound: {
      width: '92vw',
      maxWidth: 1480,
      top: 24,
      bodyMaxHeight: 'calc(100vh - 220px)',
    },
    /** Modal chi tiết hàng CC — tablet 8" / desktop / TV 43". */
    ccLocationLines: {
      bodyMaxHeight: 'calc(100vh - 160px)',
      tableScrollY: {
        narrow: 320,
        medium: 440,
        wide: 540,
        tv: 620,
      },
    },
    reAssignCcSplit: {
      bodyMaxHeight: 'calc(100vh - 200px)',
    },
  },
  listMax: {
    h420: 420,
    h280: 280,
    h64: 256,
    h56: 224,
    h40: 160,
    vh50: '50vh',
  },
} as const

/** Class Tailwind literal — khớp số trong OPERATOR_DESKTOP, an toàn với JIT. */
/**
 * Tuning map operator **Đơn nhập** — fit quanh các điểm buffer trong khung board.
 */
export const OPERATOR_INBOUND_MAP_TUNING = {
  fitPaddingRatio: 0.02,
  fitScaleFactor: 1,
  shelfSizeFactor: 1.1,
  baseNodeSize: 400,
  /** Phóng chữ label trong ô map operator (chỉ trang user). */
  labelTextScale: 1.88,
} as const;

export const OPERATOR_MAP_TUNING = {
  fitPaddingRatio: 0.02,
  fitScaleFactor: 1,
  shelfSizeFactor: 1,
  baseNodeSize: 400,
  /** Phóng chữ label trong ô map operator (chỉ trang user). */
  labelTextScale: 1.85,
} as const;

export const OPERATOR_MAP_CANVAS_DEFAULTS = {
  fitScaleFactor: 0.75,
  fitPaddingRatio: 0.08,
  baseNodeSize: 800,
  shelfSizeFactor: 0.7,
  labelTextScale: 1.8,
} as const;

/**
 * Tuning map operator **Đơn xuất / chia chọn** — giữ tọa độ thật từ map fetch
 * (không uniformGridFit), fit quanh station của wave, size theo khoảng cách focus.
 */
export const OPERATOR_WAVE_MAP_TUNING = {
  fitPaddingRatio: 0.04,
  fitScaleFactor: 1.1,
  shelfSizeFactor: 0.48,
  baseNodeSize: 800,
  labelTextScale: 1.70,
} as const

/**
 * Tuning dual-map **Xuất trực tiếp** — fit quanh các điểm buffer của cả 2 cột.
 */
export const OPERATOR_DIRECT_OUTBOUND_MAP_TUNING = {
  fitPaddingRatio: 0.02,
  fitScaleFactor: 1,
  shelfSizeFactor: 1.1,
  baseNodeSize: 420,
  labelTextScale: 1.88,
} as const

export const operatorDesktopClass = {
  headerHeight: 'h-16',
  mainPadding: 'p-1.5 sm:p-2',
  boardHeight: 'h-[500px]',
  boardMinHeight: 'min-h-[500px]',
  /** Co giãn theo vùng board còn lại — dùng thay boardHeight trên trang operator 1 màn. */
  boardFill: 'min-h-0 flex-1',
  mapMinHeight: '!min-h-0',
  controlHeight: '!h-11',
  controlSizeSquare: '!h-11 !w-11',
  buttonHeightMd: '!h-10',
  buttonHeightSm: '!h-9',
  buttonHeightXs: '!h-8',
  iconBox: 'h-11 w-11',
  listMax420: 'max-h-[420px]',
  listMax280: 'max-h-[280px]',
  listMax64: 'max-h-64',
  listMax56: 'max-h-56',
  listMax40: 'max-h-40',
  listMax50vh: 'max-h-[50vh]',
  sortingPageMinHeight: 'min-h-[calc(100vh-7.5rem)]',
  scadaStripHeight: 'h-[88px]',
  sideStatsMinHeight: 'min-h-[140px]',
} as const

/** Độ rộng cột table — giữ đúng số đang hardcode trên UI operator. */
export const operatorDesktopTableWidths = {
  inboundAssignedDetails: {
    sku: 110,
    lot: 90,
    qty: 56,
    date: 92,
    status: 78,
  },
  inboundImportPreview: {
    excelRow: 90,
    sku: 110,
    productName: 280,
    lot: 90,
    totalQty: 80,
    expectedQty: 90,
    pallet: 70,
    location: 240,
  },
  outboundPicking: {
    type: 100,
    qty: 100,
    trip: 130,
    status: 150,
  },
  outboundImportPreview: {
    excelRow: 60,
    vehicle: 100,
    sku: 110,
    lot: 90,
    qty: 80,
    pallet: 80,
  },
  relocateCommands: {
    createdAt: 150,
    stockCount: 90,
    totalQty: 100,
    kind: 120,
    status: 110,
    createdBy: 140,
  },
  assignOutboundPreview: {
    type: 100,
    sku: 110,
    productName: 180,
    orderCode: 120,
    sourceBin: 120,
    currentBin: 130,
    qty: 70,
  },
} as const

/**
 * Khung sân khấu operator — chỉ dùng khi viewport ≤ wideMaxPx (UserLayout scale).
 * Desktop rộng render full viewport, không qua khung này.
 */
export const OPERATOR_STAGE = {
  width: 1920,
  height: 1080,
} as const

/** Tablet / màn operator nhỏ — class body + ngưỡng bật stage scale. */
export const OPERATOR_TABLET = {
  bodyClass: 'operator-ui',
  /** viewport width ≤ giá trị này → stage 1920×1080 + scale */
  wideMaxPx: 1280,
  narrowMaxPx: 768,
  scaleWide: 0.9,
  scaleNarrow: 0.82,
} as const
