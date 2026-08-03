import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { analyzeOutboundApi, listOutboundOrdersApi } from '@/api/outboundOrder'
import type {
  OutboundOrderAnalyzeResponse,
  OutboundOrderListParams,
  OutboundOrderListResponse,
  OutboundOrderDetail,
  OutboundOrderCreateInput,
  OutboundOrderUpdateInput,
  OutboundOrderDeleteResponse,
  OutboundWorkflowOut,
  OutboundRobotTasksTracking,
  BypassRequestCreateInput,
  OutboundBypassRequest,
} from '@/types/outbound'
import {
  createOutboundOrderApi,
  importOutboundOrderApi,
  getOutboundOrderApi,
  updateOutboundOrderApi,
  deleteOutboundOrderApi,
  getOutboundRobotTasksApi,
  suggestOutboundAllocationsApi,
  confirmOutboundAllocationsApi,
  createBypassRequestsApi,
} from '@/api/outboundOrder'
import type { AxiosError } from 'axios'
import type { ApiErrorResponse } from '@/types/apiError'


export const useOutboundOrders = (params: OutboundOrderListParams) => {
  return useQuery<OutboundOrderListResponse, Error>({
    queryKey: ['outbound_orders', params],
    queryFn: () => listOutboundOrdersApi(params),
    enabled: (params.zone_id ?? 0) > 0,
    staleTime: 5 * 60 * 1000,
  })
}

export const useOutboundAnalyze = (zoneId: number) => {
  return useQuery<OutboundOrderAnalyzeResponse, Error>({
    queryKey: ['outbound_analyze', zoneId],
    queryFn: () => analyzeOutboundApi(zoneId),
    enabled: zoneId > 0,
    staleTime: 5 * 60 * 1000,
  })
}

export const useCreateOutboundOrder = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createOutboundOrderApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound_orders'] })
      queryClient.invalidateQueries({ queryKey: ['outbound_analyze'] })
    },
  })
}

export const useImportOutboundOrder = () => {
  return useMutation<
    OutboundOrderCreateInput,
    AxiosError<ApiErrorResponse>,
    { file: File; zoneId: number }
  >({
    mutationFn: ({ file, zoneId }) => importOutboundOrderApi(file, zoneId),
  })
}

export const useOutboundOrderDetail = (orderCode?: string) => {
  return useQuery<OutboundOrderDetail, Error>({
    queryKey: ['outbound_order_detail', orderCode],
    queryFn: () => getOutboundOrderApi(orderCode!),
    enabled: !!orderCode, // chỉ gọi khi có order_code trên URL
    staleTime: 5 * 60 * 1000,
  })
}

export const useOutboundRobotTasks = (
  orderCode?: string,
  options?: { enabled?: boolean },
) => {
  return useQuery<OutboundRobotTasksTracking, Error>({
    queryKey: ['outbound_robot_tasks', orderCode],
    queryFn: () => getOutboundRobotTasksApi(orderCode!),
    enabled: !!orderCode && (options?.enabled ?? true),
    staleTime: 30 * 1000,
  })
}

export const useUpdateOutboundOrder = () => {
  const queryClient = useQueryClient()
  return useMutation<
    OutboundOrderDetail,
    Error,
    { orderCode: string; data: OutboundOrderUpdateInput }
  >({
    mutationFn: ({ orderCode, data }) => updateOutboundOrderApi(orderCode, data),
    onSuccess: (_, { orderCode }) => {
      queryClient.invalidateQueries({ queryKey: ['outbound_orders'] })
      queryClient.invalidateQueries({ queryKey: ['outbound_order_detail', orderCode] })
      queryClient.invalidateQueries({ queryKey: ['outbound_analyze'] })
    },
  })
}
export const useDeleteOutboundOrder = () => {
  const queryClient = useQueryClient()
  return useMutation<OutboundOrderDeleteResponse, Error, string>({
    mutationFn: deleteOutboundOrderApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['outbound_orders'] })
      queryClient.invalidateQueries({ queryKey: ['outbound_analyze'] })
    },
  })
}

const invalidateOutboundWorkflow = (
  queryClient: ReturnType<typeof useQueryClient>,
  orderCode: string,
) => {
  queryClient.invalidateQueries({ queryKey: ['outbound_orders'] })
  queryClient.invalidateQueries({ queryKey: ['outbound_order_detail', orderCode] })
  queryClient.invalidateQueries({ queryKey: ['outbound_robot_tasks', orderCode] })
  queryClient.invalidateQueries({ queryKey: ['outbound_analyze'] })
}

export const useSuggestOutboundAllocations = () => {
  const queryClient = useQueryClient()
  return useMutation<OutboundWorkflowOut, AxiosError<ApiErrorResponse>, string>({
    mutationFn: suggestOutboundAllocationsApi,
    onSuccess: (_, orderCode) => {
      invalidateOutboundWorkflow(queryClient, orderCode)
    },
  })
}

export const useConfirmOutboundAllocations = () => {
  const queryClient = useQueryClient()
  return useMutation<OutboundWorkflowOut, AxiosError<ApiErrorResponse>, string>({
    mutationFn: confirmOutboundAllocationsApi,
    onSuccess: (_, orderCode) => {
      invalidateOutboundWorkflow(queryClient, orderCode)
    },
  })
}

export const useCreateBypassRequests = () => {
  const queryClient = useQueryClient()
  return useMutation<
    OutboundBypassRequest[],
    AxiosError<ApiErrorResponse>,
    { orderCode: string; data?: BypassRequestCreateInput }
  >({
    mutationFn: ({ orderCode, data }) =>
      createBypassRequestsApi(orderCode, data ?? {}),
    onSuccess: (_, { orderCode }) => {
      invalidateOutboundWorkflow(queryClient, orderCode)
    },
  })
}
