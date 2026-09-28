/** Mock data cho trang Đơn xuất và chia chọn (operator). */

export type BreakCellKind = "order" | "surplus" | "empty" | "agv" | "worker"

export type BreakCell = {
  id: string
  kind: BreakCellKind
  plate?: string
  sku?: string
  qtyLabel?: string
  surplusLabel?: string
  originLabel?: string
  agvLabel?: string
}

export type LoadingSlotStatus = "enough" | "waiting" | "shortage"

export type LoadingSlot = {
  id: number
  plate: string
  percent: number
  status: LoadingSlotStatus
}

export type PickingRowStatus = "enough" | "waiting" | "shortage"

export type PickingRow = {
  id: number
  sku: string
  quantity: number
  locator: string
  trip: string
  status: PickingRowStatus
}

export type CurrentOrderProgress = {
  id: string
  percent: number
  plates: string[]
}

/** Zone chia lẻ 1 — lưới 3×3 (mock). */
export const MOCK_BREAK_ZONE_1: BreakCell[] = [
  {
    id: "z1-1",
    kind: "order",
    plate: "29A-456.78",
    sku: "02KK00361",
    qtyLabel: "12 thùng",
  },
  {
    id: "z1-2",
    kind: "order",
    plate: "51F-123.45",
    sku: "02OM00858",
    qtyLabel: "8 thùng",
  },
  { id: "z1-3", kind: "empty" },
  {
    id: "z1-4",
    kind: "surplus",
    sku: "02KK00361",
    surplusLabel: "DƯ: 8",
    originLabel: "Gốc: 60 thg",
  },
  { id: "z1-5", kind: "worker" },
  {
    id: "z1-6",
    kind: "agv",
    agvLabel: "AGV-P1",
    sku: "Pallet VN125",
  },
  { id: "z1-7", kind: "empty" },
  {
    id: "z1-8",
    kind: "order",
    plate: "30H-999.11",
    sku: "01PH00073",
    qtyLabel: "20 thùng",
  },
  {
    id: "z1-9",
    kind: "surplus",
    sku: "02OM00858",
    surplusLabel: "DƯ: 3",
    originLabel: "Gốc: 40 thg",
  },
]

/** Zone chia lẻ 2 — lưới 3×3 (mock). */
export const MOCK_BREAK_ZONE_2: BreakCell[] = [
  {
    id: "z2-1",
    kind: "order",
    plate: "61C-222.33",
    sku: "02KK00410",
    qtyLabel: "15 thùng",
  },
  { id: "z2-2", kind: "empty" },
  {
    id: "z2-3",
    kind: "order",
    plate: "51D-888.01",
    sku: "02KK00500",
    qtyLabel: "6 thùng",
  },
  {
    id: "z2-4",
    kind: "agv",
    agvLabel: "AGV-P2",
    sku: "Pallet VN210",
  },
  { id: "z2-5", kind: "worker" },
  {
    id: "z2-6",
    kind: "surplus",
    sku: "02KK00410",
    surplusLabel: "DƯ: 5",
    originLabel: "Gốc: 48 thg",
  },
  {
    id: "z2-7",
    kind: "order",
    plate: "29A-456.78",
    sku: "01PH00073",
    qtyLabel: "10 thùng",
  },
  { id: "z2-8", kind: "empty" },
  {
    id: "z2-9",
    kind: "order",
    plate: "51F-123.45",
    sku: "02OM00858",
    qtyLabel: "4 thùng",
  },
]

export const MOCK_LOADING_SLOTS: LoadingSlot[] = [
  { id: 1, plate: "29A-456.78", percent: 45, status: "shortage" },
  { id: 2, plate: "51F-123.45", percent: 100, status: "enough" },
  { id: 3, plate: "30H-999.11", percent: 80, status: "waiting" },
  { id: 4, plate: "61C-222.33", percent: 15, status: "shortage" },
  { id: 5, plate: "51D-888.01", percent: 100, status: "enough" },
  { id: 6, plate: "29B-111.22", percent: 70, status: "waiting" },
  { id: 7, plate: "72A-333.44", percent: 90, status: "waiting" },
  { id: 8, plate: "43C-555.66", percent: 100, status: "enough" },
  { id: 9, plate: "88D-777.88", percent: 35, status: "shortage" },
  { id: 10, plate: "19E-000.99", percent: 55, status: "waiting" },
]

export const MOCK_PICKING_ROWS: PickingRow[] = [
  {
    id: 1,
    sku: "02KK00361",
    quantity: 120,
    locator: "L-A1-10",
    trip: "TR-101",
    status: "enough",
  },
  {
    id: 2,
    sku: "02OM00858",
    quantity: 75,
    locator: "L-A2-01",
    trip: "TR-102",
    status: "waiting",
  },
  {
    id: 3,
    sku: "01PH00073",
    quantity: 200,
    locator: "L-B1-05",
    trip: "TR-101",
    status: "enough",
  },
  {
    id: 4,
    sku: "02KK00410",
    quantity: 48,
    locator: "L-B2-03",
    trip: "TR-103",
    status: "shortage",
  },
  {
    id: 5,
    sku: "02KK00500",
    quantity: 36,
    locator: "L-C1-02",
    trip: "TR-102",
    status: "waiting",
  },
  {
    id: 6,
    sku: "02OM00910",
    quantity: 90,
    locator: "L-A1-08",
    trip: "TR-104",
    status: "enough",
  },
  {
    id: 7,
    sku: "01PH00120",
    quantity: 55,
    locator: "L-C2-04",
    trip: "TR-103",
    status: "shortage",
  },
  {
    id: 8,
    sku: "02KK00611",
    quantity: 110,
    locator: "L-A3-01",
    trip: "TR-101",
    status: "enough",
  },
  {
    id: 9,
    sku: "02OM01001",
    quantity: 28,
    locator: "L-B3-07",
    trip: "TR-105",
    status: "waiting",
  },
  {
    id: 10,
    sku: "01PH00200",
    quantity: 64,
    locator: "L-A2-09",
    trip: "TR-104",
    status: "enough",
  },
  {
    id: 11,
    sku: "02KK00720",
    quantity: 42,
    locator: "L-C1-11",
    trip: "TR-102",
    status: "shortage",
  },
  {
    id: 12,
    sku: "02OM01150",
    quantity: 80,
    locator: "L-B1-12",
    trip: "TR-105",
    status: "waiting",
  },
  {
    id: 13,
    sku: "01PH00330",
    quantity: 150,
    locator: "L-A1-15",
    trip: "TR-101",
    status: "enough",
  },
]

export const MOCK_CURRENT_ORDERS: CurrentOrderProgress[] = [
  { id: "o1", percent: 100, plates: ["29A-456.78", "51F-123.45"] },
  { id: "o2", percent: 75, plates: ["30H-999.11"] },
  { id: "o3", percent: 40, plates: ["61C-222.33", "51D-888.01"] },
  { id: "o4", percent: 90, plates: ["72A-333.44"] },
]

export const LOADING_STATUS_LABEL: Record<LoadingSlotStatus, string> = {
  enough: "Đủ hàng",
  waiting: "Đang chờ xuất",
  shortage: "Thiếu hàng",
}

export const PICKING_STATUS_LABEL: Record<PickingRowStatus, string> = {
  enough: "Đủ hàng",
  waiting: "Đang chờ xuất",
  shortage: "Thiếu hàng",
}
