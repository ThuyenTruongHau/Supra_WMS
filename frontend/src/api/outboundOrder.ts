import axiosInstance from './axiosInstance'
import type {
  OutboundOrderAnalyzeResponse,
  OutboundOrderListParams,
  OutboundOrderListResponse,
  OutboundOrderCreateInput,
  OutboundOrderDetail,
  OutboundOrderUpdateInput,
  OutboundOrderDeleteResponse,
  OutboundWorkflowOut,
  OutboundRobotTasksTracking,
  BypassRequestCreateInput,
  OutboundBypassRequest,
} from '@/types/outbound'

const BASE = '/api/v1/outbound-orders'

export const listOutboundOrdersApi = async (params: OutboundOrderListParams) => {
  const { data } = await axiosInstance.get<OutboundOrderListResponse>(BASE, { params })
  return data
}

export const analyzeOutboundApi = async (zoneId: number) => {
  const { data } = await axiosInstance.get<OutboundOrderAnalyzeResponse>(
    `${BASE}/analyze/${zoneId}`,
  )
  return data
}

export const createOutboundOrderApi = async (payload: OutboundOrderCreateInput) => {
  const { data } = await axiosInstance.post(BASE, payload)
  return data
}

export const importOutboundOrderApi = async (
  file: File,
  zoneId: number,
): Promise<OutboundOrderCreateInput> => {
  const formData = new FormData()
  formData.append('zone_id', String(zoneId))
  formData.append('file', file)
  const { data } = await axiosInstance.post<OutboundOrderCreateInput>(
    `${BASE}/import`,
    formData,
    {
      timeout: 5 * 60 * 1000,
    },
  )
  return data
}

export const getOutboundOrderApi = async (orderCode: string) => {
  const { data } = await axiosInstance.get<OutboundOrderDetail>(
    `${BASE}/${orderCode}`,
  )
  return data
}

export const updateOutboundOrderApi = async (
  orderCode: string,
  payload: OutboundOrderUpdateInput,
) => {
  const { data } = await axiosInstance.put<OutboundOrderDetail>(
    `${BASE}/${orderCode}`,
    payload,
  )
  return data
}
export const deleteOutboundOrderApi = async (orderCode: string) => {
  const { data } = await axiosInstance.delete<OutboundOrderDeleteResponse>(
    `${BASE}/${orderCode}`,
  )
  return data
}

export const getOutboundRobotTasksApi = async (orderCode: string) => {
  const { data } = await axiosInstance.get<OutboundRobotTasksTracking>(
    `${BASE}/${orderCode}/robot-tasks/status`,
  )
  return data
}

export const suggestOutboundAllocationsApi = async (orderCode: string) => {
  const { data } = await axiosInstance.post<OutboundWorkflowOut>(
    `${BASE}/${orderCode}/allocations/suggest`,
  )
  return data
}

export const confirmOutboundAllocationsApi = async (orderCode: string) => {
  const { data } = await axiosInstance.post<OutboundWorkflowOut>(
    `${BASE}/${orderCode}/allocations/confirm`,
  )
  return data
}

export const createBypassRequestsApi = async (
  orderCode: string,
  payload: BypassRequestCreateInput = {},
) => {
  const { data } = await axiosInstance.post<OutboundBypassRequest[]>(
    `${BASE}/${orderCode}/bypass-requests`,
    payload,
  )
  return data
}
