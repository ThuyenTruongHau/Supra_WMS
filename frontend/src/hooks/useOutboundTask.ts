import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AxiosError } from 'axios'
import {
  assignCustomerToWaveApi,
  confirmStationStockApi,
  getCurrentOrdersApi,
  getStationProductAggregateApi,
  listOutboundTasksByWaveApi,
  listWaveCustomersApi,
  previewStationStockApi,
  removeWaveCustomerApi,
  sendOutboundTaskCommandApi,
  sendOutboundTaskCommandsApi,
  updateOutboundTaskApi,
} from '@/api/outboundTask'
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
import { ApiErrorResponse } from '@/types/apiError'

export const outboundTasksByWaveQueryKey = (waveId: number) =>
  ['outbound_tasks_by_wave', waveId] as const

export const currentOrdersQueryKey = (warehouseId: number, waveId: number) =>
  ['current_orders', warehouseId, waveId] as const

export const waveCustomersQueryKey = (waveId: number) =>
  ['wave_customers', waveId] as const

export const stationProductAggregateQueryKey = (
  warehouseId: number,
  waveId: number,
  locationId?: number | null,
) => ['station_product_aggregate', warehouseId, waveId, locationId ?? 0] as const

export const useOutboundTasksByWave = (waveId: number) => {
  return useQuery<OutboundTask[], AxiosError<ApiErrorResponse>>({
    queryKey: outboundTasksByWaveQueryKey(waveId),
    queryFn: () => listOutboundTasksByWaveApi(waveId),
    enabled: waveId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })
}

export const useCurrentOrders = (warehouseId: number, waveId: number) => {
  return useQuery<CurrentOrdersResponse, AxiosError<ApiErrorResponse>>({
    queryKey: currentOrdersQueryKey(warehouseId, waveId),
    queryFn: () =>
      getCurrentOrdersApi({ warehouseId, sortingWaveId: waveId }),
    enabled: warehouseId > 0 && waveId > 0,
    staleTime: 15 * 1000,
    refetchOnMount: 'always',
  })
}

export const useWaveCustomers = (waveId: number) => {
  return useQuery<SortingWaveCustomer[], AxiosError<ApiErrorResponse>>({
    queryKey: waveCustomersQueryKey(waveId),
    queryFn: () => listWaveCustomersApi(waveId),
    enabled: waveId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
  })
}

export const useStationProductAggregate = (
  warehouseId: number,
  sortingWaveId: number,
  outboundLocationId?: number | null,
  options?: { enabled?: boolean },
) => {
  return useQuery<StationProductAggregate, AxiosError<ApiErrorResponse>>({
    queryKey: stationProductAggregateQueryKey(
      warehouseId,
      sortingWaveId,
      outboundLocationId,
    ),
    queryFn: () =>
      getStationProductAggregateApi({
        warehouseId,
        sortingWaveId,
        outboundLocationId,
      }),
    enabled: (options?.enabled ?? true) && warehouseId > 0 && sortingWaveId > 0,
    staleTime: 10 * 1000,
    refetchOnMount: 'always',
  })
}

export const usePreviewStationStock = () => {
  return useMutation<
    StationStockPreview,
    AxiosError<ApiErrorResponse>,
    StationStockPreviewInput
  >({
    mutationFn: previewStationStockApi,
  })
}

export const useConfirmStationStock = (waveId: number, warehouseId?: number) => {
  const queryClient = useQueryClient()
  return useMutation<
    StationStockConfirmResult,
    AxiosError<ApiErrorResponse>,
    StationStockPreviewInput
  >({
    mutationFn: confirmStationStockApi,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: outboundTasksByWaveQueryKey(waveId),
      })
      queryClient.invalidateQueries({ queryKey: waveCustomersQueryKey(waveId) })
      queryClient.invalidateQueries({
        queryKey: ['station_product_aggregate'],
      })
      queryClient.invalidateQueries({
        queryKey: ['current_orders'],
      })
      queryClient.invalidateQueries({
        queryKey: ['outbound_incomplete_vehicles'],
      })
      if (warehouseId) {
        queryClient.invalidateQueries({
          queryKey: ['item_stock_by_zone', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['warehouse_locations', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['inbound_buffer_map_view', warehouseId],
        })
      }
    },
  })
}

