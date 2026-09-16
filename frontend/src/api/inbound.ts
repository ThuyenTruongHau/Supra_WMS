import axiosInstance from './axiosInstance'
import type {
  AssignInboundToBufferInput,
  CreateInboundInput,
  DirectOutboundFromInboundInput,
  DirectOutboundFromInboundResult,
  InboundBufferAssignment,
  InboundDailyReport,
  InboundDetailReport,
  InboundOldestIncomplete,
  InboundOrder,
  InboundOrderByVehicleResponse,
  InboundAssignedDetailsResponse,
  InboundIncompleteVehiclesResponse,
  InboundOperatorBoardSummary,
  InboundOrderSummary,
  InboundVehicleDetailsResponse,
  InboundVehicleProductsResponse,
  InboundVehiclesResponse,
  SendInboundCommandInput,
  SendInboundCommandsInput,
  UnassignInboundFromBufferInput,
  UpdateInboundDetailPickupInput,
  UpdateInboundInput,
  MasanParsePreviewResponse,
  MasanSuggestAllocationPayload,
  MasanSuggestAllocationResponse,
  MasanCreatePayload
} from '@/types/inbound'

export const listInboundOrdersApi = async (
  zoneId: number,
  params?: { status?: string; search?: string; skip?: number; limit?: number },
): Promise<InboundOrder[]> => {
  const response = await axiosInstance.get<InboundOrder[]>('/api/v1/inbound-orders/', {
    params: { zone_id: zoneId, ...params },
  })
  return response.data
}

export const getInboundSummaryApi = async (
  zoneId: number,
): Promise<InboundOrderSummary> => {
  const response = await axiosInstance.get<InboundOrderSummary>(
    '/api/v1/inbound-orders/summary',
    { params: { zone_id: zoneId } },
  )
  return response.data
}

export const getInboundOrderApi = async (id: number): Promise<InboundOrder> => {
  const response = await axiosInstance.get<InboundOrder>(`/api/v1/inbound-orders/${id}`)
  return response.data
}

export const getOldestIncompleteInboundApi = async (
  zoneId: number,
): Promise<InboundOldestIncomplete> => {
  const response = await axiosInstance.get<InboundOldestIncomplete>(
    '/api/v1/inbound-orders/oldest-incomplete',
    { params: { zone_id: zoneId } },
  )
  return response.data
}

export const getInboundDetailReportApi = async (
  orderId: number,
): Promise<InboundDetailReport> => {
  const response = await axiosInstance.get<InboundDetailReport>(
    `/api/v1/inbound-orders/${orderId}/detail-report`,
  )
  return response.data
}

export const getInboundDailyReportApi = async (
  zoneId: number,
  reportDate?: string,
): Promise<InboundDailyReport> => {
  const response = await axiosInstance.get<InboundDailyReport>(
    '/api/v1/inbound-orders/daily-report',
    {
      params: {
        zone_id: zoneId,
        ...(reportDate ? { report_date: reportDate } : {}),
      },
    },
  )
  return response.data
}

export const createInboundOrderApi = async (
  data: CreateInboundInput,
): Promise<InboundOrder> => {
  const response = await axiosInstance.post<InboundOrder>('/api/v1/inbound-orders/', data)
  return response.data
}

export const updateInboundOrderApi = async (
  id: number,
  data: UpdateInboundInput,
): Promise<InboundOrder> => {
  const response = await axiosInstance.patch<InboundOrder>(
    `/api/v1/inbound-orders/${id}`,
    data,
  )
  return response.data
}

export const deleteInboundOrderApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`/api/v1/inbound-orders/${id}`)
}

export const sendInboundCommandApi = async (
  orderId: number,
  detailId: number,
  data: SendInboundCommandInput,
): Promise<InboundOrder> => {
  const response = await axiosInstance.patch<InboundOrder>(
    `/api/v1/inbound-orders/${orderId}/details/${detailId}/send-command`,
    data,
  )
  return response.data
}

export const sendInboundCommandsApi = async (
  orderId: number,
  data: SendInboundCommandsInput,
): Promise<InboundOrder> => {
  const response = await axiosInstance.post<InboundOrder>(
    `/api/v1/inbound-orders/${orderId}/send-commands`,
    data,
  )
  return response.data
}

/** @deprecated Use sendInboundCommandApi */
export const receiveInboundDetailApi = sendInboundCommandApi

export const updateInboundDetailPickupApi = async (
  orderId: number,
  detailId: number,
  data: UpdateInboundDetailPickupInput,
): Promise<InboundOrder> => {
  const response = await axiosInstance.patch<InboundOrder>(
    `/api/v1/inbound-orders/${orderId}/details/${detailId}/pickup-node`,
    data,
  )
  return response.data
}

export const completeInboundOrderApi = async (id: number): Promise<InboundOrder> => {
  const response = await axiosInstance.post<InboundOrder>(
    `/api/v1/inbound-orders/${id}/complete`,
  )
  return response.data
}

