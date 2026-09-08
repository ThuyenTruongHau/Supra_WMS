import axiosInstance from './axiosInstance'
import type { SortingOrderDetail, SortingOrderSummary } from '@/types/sortingOrder'

export const listSortingOrdersApi = async (
  zoneId: number,
  params?: {
    sorting_wave_id?: number
    status?: string | null
    skip?: number
    limit?: number
  },
): Promise<SortingOrderDetail[]> => {
  const response = await axiosInstance.get<SortingOrderDetail[]>('/api/v1/sorting-order-details/', {
    params: { zone_id: zoneId, ...params, status: params?.status ?? undefined },
  })
  return response.data
}

export const listSortingOrdersByWaveApi = async (
  waveId: number,
  status?: string | null,
): Promise<SortingOrderDetail[]> => {
  const response = await axiosInstance.get<SortingOrderDetail[]>(
    `/api/v1/sorting-order-details/by-wave/${waveId}`,
    { params: { status: status ?? undefined } },
  )
  return response.data
}

export const getSortingOrderApi = async (id: number): Promise<SortingOrderDetail> => {
  const response = await axiosInstance.get<SortingOrderDetail>(`/api/v1/sorting-order-details/${id}`)
  return response.data
}

export const getSortingOrderSummaryApi = async (
  zoneId: number,
): Promise<SortingOrderSummary> => {
  const response = await axiosInstance.get<SortingOrderSummary>(
    '/api/v1/sorting-order-details/summary',
    { params: { zone_id: zoneId } },
  )
  return response.data
}
