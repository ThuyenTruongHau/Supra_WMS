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
  warehouseId: number,
  waveId?: number,
  status?: string | null,
) => ['sorting_orders', warehouseId, waveId ?? '', status ?? 'all'] as const

export const sortingOrderSummaryQueryKey = (warehouseId: number) =>
  ['sorting_order_summary', warehouseId] as const

export const useSortingOrders = (
  warehouseId: number,
  options?: { sortingWaveId?: number; status?: string | null },
) => {
  return useQuery<SortingOrderDetail[], AxiosError<ApiErrorResponse>>({
    queryKey: sortingOrdersQueryKey(
      warehouseId,
      options?.sortingWaveId,
      options?.status,
    ),
    queryFn: () =>
      listSortingOrdersApi(warehouseId, {
        sorting_wave_id: options?.sortingWaveId,
        status: options?.status,
        limit: 200,
      }),
    enabled: warehouseId > 0,
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

export const useSortingOrderSummary = (warehouseId: number) => {
  return useQuery<SortingOrderSummary, AxiosError<ApiErrorResponse>>({
    queryKey: sortingOrderSummaryQueryKey(warehouseId),
    queryFn: () => getSortingOrderSummaryApi(warehouseId),
    enabled: warehouseId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })
}
