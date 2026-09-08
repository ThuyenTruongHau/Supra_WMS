import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import {
  cancelInventoryAuditApi,
  completeInventoryAuditApi,
  createInventoryAuditApi,
  deleteInventoryAuditApi,
  getInventoryAuditApi,
  getInventoryAuditSummaryApi,
  listInventoryAuditsApi,
  startInventoryAuditApi,
  updateInventoryAuditDetailApi,
} from '@/api/inventoryAudit'
import type {
  CreateInventoryAuditInput,
  InventoryAuditOrder,
  InventoryAuditSummary,
  UpdateInventoryAuditDetailInput,
} from '@/types/inventoryAudit'
import { ApiErrorResponse } from '@/types/apiError'

export const inventoryAuditListQueryKey = (
  zoneId: number,
  status?: string,
  search?: string,
) => ['inventory_audits', zoneId, status ?? '', search ?? ''] as const

export const inventoryAuditSummaryQueryKey = (zoneId: number) =>
  ['inventory_audit_summary', zoneId] as const

export const inventoryAuditDetailQueryKey = (id: number) =>
  ['inventory_audit', id] as const

const invalidateInventoryAuditQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  zoneId?: number,
  orderId?: number,
) => {
  if (orderId) {
    queryClient.invalidateQueries({ queryKey: inventoryAuditDetailQueryKey(orderId) })
  }
  if (zoneId) {
    queryClient.invalidateQueries({ queryKey: ['inventory_audits', zoneId] })
    queryClient.invalidateQueries({ queryKey: inventoryAuditSummaryQueryKey(zoneId) })
    queryClient.invalidateQueries({ queryKey: ['item_stock_by_zone', zoneId] })
    queryClient.invalidateQueries({ queryKey: ['product_by_zone', zoneId] })
  } else {
    queryClient.invalidateQueries({ queryKey: ['inventory_audits'] })
    queryClient.invalidateQueries({ queryKey: ['inventory_audit_summary'] })
  }
}

export const useInventoryAuditList = (
  zoneId: number,
  options?: { status?: string; search?: string },
) => {
  return useQuery<InventoryAuditOrder[], AxiosError<ApiErrorResponse>>({
    queryKey: inventoryAuditListQueryKey(zoneId, options?.status, options?.search),
    queryFn: () =>
      listInventoryAuditsApi(zoneId, {
        status: options?.status,
        search: options?.search,
        limit: 200,
      }),
    enabled: zoneId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })
}

export const useInventoryAuditSummary = (zoneId: number) => {
  return useQuery<InventoryAuditSummary, AxiosError<ApiErrorResponse>>({
    queryKey: inventoryAuditSummaryQueryKey(zoneId),
    queryFn: () => getInventoryAuditSummaryApi(zoneId),
    enabled: zoneId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })
}

export const useInventoryAuditById = (id: number) => {
  return useQuery<InventoryAuditOrder, AxiosError<ApiErrorResponse>>({
    queryKey: inventoryAuditDetailQueryKey(id),
    queryFn: () => getInventoryAuditApi(id),
    enabled: id > 0,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })
}

export const useCreateInventoryAudit = () => {
  const queryClient = useQueryClient()
  return useMutation<InventoryAuditOrder, AxiosError<ApiErrorResponse>, CreateInventoryAuditInput>({
    mutationFn: createInventoryAuditApi,
    onSuccess: (order) => {
      invalidateInventoryAuditQueries(queryClient, order.zone_id)
    },
  })
}

export const useStartInventoryAudit = () => {
  const queryClient = useQueryClient()
  return useMutation<InventoryAuditOrder, AxiosError<ApiErrorResponse>, number>({
    mutationFn: startInventoryAuditApi,
    onSuccess: (order) => {
      invalidateInventoryAuditQueries(queryClient, order.zone_id, order.id)
    },
  })
}

export const useUpdateInventoryAuditDetail = () => {
  const queryClient = useQueryClient()
  return useMutation<
    InventoryAuditOrder,
    AxiosError<ApiErrorResponse>,
    { orderId: number; detailId: number; data: UpdateInventoryAuditDetailInput }
  >({
    mutationFn: ({ orderId, detailId, data }) =>
      updateInventoryAuditDetailApi(orderId, detailId, data),
    onSuccess: (order) => {
      invalidateInventoryAuditQueries(queryClient, order.zone_id, order.id)
    },
  })
}

export const useCompleteInventoryAudit = () => {
  const queryClient = useQueryClient()
  return useMutation<InventoryAuditOrder, AxiosError<ApiErrorResponse>, number>({
    mutationFn: completeInventoryAuditApi,
    onSuccess: (order) => {
      invalidateInventoryAuditQueries(queryClient, order.zone_id, order.id)
    },
  })
}

export const useCancelInventoryAudit = () => {
  const queryClient = useQueryClient()
  return useMutation<InventoryAuditOrder, AxiosError<ApiErrorResponse>, number>({
    mutationFn: cancelInventoryAuditApi,
    onSuccess: (order) => {
      invalidateInventoryAuditQueries(queryClient, order.zone_id, order.id)
    },
  })
}

export const useDeleteInventoryAudit = () => {
  const queryClient = useQueryClient()
  return useMutation<void, AxiosError<ApiErrorResponse>, { id: number; zoneId: number }>({
    mutationFn: ({ id }) => deleteInventoryAuditApi(id),
    onSuccess: (_data, variables) => {
      invalidateInventoryAuditQueries(queryClient, variables.zoneId, variables.id)
    },
  })
}
