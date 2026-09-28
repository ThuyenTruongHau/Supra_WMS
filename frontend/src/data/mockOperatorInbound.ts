/** Mock data cho trang Đơn nhập operator. */

export const MOCK_INBOUND_VEHICLE = {
  label: 'Xe 1',
  plate: '51C-123.45',
  transitBoxes: 5,
}

export type MockDetailStatus = 'Intransit' | 'Stock' | 'Staging'

export const MOCK_INBOUND_DETAIL_ROWS = [
  {
    id: 1,
    plate: '51C-123.45',
    skuLot: '02KK00361 / L2501',
    qty: 25,
    date: '15/07/2024',
    loc: 'CN01',
    status: 'Intransit' as MockDetailStatus,
  },
  {
    id: 2,
    plate: '51C-123.45',
    skuLot: '02KK00362 / L2501',
    qty: 18,
    date: '15/07/2024',
    loc: 'CN02',
    status: 'Staging' as MockDetailStatus,
  },
  {
    id: 3,
    plate: '51D-888.01',
    skuLot: '02KK00410 / L2502',
    qty: 40,
    date: '15/07/2024',
    loc: 'CN05',
    status: 'Stock' as MockDetailStatus,
  },
  {
    id: 4,
    plate: '51D-888.01',
    skuLot: '02KK00411 / L2502',
    qty: 12,
    date: '15/07/2024',
    loc: 'CN06',
    status: 'Staging' as MockDetailStatus,
  },
  {
    id: 5,
    plate: '51C-456.78',
    skuLot: '02KK00500 / L2503',
    qty: 30,
    date: '14/07/2024',
    loc: 'CN08',
    status: 'Intransit' as MockDetailStatus,
  },
]

export const SOURCE_TABS = [
  { key: 'cont', label: 'Từ cont' },
  { key: 'direct', label: 'Xuất trực tiếp' },
] as const

export type SourceTabKey = (typeof SOURCE_TABS)[number]['key']
