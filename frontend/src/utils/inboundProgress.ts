import type { InboundOrderDetail } from '../types/inboundOrder'

export type InboundProgressStatus = 'waiting' | 'running' | 'completed' | 'attention'
export type InboundProgressMetric = 'commands' | 'quantity' | 'skus'
export type InboundProgressCounts = Record<InboundProgressStatus, number>

function emptyCounts(): InboundProgressCounts {
  return { waiting: 0, running: 0, completed: 0, attention: 0 }
}

function progressStatus(status: string): InboundProgressStatus {
  switch (status.trim().toLowerCase().replace(/-/g, '_')) {
    case 'initialize':
    case 'pending':
      return 'waiting'
    case 'issued':
    case 'in_progress':
    case 'in_transit':
    case 'receiving':
    case 'partial':
      return 'running'
    case 'completed':
      return 'completed'
    default:
      return 'attention'
  }
}

/** Each detail is one command. A SKU is complete only after all its commands finish. */
export function buildInboundProgress(details: readonly InboundOrderDetail[]) {
  const commands = emptyCounts()
  const quantity = emptyCounts()
  const skus = emptyCounts()
  const vehicles = new Set<string>()
  const skuStatuses = new Map<string, Set<InboundProgressStatus>>()

  for (const detail of details) {
    const status = progressStatus(detail.status)
    commands[status] += 1
    const vehicle = detail.details?.vehicle_no
    if (typeof vehicle === 'string' && vehicle.trim()) vehicles.add(vehicle.trim())

    for (const allocation of detail.allocations ?? []) {
      const amount = Number(allocation.quantity)
      if (Number.isFinite(amount) && amount > 0) quantity[status] += amount

      const sku = allocation.sku?.trim()
      const key = allocation.item_id != null ? `item:${allocation.item_id}` : sku ? `sku:${sku}` : null
      if (!key) continue
      const statuses = skuStatuses.get(key) ?? new Set<InboundProgressStatus>()
      statuses.add(status)
      skuStatuses.set(key, statuses)
    }
  }

  for (const statuses of skuStatuses.values()) {
    if (statuses.has('attention')) skus.attention += 1
    else if (statuses.size === 1 && statuses.has('completed')) skus.completed += 1
    else if (statuses.size === 1 && statuses.has('waiting')) skus.waiting += 1
    else skus.running += 1
  }

  return {
    commands,
    quantity,
    skus,
    vehicles: [...vehicles].sort((a, b) => a.localeCompare(b, 'vi')),
  }
}
