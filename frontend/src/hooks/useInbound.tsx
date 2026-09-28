import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import {
  assignInboundToBufferApi,
  cancelInboundOrderApi,
  completeInboundOrderApi,
  createInboundOrderApi,
  deleteInboundOrderApi,
  directOutboundFromInboundApi,
  getInboundBufferAssignmentApi,
  getInboundOrderApi,
  getInboundOrderByVehicleApi,
  getInboundAssignedDetailsApi,
  getInboundIncompleteVehiclesApi,
  getInboundOperatorBoardSummaryApi,
  getInboundOrderVehiclesApi,
  getInboundSummaryApi,
  getInboundVehicleProductDetailsApi,
  getInboundVehicleProductsApi,
  getOldestIncompleteInboundApi,
  listInboundOrdersApi,
  sendInboundCommandApi,
  sendInboundCommandsApi,
  unassignInboundFromBufferApi,
  updateInboundDetailPickupApi,
  updateInboundOrderApi,
} from '@/api/inboundOperator'
import type {
  AssignInboundToBufferInput,
  CreateInboundInput,
  DirectOutboundFromInboundInput,
  DirectOutboundFromInboundResult,
  InboundBufferAssignment,
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
} from '@/types/inbound'
import { ApiErrorResponse } from '@/types/apiError'

export const inboundListQueryKey = (warehouseId: number, status?: string, search?: string) =>
  ['inbound_orders', warehouseId, status ?? '', search ?? ''] as const

export const inboundSummaryQueryKey = (warehouseId: number) =>
  ['inbound_summary', warehouseId] as const

export const inboundDetailQueryKey = (id: number) => ['inbound_order', id] as const

export const inboundOrderByVehicleQueryKey = (orderId: number) =>
  ['inbound_order_by_vehicle', orderId] as const

export const inboundAssignedDetailsQueryKey = (orderId: number) =>
  ['inbound_assigned_details', orderId] as const

export const inboundIncompleteVehiclesQueryKey = (orderId: number) =>
  ['inbound_incomplete_vehicles', orderId] as const

export const inboundOperatorBoardSummaryQueryKey = (orderId: number) =>
  ['inbound_operator_board_summary', orderId] as const

export const oldestIncompleteInboundQueryKey = (warehouseId: number) =>
  ['inbound_oldest_incomplete', warehouseId] as const

export const useInboundList = (
  warehouseId: number,
  options?: { status?: string; search?: string },
) => {
  return useQuery<InboundOrder[], AxiosError<ApiErrorResponse>>({
    queryKey: inboundListQueryKey(warehouseId, options?.status, options?.search),
    queryFn: () =>
      listInboundOrdersApi(warehouseId, {
        status: options?.status,
        search: options?.search,
        limit: 200,
      }),
    enabled: warehouseId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
  })
}

export const useInboundSummary = (warehouseId: number) => {
  return useQuery<InboundOrderSummary, AxiosError<ApiErrorResponse>>({
    queryKey: inboundSummaryQueryKey(warehouseId),
    queryFn: () => getInboundSummaryApi(warehouseId),
    enabled: warehouseId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
  })
}

export const useInboundById = (id: number) => {
  return useQuery<InboundOrder, AxiosError<ApiErrorResponse>>({
    queryKey: inboundDetailQueryKey(id),
    queryFn: () => getInboundOrderApi(id),
    enabled: id > 0,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
  })
}

export const useInboundOrderByVehicle = (orderId: number, enabled = true) => {
  return useQuery<InboundOrderByVehicleResponse, AxiosError<ApiErrorResponse>>({
    queryKey: inboundOrderByVehicleQueryKey(orderId),
    queryFn: () => getInboundOrderByVehicleApi(orderId),
    enabled: enabled && orderId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
  })
}

export const useInboundAssignedDetails = (orderId: number, enabled = true) => {
  return useQuery<InboundAssignedDetailsResponse, AxiosError<ApiErrorResponse>>({
    queryKey: inboundAssignedDetailsQueryKey(orderId),
    queryFn: () => getInboundAssignedDetailsApi(orderId),
    enabled: enabled && orderId > 0,
    staleTime: 15 * 1000,
    refetchOnMount: 'always',
  })
}

export const useInboundIncompleteVehicles = (
  orderId: number,
  enabled = true,
) => {
  return useQuery<
    InboundIncompleteVehiclesResponse,
    AxiosError<ApiErrorResponse>
  >({
    queryKey: inboundIncompleteVehiclesQueryKey(orderId),
    queryFn: () => getInboundIncompleteVehiclesApi(orderId),
    enabled: enabled && orderId > 0,
    staleTime: 15 * 1000,
    refetchOnMount: 'always',
  })
}

