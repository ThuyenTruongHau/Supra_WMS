import axiosInstance from './axiosInstance'
import type {
  AssignSortingPositionInput,
  AssignSortingPositionResult,
  ClearSortingStationFillInput,
  ClearSortingStationFillResult,
  CreateOutboundInput,
  IncompleteVehiclesResponse,
  OutboundVehicleProductsResponse,
  ItemOutbound,
  ItemOutboundPick,
  OutboundDailyReport,
  OutboundDetailGroup,
  OutboundOrder,
  OutboundOrderSummary,
  PickOutboundItemInput,
  SortingStationAssignment,
  SortingStationFillsResponse,
  UnassignSortingPositionInput,
  UnassignSortingPositionResult,
  UpdateOutboundInput,
} from '@/types/outbound'

const toIntegerOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? Math.trunc(num) : null
}

const toInteger = (value: unknown): number => toIntegerOrNull(value) ?? 0

const normalizePick = (pick: ItemOutboundPick): ItemOutboundPick => ({
  ...pick,
  quantity: toInteger(pick.quantity),
})

const normalizeItem = (item: ItemOutbound): ItemOutbound => ({
  ...item,
  requested_quantity: toInteger(item.requested_quantity),
  pallet_quantity: toIntegerOrNull(item.pallet_quantity),
  picked_quantity: toInteger(item.picked_quantity),
  picks: item.picks.map(normalizePick),
})

const normalizeDetailGroup = (
  group: OutboundDetailGroup,
): OutboundDetailGroup => ({
  ...group,
  items: group.items.map(normalizeItem),
})

const normalizeOutboundOrder = (order: OutboundOrder): OutboundOrder => ({
  ...order,
  detail_groups: order.detail_groups.map(normalizeDetailGroup),
})

export const listOutboundOrdersApi = async (
  zoneId: number,
  params?: { status?: string; search?: string; skip?: number; limit?: number },
): Promise<OutboundOrder[]> => {
  const response = await axiosInstance.get<OutboundOrder[]>('/api/v1/outbound-orders/', {
    params: { zone_id: zoneId, ...params },
  })
  return response.data.map(normalizeOutboundOrder)
}

export const getOutboundSummaryApi = async (
  zoneId: number,
): Promise<OutboundOrderSummary> => {
  const response = await axiosInstance.get<OutboundOrderSummary>(
    '/api/v1/outbound-orders/summary',
    { params: { zone_id: zoneId } },
  )
  return response.data
}

export const listIncompleteVehiclesApi = async (
  zoneId: number,
  options?: { availableForAssign?: boolean },
): Promise<IncompleteVehiclesResponse> => {
  const response = await axiosInstance.get<IncompleteVehiclesResponse>(
    '/api/v1/outbound-orders/incomplete-vehicles',
    {
      params: {
        zone_id: zoneId,
        ...(options?.availableForAssign ? { available_for_assign: true } : {}),
      },
    },
  )
  return response.data
}

export const getOutboundVehicleProductsApi = async (
  zoneId: number,
  vehicleNumber: string,
  status: 'incomplete' = 'incomplete',
): Promise<OutboundVehicleProductsResponse> => {
  const response = await axiosInstance.get<OutboundVehicleProductsResponse>(
    `/api/v1/outbound-orders/incomplete-vehicles/${encodeURIComponent(vehicleNumber)}/products`,
    { params: { zone_id: zoneId, status } },
  )
  return {
    ...response.data,
    products: response.data.products.map((line) => ({
      ...line,
      total_quantity: toInteger(line.total_quantity),
      total_pallet_quantity: toInteger(line.total_pallet_quantity),
      statuses: line.statuses ?? [],
    })),
  }
}

export const assignSortingPositionApi = async (
  data: AssignSortingPositionInput,
): Promise<AssignSortingPositionResult> => {
  const response = await axiosInstance.post<AssignSortingPositionResult>(
    '/api/v1/outbound-orders/assign-sorting-position',
    data,
  )
  return response.data
}

