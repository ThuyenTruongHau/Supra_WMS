import axiosInstance from './axiosInstance'
import type {
  CreateInventoryAuditInput,
  InventoryAuditOrder,
  InventoryAuditSummary,
  UpdateInventoryAuditDetailInput,
} from '@/types/inventoryAudit'

export const listInventoryAuditsApi = async (
  zoneId: number,
  params?: { status?: string; search?: string; skip?: number; limit?: number },
): Promise<InventoryAuditOrder[]> => {
  const response = await axiosInstance.get<InventoryAuditOrder[]>(
    '/api/v1/inventory-audits/',
    { params: { zone_id: zoneId, ...params } },
  )
  return response.data
}

export const getInventoryAuditSummaryApi = async (
  zoneId: number,
): Promise<InventoryAuditSummary> => {
  const response = await axiosInstance.get<InventoryAuditSummary>(
    '/api/v1/inventory-audits/summary',
    { params: { zone_id: zoneId } },
  )
  return response.data
}

export const getInventoryAuditApi = async (id: number): Promise<InventoryAuditOrder> => {
  const response = await axiosInstance.get<InventoryAuditOrder>(
    `/api/v1/inventory-audits/${id}`,
  )
  return response.data
}

export const createInventoryAuditApi = async (
  data: CreateInventoryAuditInput,
): Promise<InventoryAuditOrder> => {
  const response = await axiosInstance.post<InventoryAuditOrder>(
    '/api/v1/inventory-audits/',
    data,
  )
  return response.data
}

export const startInventoryAuditApi = async (id: number): Promise<InventoryAuditOrder> => {
  const response = await axiosInstance.post<InventoryAuditOrder>(
    `/api/v1/inventory-audits/${id}/start`,
  )
  return response.data
}

export const updateInventoryAuditDetailApi = async (
  orderId: number,
  detailId: number,
  data: UpdateInventoryAuditDetailInput,
): Promise<InventoryAuditOrder> => {
  const response = await axiosInstance.patch<InventoryAuditOrder>(
    `/api/v1/inventory-audits/${orderId}/details/${detailId}`,
    data,
  )
  return response.data
}

export const completeInventoryAuditApi = async (id: number): Promise<InventoryAuditOrder> => {
  const response = await axiosInstance.post<InventoryAuditOrder>(
    `/api/v1/inventory-audits/${id}/complete`,
  )
  return response.data
}

export const cancelInventoryAuditApi = async (id: number): Promise<InventoryAuditOrder> => {
  const response = await axiosInstance.post<InventoryAuditOrder>(
    `/api/v1/inventory-audits/${id}/cancel`,
  )
  return response.data
}

export const deleteInventoryAuditApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`/api/v1/inventory-audits/${id}`)
}