export const useInboundOperatorBoardSummary = (
  orderId: number,
  enabled = true,
) => {
  return useQuery<InboundOperatorBoardSummary, AxiosError<ApiErrorResponse>>({
    queryKey: inboundOperatorBoardSummaryQueryKey(orderId),
    queryFn: () => getInboundOperatorBoardSummaryApi(orderId),
    enabled: enabled && orderId > 0,
    staleTime: 15 * 1000,
    refetchOnMount: 'always',
  })
}

export const useOldestIncompleteInbound = (warehouseId: number) => {
  return useQuery<InboundOldestIncomplete, AxiosError<ApiErrorResponse>>({
    queryKey: oldestIncompleteInboundQueryKey(warehouseId),
    queryFn: () => getOldestIncompleteInboundApi(warehouseId),
    enabled: warehouseId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    retry: (failureCount, error) => {
      if (error.response?.status === 404) return false
      return failureCount < 2
    },
  })
}

const invalidateInboundQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  warehouseId?: number,
  orderId?: number,
) => {
  if (orderId) {
    queryClient.invalidateQueries({ queryKey: inboundDetailQueryKey(orderId) })
    queryClient.invalidateQueries({
      queryKey: inboundOrderByVehicleQueryKey(orderId),
    })
    queryClient.invalidateQueries({
      queryKey: inboundAssignedDetailsQueryKey(orderId),
    })
    queryClient.invalidateQueries({
      queryKey: inboundIncompleteVehiclesQueryKey(orderId),
    })
    queryClient.invalidateQueries({
      queryKey: inboundOperatorBoardSummaryQueryKey(orderId),
    })
  }
  if (warehouseId) {
    queryClient.invalidateQueries({ queryKey: ['inbound_orders', warehouseId] })
    queryClient.invalidateQueries({ queryKey: inboundSummaryQueryKey(warehouseId) })
    queryClient.invalidateQueries({ queryKey: oldestIncompleteInboundQueryKey(warehouseId) })
    queryClient.invalidateQueries({ queryKey: ['item_stock_by_zone', warehouseId] })
    queryClient.invalidateQueries({ queryKey: ['location_stock_labels', warehouseId] })
    queryClient.invalidateQueries({ queryKey: ['inbound_buffer_points', warehouseId] })
    queryClient.invalidateQueries({ queryKey: ['inbound_buffer_map_view', warehouseId] })
    queryClient.invalidateQueries({ queryKey: ['product_by_zone', warehouseId] })
    queryClient.invalidateQueries({ queryKey: ['warehouse_locations', warehouseId] })
  } else {
    queryClient.invalidateQueries({ queryKey: ['inbound_orders'] })
    queryClient.invalidateQueries({ queryKey: ['inbound_summary'] })
    queryClient.invalidateQueries({ queryKey: ['inbound_oldest_incomplete'] })
  }
}

export const useCreateInbound = () => {
  const queryClient = useQueryClient()
  return useMutation<InboundOrder, AxiosError<ApiErrorResponse>, CreateInboundInput>({
    mutationFn: createInboundOrderApi,
    onSuccess: (order) => {
      invalidateInboundQueries(queryClient, order.zone_id)
    },
  })
}

export const useUpdateInbound = () => {
  const queryClient = useQueryClient()
  return useMutation<
    InboundOrder,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateInboundInput }
  >({
    mutationFn: ({ id, data }) => updateInboundOrderApi(id, data),
    onSuccess: (order) => {
      invalidateInboundQueries(queryClient, order.zone_id, order.id)
    },
  })
}

export const useDeleteInbound = () => {
  const queryClient = useQueryClient()
  return useMutation<void, AxiosError<ApiErrorResponse>, { id: number; warehouseId: number }>({
    mutationFn: ({ id }) => deleteInboundOrderApi(id),
    onSuccess: (_data, variables) => {
      invalidateInboundQueries(queryClient, variables.warehouseId, variables.id)
    },
  })
}

export const useSendInboundCommand = () => {
  const queryClient = useQueryClient()
  return useMutation<
    InboundOrder,
    AxiosError<ApiErrorResponse>,
    { orderId: number; detailId: number; data: SendInboundCommandInput }
  >({
    mutationFn: ({ orderId, detailId, data }) =>
      sendInboundCommandApi(orderId, detailId, data),
    onSuccess: (order) => {
      invalidateInboundQueries(queryClient, order.zone_id, order.id)
    },
  })
}

