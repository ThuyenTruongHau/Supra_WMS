import { useQuery } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import {
  getSortingOrderSummaryApi,
  listSortingOrdersApi,
  listSortingOrdersByWaveApi,
} from '@/api/sortingOrder'
import type { SortingOrderDetail, SortingOrderSummary } from '@/types/sortingOrder'
import { ApiErrorResponse } from '@/types/apiError'

export const sortingOrdersQueryKey = (
  zoneId: number,
  waveId?: number,
  status?: string | null,
) => ['sorting_orders', zoneId, waveId ?? '', status ?? 'all'] as const

export const sortingOrderSummaryQueryKey = (zoneId: number) =>
  ['sorting_order_summary', zoneId] as const

export const useSortingOrders = (
  zoneId: number,
  options?: { sortingWaveId?: number; status?: string | null },
) => {
  return useQuery<SortingOrderDetail[], AxiosError<ApiErrorResponse>>({
    queryKey: sortingOrdersQueryKey(
      zoneId,
      options?.sortingWaveId,
      options?.status,
    ),
    queryFn: () =>
      listSortingOrdersApi(zoneId, {
        sorting_wave_id: options?.sortingWaveId,
        status: options?.status,
        limit: 200,
      }),
    enabled: zoneId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })
}

export const useSortingOrdersByWave = (
  waveId: number,
  status?: string | null,
) => {
  return useQuery<SortingOrderDetail[], AxiosError<ApiErrorResponse>>({
    queryKey: ['sorting_orders_by_wave', waveId, status] as const,
    queryFn: () => listSortingOrdersByWaveApi(waveId, status),
    enabled: waveId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })
}

export const useSortingOrderSummary = (zoneId: number) => {
  return useQuery<SortingOrderSummary, AxiosError<ApiErrorResponse>>({
    queryKey: sortingOrderSummaryQueryKey(zoneId),
    queryFn: () => getSortingOrderSummaryApi(zoneId),
    enabled: zoneId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })
}