export const getSortingStationAssignmentApi = async (params: {
  zoneId: number
  locationCode?: string | null
  locationId?: number | null
}): Promise<SortingStationAssignment> => {
  const response = await axiosInstance.get<SortingStationAssignment>(
    '/api/v1/outbound-orders/sorting-station-assignment',
    {
      params: {
        zone_id: params.zoneId,
        ...(params.locationCode ? { location_code: params.locationCode } : {}),
        ...(params.locationId ? { location_id: params.locationId } : {}),
      },
    },
  )
  return response.data
}

export const listSortingStationFillsApi = async (params: {
  zoneId: number
  sortingWaveId?: number | null
}): Promise<SortingStationFillsResponse> => {
  const response = await axiosInstance.get<SortingStationFillsResponse>(
    '/api/v1/outbound-orders/sorting-station-fills',
    {
      params: {
        zone_id: params.zoneId,
        ...(params.sortingWaveId
          ? { sorting_wave_id: params.sortingWaveId }
          : {}),
      },
    },
  )
  return response.data
}

export const clearSortingStationFillApi = async (
  data: ClearSortingStationFillInput,
): Promise<ClearSortingStationFillResult> => {
  const response = await axiosInstance.post<ClearSortingStationFillResult>(
    '/api/v1/outbound-orders/clear-sorting-station-fill',
    data,
  )
  return response.data
}

export const unassignSortingPositionApi = async (
  data: UnassignSortingPositionInput,
): Promise<UnassignSortingPositionResult> => {
  const response = await axiosInstance.post<UnassignSortingPositionResult>(
    '/api/v1/outbound-orders/unassign-sorting-position',
    data,
  )
  return response.data
}

export const getOutboundOrderApi = async (id: number): Promise<OutboundOrder> => {
  const response = await axiosInstance.get<OutboundOrder>(`/api/v1/outbound-orders/${id}`)
  return normalizeOutboundOrder(response.data)
}

export const createOutboundOrderApi = async (
  data: CreateOutboundInput,
): Promise<OutboundOrder> => {
  const response = await axiosInstance.post<OutboundOrder>('/api/v1/outbound-orders/', data)
  return normalizeOutboundOrder(response.data)
}

export const updateOutboundOrderApi = async (
  id: number,
  data: UpdateOutboundInput,
): Promise<OutboundOrder> => {
  const response = await axiosInstance.patch<OutboundOrder>(
    `/api/v1/outbound-orders/${id}`,
    data,
  )
  return normalizeOutboundOrder(response.data)
}

export const deleteOutboundOrderApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`/api/v1/outbound-orders/${id}`)
}

export const pickOutboundItemApi = async (
  orderId: number,
  itemId: number,
  data: PickOutboundItemInput,
): Promise<OutboundOrder> => {
  const response = await axiosInstance.patch<OutboundOrder>(
    `/api/v1/outbound-orders/${orderId}/items/${itemId}`,
    data,
  )
  return normalizeOutboundOrder(response.data)
}

export const completeOutboundOrderApi = async (id: number): Promise<OutboundOrder> => {
  const response = await axiosInstance.post<OutboundOrder>(
    `/api/v1/outbound-orders/${id}/complete`,
  )
  return normalizeOutboundOrder(response.data)
}

export const cancelOutboundOrderApi = async (id: number): Promise<OutboundOrder> => {
  const response = await axiosInstance.post<OutboundOrder>(
    `/api/v1/outbound-orders/${id}/cancel`,
  )
  return normalizeOutboundOrder(response.data)
}

const normalizeDailyReportLine = (
  line: OutboundDailyReport['lines'][number],
): OutboundDailyReport['lines'][number] => ({
  ...line,
  quantity: toInteger(line.quantity),
  pallet_count: toInteger(line.pallet_count),
})

export const getOutboundDailyReportApi = async (
  zoneId: number,
  reportDate?: string,
): Promise<OutboundDailyReport> => {
  const response = await axiosInstance.get<OutboundDailyReport>(
    '/api/v1/outbound-orders/daily-report',
    {
      params: {
        zone_id: zoneId,
        ...(reportDate ? { report_date: reportDate } : {}),
      },
    },
  )
  return {
    ...response.data,
    lines: response.data.lines.map(normalizeDailyReportLine),
  }
}
