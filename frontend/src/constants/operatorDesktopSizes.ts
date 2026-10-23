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
    /** Card đơn nhập operator — tablet 8" / desktop / TV 43". */
    inboundOrderBrowser: {
      cardMinHeightPx: { narrow: 72, medium: 80, wide: 88, tv: 96 },
      orderCodeFontPx: { narrow: 13, medium: 14, wide: 15, tv: 18 },
      metaFontPx: { narrow: 11, medium: 12, wide: 12, tv: 14 },
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
/*
 * Kích thước ô map operator tự tính theo pitch thực của từng layout:
 *   cellW ≈ pitchX × fillRatio, cellH ≈ pitchY × fillRatio − dải tên (titleBandRatio × pitchY),
 * luôn chừa khe ≥ minGapRatio × pitch để ô không đè nhau.
 */
export const OPERATOR_INBOUND_MAP_TUNING = {
  fitPaddingRatio: 0.02,
  fitScaleFactor: 1,
  fillRatio: 0.68,
  minGapRatio: 0.08,
  titleBandRatio: 0.22,
  /** Phóng chữ label trong ô map operator (chỉ trang user). */
  labelTextScale: 1.88,
} as const;

/** Map đơn nhập — viewport tablet (≤1280px, stage scale). */
export const OPERATOR_INBOUND_MAP_TUNING_TABLET = {
  fitPaddingRatio: 0.008,
  fitScaleFactor: 1.14,
  fillRatio: 0.78,
  minGapRatio: 0.07,
  titleBandRatio: 0.22,
  labelTextScale: 1.88,
} as const;

export const OPERATOR_MAP_TUNING = {
  fitPaddingRatio: 0.02,
  fitScaleFactor: 1,
  fillRatio: 0.86,
  minGapRatio: 0.1,
  titleBandRatio: 0.22,
  /** Phóng chữ label trong ô map operator (chỉ trang user). */
  labelTextScale: 1.85,
} as const;

export const OPERATOR_MAP_CANVAS_DEFAULTS = {
  fitScaleFactor: 1,
  fitPaddingRatio: 0.04,
  fillRatio: 0.86,
  minGapRatio: 0.1,
  titleBandRatio: 0.22,
  labelTextScale: 1.8,
  /** Kích thước ô (world) khi layout chỉ có 1 ô. */
  baseNodeSize: 800,
} as const;

/**
 * Tuning map operator **Đơn xuất / chia chọn / monitor** — giữ tọa độ thật từ map fetch,
 * fit quanh station của wave. Chừa dải tên + biển số rộng hơn vì ô CC có biển số dưới ô.
 */
export const OPERATOR_WAVE_MAP_TUNING = {
  fitPaddingRatio: 0.03,
  fitScaleFactor: 1,
  fillRatio: 0.86,
  minGapRatio: 0.1,
  titleBandRatio: 0.26,
  labelTextScale: 1.7,
  /** CC: cao thêm ~10%, không đổi width. */
  ccCellHeightBoost: 1.1,
  ccLabelTextScale: 1.88,
} as const;

/** Map wave / xuất trực tiếp — viewport tablet. */
export const OPERATOR_WAVE_MAP_TUNING_TABLET = {
  fitPaddingRatio: 0.01,
  fitScaleFactor: 1.1,
  fillRatio: 0.9,
  minGapRatio: 0.09,
  titleBandRatio: 0.26,
  labelTextScale: 1.7,
  ccCellHeightBoost: 1.1,
  ccLabelTextScale: 1.88,
} as const;

/**
 * Tuning dual-map **Xuất trực tiếp** — fit quanh các điểm buffer của cả 2 cột.
 */
export const OPERATOR_DIRECT_OUTBOUND_MAP_TUNING = {
  fitPaddingRatio: 0.02,
  fitScaleFactor: 1,
  fillRatio: 0.88,
  minGapRatio: 0.08,
  titleBandRatio: 0.22,
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