export const useSendInboundCommands = () => {
  const queryClient = useQueryClient()
  return useMutation<
    InboundOrder,
    AxiosError<ApiErrorResponse>,
    { orderId: number; data: SendInboundCommandsInput }
  >({
    mutationFn: ({ orderId, data }) => sendInboundCommandsApi(orderId, data),
    onSuccess: (order) => {
      invalidateInboundQueries(queryClient, order.zone_id, order.id)
      queryClient.invalidateQueries({
        queryKey: inboundAssignedDetailsQueryKey(order.id),
      })
      queryClient.invalidateQueries({
        queryKey: inboundOrderVehiclesQueryKey(order.id),
      })
      queryClient.invalidateQueries({
        queryKey: ['inbound_buffer_map_view', order.zone_id],
      })
      queryClient.invalidateQueries({
        queryKey: ['inbound_buffer_points', order.zone_id],
      })
      queryClient.invalidateQueries({
        queryKey: ['location_stock_labels', order.zone_id],
      })
    },
  })
}

/** @deprecated Use useSendInboundCommand */
export const useReceiveInboundDetail = useSendInboundCommand

export const useUpdateInboundDetailPickup = () => {
  const queryClient = useQueryClient()
  return useMutation<
    InboundOrder,
    AxiosError<ApiErrorResponse>,
    { orderId: number; detailId: number; data: UpdateInboundDetailPickupInput }
  >({
    mutationFn: ({ orderId, detailId, data }) =>
      updateInboundDetailPickupApi(orderId, detailId, data),
    onSuccess: (order) => {
      queryClient.setQueryData(inboundDetailQueryKey(order.id), order)
    },
  })
}

export const useCompleteInbound = () => {
  const queryClient = useQueryClient()
  return useMutation<InboundOrder, AxiosError<ApiErrorResponse>, number>({
    mutationFn: completeInboundOrderApi,
    onSuccess: (order) => {
      invalidateInboundQueries(queryClient, order.zone_id, order.id)
    },
  })
}

export const useCancelInbound = () => {
  const queryClient = useQueryClient()
  return useMutation<InboundOrder, AxiosError<ApiErrorResponse>, number>({
    mutationFn: cancelInboundOrderApi,
    onSuccess: (order) => {
      invalidateInboundQueries(queryClient, order.zone_id, order.id)
    },
  })
}

export const inboundOrderVehiclesQueryKey = (orderId: number) =>
  ['inbound_order_vehicles', orderId] as const

export const inboundVehicleProductsQueryKey = (
  orderId: number,
  vehicleNumber: string,
  status: string = 'pending',
) => ['inbound_vehicle_products', orderId, vehicleNumber, status] as const

export const useInboundOrderVehicles = (orderId: number, enabled = true) => {
  return useQuery<InboundVehiclesResponse, AxiosError<ApiErrorResponse>>({
    queryKey: inboundOrderVehiclesQueryKey(orderId),
    queryFn: () => getInboundOrderVehiclesApi(orderId),
    enabled: enabled && orderId > 0,
    staleTime: 15 * 1000,
  })
}

export const useInboundVehicleProducts = (
  orderId: number,
  vehicleNumber: string | null,
  enabled = true,
  status: 'pending' | 'incomplete' = 'pending',
) => {
  const plate = vehicleNumber?.trim() ?? ''
  return useQuery<InboundVehicleProductsResponse, AxiosError<ApiErrorResponse>>({
    queryKey: inboundVehicleProductsQueryKey(orderId, plate, status),
    queryFn: () => getInboundVehicleProductsApi(orderId, plate, status),
    enabled: enabled && orderId > 0 && plate.length > 0,
    staleTime: 15 * 1000,
  })
}

export const inboundVehicleProductDetailsQueryKey = (
  orderId: number,
  vehicleNumber: string,
  productId: number,
) =>
  ['inbound_vehicle_product_details', orderId, vehicleNumber, productId] as const

export const useInboundVehicleProductDetails = (
  orderId: number,
  vehicleNumber: string | null,
  productId: number | null,
  enabled = true,
) => {
  const plate = vehicleNumber?.trim() ?? ''
  const pid = productId ?? 0
  return useQuery<InboundVehicleDetailsResponse, AxiosError<ApiErrorResponse>>({
    queryKey: inboundVehicleProductDetailsQueryKey(orderId, plate, pid),
    queryFn: () => getInboundVehicleProductDetailsApi(orderId, plate, pid),
    enabled: enabled && orderId > 0 && plate.length > 0 && pid > 0,
    staleTime: 15 * 1000,
  })
}

