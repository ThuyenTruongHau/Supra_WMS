import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { lookupItemStockQrCodesApi } from '@/api/itemStock'
import type { ItemStockQrCodeEntry } from '@/types/itemStock'

function normalizeStockIds(stockIds: number[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const raw of stockIds) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  out.sort((a, b) => a - b)
  return out
}

export function useItemStockQrLookup(stockIds: number[]) {
  const normalizedIds = useMemo(() => normalizeStockIds(stockIds), [stockIds])
  const idsKey = normalizedIds.join(',')

  const query = useQuery({
    queryKey: ['item-stock-qr-lookup', idsKey],
    queryFn: () => lookupItemStockQrCodesApi(normalizedIds),
    enabled: normalizedIds.length > 0,
  })

  const qrByStockId = useMemo(() => {
    const map = new Map<number, ItemStockQrCodeEntry[]>()
    for (const id of normalizedIds) {
      map.set(id, [])
    }
    for (const row of query.data?.items ?? []) {
      map.set(row.item_stock_id, row.qr_codes ?? [])
    }
    return map
  }, [query.data, normalizedIds])

  return {
    ...query,
    qrByStockId,
    normalizedIds,
  }
}
