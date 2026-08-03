import type { OutboundOrder } from '@/types/outbound'

const CUSTOMERS = [
  'VCC Steel',
  'Holcim VN',
  'Jotun Paints',
  'Bình Minh Plastics',
  'Siam City Cement',
  'Viglacera',
  'Castrol VN',
  'Hoa Phat Group',
]

const STATUS = ['pending', 'shipped', 'delivered', 'canceled'] as const

const CREATED_BY = [
  { id: 1, username: 'user_kho_nl' },
  { id: 2, username: 'user_kho_tp' },
  { id: 3, username: 'admin' },
  { id: 4, username: 'user_xuat_hang' },
]

const RECORD_COUNT = 22

function pad4(n: number): string {
  return String(n).padStart(4, '0')
}

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function toDateTime(isoDate: string, hour = 8): string {
  return `${isoDate}T${String(hour).padStart(2, '0')}:00:00`
}

export const MOCK_OUTBOUND_ORDERS: OutboundOrder[] = Array.from(
  { length: RECORD_COUNT },
  (_, i) => {
    const status = STATUS[i % STATUS.length]
    const requested_date = daysAgo(30 - i)
    const creator = CREATED_BY[i % CREATED_BY.length]
    const customer = CUSTOMERS[i % CUSTOMERS.length]
    const created_at = toDateTime(daysAgo(31 - i), 9 + (i % 8))
    const qty = 10 + (i % 40)

    return {
      id: i + 1,
      order_code: `XU-2026-${pad4(i + 1)}`,
      customers: [customer],
      requested_date,
      status,
      notes: null,
      created_by: creator.id,
      creator,
      created_at,
      updated_at: created_at,
      total_items: 1 + (i % 5),
      total_customers: 1,
      total_requested_quantity: qty.toFixed(3),
    }
  },
)

export interface OutboundKpi {
  totalOrders: number
  pendingCount: number
  shippedCount: number
  deliveredCount: number
}

export function computeOutboundKpi(orders: OutboundOrder[]): OutboundKpi {
  return {
    totalOrders: orders.length,
    pendingCount: orders.filter((o) => o.status === 'pending').length,
    shippedCount: orders.filter((o) => o.status === 'shipped').length,
    deliveredCount: orders.filter((o) => o.status === 'delivered').length,
  }
}

export const MOCK_OUTBOUND_KPI = computeOutboundKpi(MOCK_OUTBOUND_ORDERS)