export const useAssignInboundToBuffer = () => {
  const queryClient = useQueryClient()
  return useMutation<
    InboundOrder,
    AxiosError<ApiErrorResponse>,
    { orderId: number; data: AssignInboundToBufferInput }
  >({
    mutationFn: ({ orderId, data }) => assignInboundToBufferApi(orderId, data),
    onSuccess: (order) => {
      invalidateInboundQueries(queryClient, order.zone_id, order.id)
      queryClient.invalidateQueries({
        queryKey: inboundAssignedDetailsQueryKey(order.id),
      })
      queryClient.invalidateQueries({
        queryKey: inboundOrderVehiclesQueryKey(order.id),
      })
      queryClient.invalidateQueries({
        queryKey: ['inbound_vehicle_products', order.id],
      })
      queryClient.invalidateQueries({
        queryKey: ['inbound_vehicle_product_details', order.id],
      })
    },
  })
}

export const useInboundBufferAssignment = (
  locationId: number | null,
  enabled = true,
) => {
  return useQuery<InboundBufferAssignment, AxiosError<ApiErrorResponse>>({
    queryKey: ['inbound_buffer_assignment', locationId],
    queryFn: () => getInboundBufferAssignmentApi(locationId!),
    enabled: enabled && (locationId ?? 0) > 0,
    staleTime: 5 * 1000,
  })
}

export const useUnassignInboundFromBuffer = () => {
  const queryClient = useQueryClient()
  return useMutation<
    InboundOrder,
    AxiosError<ApiErrorResponse>,
    { orderId: number; data: UnassignInboundFromBufferInput }
  >({
    mutationFn: ({ orderId, data }) => unassignInboundFromBufferApi(orderId, data),
    onSuccess: (order, variables) => {
      invalidateInboundQueries(queryClient, order.zone_id, order.id)
      queryClient.invalidateQueries({
        queryKey: inboundAssignedDetailsQueryKey(order.id),
      })
      queryClient.invalidateQueries({
        queryKey: ['inbound_buffer_assignment', variables.data.location_id],
      })
      queryClient.invalidateQueries({
        queryKey: inboundOrderVehiclesQueryKey(order.id),
      })
      // Ép map buffer lấy status mới (empty/less) ngay sau hủy gán
      queryClient.invalidateQueries({
        queryKey: ['inbound_buffer_map_view', order.zone_id],
      })
      queryClient.invalidateQueries({
        queryKey: ['inbound_buffer_points', order.zone_id],
      })
      queryClient.invalidateQueries({
        queryKey: ['location_stock_labels', order.zone_id],
      })
    },
  })
}

export const useDirectOutboundFromInbound = () => {
  const queryClient = useQueryClient()
  return useMutation<
    DirectOutboundFromInboundResult,
    AxiosError<ApiErrorResponse>,
    DirectOutboundFromInboundInput
  >({
    mutationFn: directOutboundFromInboundApi,
    onSuccess: (result) => {
      const warehouseId = result.zone_id
      invalidateInboundQueries(queryClient, warehouseId, result.inbound_order_id)
      queryClient.invalidateQueries({
        queryKey: inboundAssignedDetailsQueryKey(result.inbound_order_id),
      })
      queryClient.invalidateQueries({
        queryKey: ['inbound_buffer_assignment', result.inbound_location_id],
      })
      queryClient.invalidateQueries({
        queryKey: ['inbound_buffer_map_view', warehouseId],
      })
      queryClient.invalidateQueries({
        queryKey: ['inbound_buffer_points', warehouseId],
      })
      queryClient.invalidateQueries({
        queryKey: ['location_stock_labels', warehouseId],
      })
      queryClient.invalidateQueries({
        queryKey: ['storage_relocate_commands', warehouseId],
      })
      queryClient.invalidateQueries({
        queryKey: ['item_stock_by_zone', warehouseId],
      })
      queryClient.invalidateQueries({
        queryKey: ['warehouse_locations', warehouseId],
      })
      queryClient.invalidateQueries({
        queryKey: ['station_product_aggregate'],
      })
      queryClient.invalidateQueries({
        queryKey: ['outbound_tasks_by_wave'],
      })
      queryClient.invalidateQueries({
        queryKey: ['incomplete_vehicles', warehouseId],
      })
      queryClient.invalidateQueries({
        queryKey: ['current_orders', warehouseId],
      })
      queryClient.invalidateQueries({
        queryKey: ['outbound_sorting_station_fills', warehouseId],
      })
      queryClient.invalidateQueries({
        queryKey: ['outbound_sorting_station_assignment', warehouseId],
      })
      queryClient.invalidateQueries({
        queryKey: ['outbound_orders'],
      })
      queryClient.invalidateQueries({
        queryKey: ['inbound_oldest_incomplete', warehouseId],
      })
    },
  })
}
