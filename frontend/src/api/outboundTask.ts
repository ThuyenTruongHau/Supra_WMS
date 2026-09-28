import axiosInstance from './axiosInstance'
import type {
  AssignCustomerToWaveInput,
  AssignCustomerToWaveResult,
  CurrentOrdersResponse,
  OutboundTask,
  SendOutboundTaskCommandInput,
  SendOutboundTaskCommandsInput,
  SendOutboundTaskCommandsResult,
  SortingWaveCustomer,
  StationProductAggregate,
  StationStockConfirmResult,
  StationStockPreview,
  StationStockPreviewInput,
  UpdateOutboundTaskInput,
} from '@/types/outboundTask'

export const listOutboundTasksByWaveApi = async (
  waveId: number,
): Promise<OutboundTask[]> => {
  const response = await axiosInstance.get<OutboundTask[]>(
    `/api/v1/outbound-tasks/by-wave/${waveId}`,
  )
  return response.data
}

export const getCurrentOrdersApi = async (params: {
  warehouseId: number
  sortingWaveId: number
}): Promise<CurrentOrdersResponse> => {
  const response = await axiosInstance.get<CurrentOrdersResponse>(
    '/api/v1/outbound-tasks/current-orders',
    {
      params: {
        zone_id: params.warehouseId,
        sorting_wave_id: params.sortingWaveId,
      },
    },
  )
  return response.data
}

export const listWaveCustomersApi = async (
  waveId: number,
): Promise<SortingWaveCustomer[]> => {
  const response = await axiosInstance.get<SortingWaveCustomer[]>(
    `/api/v1/outbound-tasks/wave-customers/${waveId}`,
  )
  return response.data
}

export const assignCustomerToWaveApi = async (
  data: AssignCustomerToWaveInput,
): Promise<AssignCustomerToWaveResult> => {
  const response = await axiosInstance.post<AssignCustomerToWaveResult>(
    '/api/v1/outbound-tasks/assign-customer',
    data,
  )
  return response.data
}

export const removeWaveCustomerApi = async (
  waveCustomerId: number,
): Promise<void> => {
  await axiosInstance.delete(
    `/api/v1/outbound-tasks/wave-customers/${waveCustomerId}`,
  )
}

export const updateOutboundTaskApi = async (
  taskId: number,
  data: UpdateOutboundTaskInput,
): Promise<OutboundTask> => {
  const response = await axiosInstance.patch<OutboundTask>(
    `/api/v1/outbound-tasks/${taskId}`,
    data,
  )
  return response.data
}

export const sendOutboundTaskCommandApi = async (
  taskId: number,
  data: SendOutboundTaskCommandInput,
): Promise<OutboundTask> => {
  const response = await axiosInstance.patch<OutboundTask>(
    `/api/v1/outbound-tasks/${taskId}/send-command`,
    data,
  )
  return response.data
}

export const sendOutboundTaskCommandsApi = async (
  data: SendOutboundTaskCommandsInput,
): Promise<SendOutboundTaskCommandsResult> => {
  const response = await axiosInstance.post<SendOutboundTaskCommandsResult>(
    '/api/v1/outbound-tasks/send-commands',
    data,
  )
  return response.data
}

export type SyncWaveAssignmentResult = {
  customers_assigned: number
  sorting_orders_created: number
  tasks_created: number
  customers_skipped: number
}

export const syncWaveAssignmentApi = async (
  warehouseId: number,
): Promise<SyncWaveAssignmentResult> => {
  const response = await axiosInstance.post<SyncWaveAssignmentResult>(
    '/api/v1/outbound-tasks/sync-wave-assignment',
    null,
    { params: { zone_id: warehouseId } },
  )
  return response.data
}

export const getStationProductAggregateApi = async (params: {
  warehouseId: number
  sortingWaveId: number
  outboundLocationId?: number | null
}): Promise<StationProductAggregate> => {
  const response = await axiosInstance.get<StationProductAggregate>(
    '/api/v1/outbound-tasks/station-product-aggregate',
    {
      params: {
        zone_id: params.warehouseId,
        sorting_wave_id: params.sortingWaveId,
        ...(params.outboundLocationId
          ? { outbound_location_id: params.outboundLocationId }
          : {}),
      },
    },
  )
  return response.data
}

export const previewStationStockApi = async (
  data: StationStockPreviewInput,
): Promise<StationStockPreview> => {
  const response = await axiosInstance.post<StationStockPreview>(
    '/api/v1/outbound-tasks/station-stock-preview',
    data,
  )
  return response.data
}

export const confirmStationStockApi = async (
  data: StationStockPreviewInput,
): Promise<StationStockConfirmResult> => {
  const response = await axiosInstance.post<StationStockConfirmResult>(
    '/api/v1/outbound-tasks/station-stock-confirm',
    data,
  )
  return response.data
}