export const cancelInboundOrderApi = async (id: number): Promise<InboundOrder> => {
  const response = await axiosInstance.post<InboundOrder>(
    `/api/v1/inbound-orders/${id}/cancel`,
  )
  return response.data
}

export const getInboundOrderVehiclesApi = async (
  orderId: number,
): Promise<InboundVehiclesResponse> => {
  const response = await axiosInstance.get<InboundVehiclesResponse>(
    `/api/v1/inbound-orders/${orderId}/vehicles`,
  )
  return response.data
}

export const getInboundOrderByVehicleApi = async (
  orderId: number,
): Promise<InboundOrderByVehicleResponse> => {
  const response = await axiosInstance.get<InboundOrderByVehicleResponse>(
    `/api/v1/inbound-orders/${orderId}/by-vehicle`,
  )
  return response.data
}

export const getInboundIncompleteVehiclesApi = async (
  orderId: number,
): Promise<InboundIncompleteVehiclesResponse> => {
  const response = await axiosInstance.get<InboundIncompleteVehiclesResponse>(
    `/api/v1/inbound-orders/${orderId}/incomplete-vehicles`,
  )
  return response.data
}

export const getInboundAssignedDetailsApi = async (
  orderId: number,
): Promise<InboundAssignedDetailsResponse> => {
  const response = await axiosInstance.get<InboundAssignedDetailsResponse>(
    `/api/v1/inbound-orders/${orderId}/assigned-details`,
  )
  return response.data
}

export const getInboundOperatorBoardSummaryApi = async (
  orderId: number,
): Promise<InboundOperatorBoardSummary> => {
  const response = await axiosInstance.get<InboundOperatorBoardSummary>(
    `/api/v1/inbound-orders/${orderId}/operator-board-summary`,
  )
  return response.data
}

export const getInboundVehicleProductsApi = async (
  orderId: number,
  vehicleNumber: string,
  status = 'pending',
): Promise<InboundVehicleProductsResponse> => {
  const response = await axiosInstance.get<InboundVehicleProductsResponse>(
    `/api/v1/inbound-orders/${orderId}/vehicles/${encodeURIComponent(vehicleNumber)}/products`,
    { params: { status } },
  )
  return response.data
}

export const getInboundVehicleProductDetailsApi = async (
  orderId: number,
  vehicleNumber: string,
  productId: number,
): Promise<InboundVehicleDetailsResponse> => {
  const response = await axiosInstance.get<InboundVehicleDetailsResponse>(
    `/api/v1/inbound-orders/${orderId}/vehicles/${encodeURIComponent(vehicleNumber)}/products/${productId}/details`,
  )
  return response.data
}

export const assignInboundToBufferApi = async (
  orderId: number,
  data: AssignInboundToBufferInput,
): Promise<InboundOrder> => {
  const response = await axiosInstance.post<InboundOrder>(
    `/api/v1/inbound-orders/${orderId}/assign-to-buffer`,
    data,
  )
  return response.data
}

export const getInboundBufferAssignmentApi = async (
  locationId: number,
): Promise<InboundBufferAssignment> => {
  const response = await axiosInstance.get<InboundBufferAssignment>(
    '/api/v1/inbound-orders/buffer-assignment',
    { params: { location_id: locationId } },
  )
  return response.data
}

export const unassignInboundFromBufferApi = async (
  orderId: number,
  data: UnassignInboundFromBufferInput,
): Promise<InboundOrder> => {
  const response = await axiosInstance.post<InboundOrder>(
    `/api/v1/inbound-orders/${orderId}/unassign-from-buffer`,
    data,
  )
  return response.data
}

export const directOutboundFromInboundApi = async (
  data: DirectOutboundFromInboundInput,
): Promise<DirectOutboundFromInboundResult> => {
  const response = await axiosInstance.post<DirectOutboundFromInboundResult>(
    '/api/v1/inbound-orders/direct-outbound-from-inbound',
    data,
  )
  return response.data
}

export const parseMasanInboundExcelApi = async (
  formData: FormData,
): Promise<MasanParsePreviewResponse> => {
  const response = await axiosInstance.post<MasanParsePreviewResponse>(
    '/api/v1/masan/inbound-orders/parse-preview',
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  )
  return response.data
}

export const suggestMasanAllocationApi = async (
  data: MasanSuggestAllocationPayload,
): Promise<MasanSuggestAllocationResponse> => {
  const response = await axiosInstance.post<MasanSuggestAllocationResponse>(
    '/api/v1/inbound-orders/suggest-allocation',
    data,
  )
  return response.data
}

export const createMasanInboundOrderApi = async (
  data: MasanCreatePayload,
  inboundType = 'auto',
): Promise<InboundOrder> => {
  const response = await axiosInstance.post<InboundOrder>(
    `/api/v1/inbound-orders`,
    data,
    {
      params: { inbound_type: inboundType },
    }
  )
  return response.data
}