export const useAssignCustomerToWave = (waveId: number) => {
  const queryClient = useQueryClient()
  return useMutation<
    AssignCustomerToWaveResult,
    AxiosError<ApiErrorResponse>,
    AssignCustomerToWaveInput
  >({
    mutationFn: assignCustomerToWaveApi,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: outboundTasksByWaveQueryKey(waveId),
      })
      queryClient.invalidateQueries({ queryKey: waveCustomersQueryKey(waveId) })
    },
  })
}

export const useRemoveWaveCustomer = (waveId: number) => {
  const queryClient = useQueryClient()
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
    mutationFn: removeWaveCustomerApi,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: outboundTasksByWaveQueryKey(waveId),
      })
      queryClient.invalidateQueries({ queryKey: waveCustomersQueryKey(waveId) })
    },
  })
}

export const useUpdateOutboundTask = (waveId: number) => {
  const queryClient = useQueryClient()
  return useMutation<
    OutboundTask,
    AxiosError<ApiErrorResponse>,
    { taskId: number; data: UpdateOutboundTaskInput }
  >({
    mutationFn: ({ taskId, data }) => updateOutboundTaskApi(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: outboundTasksByWaveQueryKey(waveId),
      })
    },
  })
}

export const useSendOutboundTaskCommand = (waveId: number, warehouseId?: number) => {
  const queryClient = useQueryClient()
  return useMutation<
    OutboundTask,
    AxiosError<ApiErrorResponse>,
    { taskId: number; data: SendOutboundTaskCommandInput }
  >({
    mutationFn: ({ taskId, data }) => sendOutboundTaskCommandApi(taskId, data),
    onSuccess: (task) => {
      queryClient.invalidateQueries({
        queryKey: outboundTasksByWaveQueryKey(waveId),
      })
      queryClient.invalidateQueries({ queryKey: ['outbound_orders'] })
      queryClient.invalidateQueries({ queryKey: ['outbound_summary'] })
      queryClient.invalidateQueries({
        queryKey: ['outbound_order', task.outbound_order_id],
      })
      if (warehouseId) {
        queryClient.invalidateQueries({
          queryKey: currentOrdersQueryKey(warehouseId, waveId),
        })
        queryClient.invalidateQueries({
          queryKey: ['outbound_sorting_station_fills', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['outbound_sorting_station_assignment', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['item_stock_by_zone', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['product_by_zone', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['warehouse_locations', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['location_stock_labels', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['inbound_buffer_map_view', warehouseId],
        })
      }
    },
  })
}

export const useSendOutboundTaskCommands = (waveId: number, warehouseId?: number) => {
  const queryClient = useQueryClient()
  return useMutation<
    SendOutboundTaskCommandsResult,
    AxiosError<ApiErrorResponse>,
    SendOutboundTaskCommandsInput
  >({
    mutationFn: (data) => sendOutboundTaskCommandsApi(data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: outboundTasksByWaveQueryKey(waveId),
      })
      queryClient.invalidateQueries({ queryKey: ['outbound_orders'] })
      queryClient.invalidateQueries({ queryKey: ['outbound_summary'] })
      const orderIds = [
        ...new Set(result.tasks.map((task) => task.outbound_order_id)),
      ]
      for (const orderId of orderIds) {
        queryClient.invalidateQueries({
          queryKey: ['outbound_order', orderId],
        })
      }
      if (warehouseId) {
        queryClient.invalidateQueries({
          queryKey: currentOrdersQueryKey(warehouseId, waveId),
        })
        queryClient.invalidateQueries({
          queryKey: ['outbound_sorting_station_fills', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['outbound_sorting_station_assignment', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['item_stock_by_zone', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['product_by_zone', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['warehouse_locations', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['location_stock_labels', warehouseId],
        })
        queryClient.invalidateQueries({
          queryKey: ['inbound_buffer_map_view', warehouseId],
        })
      }
    },
  })
}
