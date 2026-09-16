import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getOutboundOrdersApi,
  getOutboundOrderByIdApi,
  getOutboundOrderDetailsApi,
  getOutboundLackedDetailsApi,
  calculateOutboundOrderApi,
  createOutboundOrderApi,
  updateOutboundOrderApi,
  deleteOutboundOrderApi,
  getOutboundRobotTasksApi,
  executeOutboundRobotTaskApi,
  confirmOutboundOrderQrApi,
  confirmOutboundOrderNoQrApi,
} from "@/api/outboundOrder";
import type {
  CalculateOutboundRequest,
  GetOutboundOrdersParams,
  OutboundOrderCreateRequest,
  OutboundOrderDeleteResponse,
  OutboundOrderUpdateRequest,
  OutboundRobotTaskExecuteRequest,
} from "@/types/outbound";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";
import { LIVE_QUERY_OPTIONS } from "@/utils/liveQueryOptions";

export const useGetOutboundOrders = (params: GetOutboundOrdersParams) => {
  return useQuery({
    queryKey: ["outboundOrders", params],
    queryFn: () => getOutboundOrdersApi(params),
    enabled: params.warehouse_id > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useGetOutboundOrderById = (orderId: number | undefined) => {
  return useQuery({
    queryKey: ["outboundOrder", orderId],
    queryFn: () => getOutboundOrderByIdApi(orderId!),
    enabled: !!orderId && orderId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useGetOutboundOrderDetails = (orderId: number | undefined) => {
  return useQuery({
    queryKey: ["outboundOrderDetails", orderId],
    queryFn: () => getOutboundOrderDetailsApi(orderId!),
    enabled: !!orderId && orderId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useGetOutboundLackedDetails = (orderId: number | undefined) => {
  return useQuery({
    queryKey: ["outboundOrderLacked", orderId],
    queryFn: () => getOutboundLackedDetailsApi(orderId!),
    enabled: !!orderId && orderId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useCalculateOutboundOrder = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof calculateOutboundOrderApi>>,
    AxiosError<ApiErrorResponse>,
    { body: CalculateOutboundRequest; strategy?: string }
  >({
    mutationFn: ({ body, strategy }) =>
      calculateOutboundOrderApi(body, strategy),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["outboundOrder", variables.body.outbound_order_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundOrderDetails", variables.body.outbound_order_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundOrderLacked", variables.body.outbound_order_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundRobotTasks", variables.body.outbound_order_id],
      });
    },
  });
};

export const useGetOutboundRobotTasks = (
  orderId: number | undefined,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: ["outboundRobotTasks", orderId],
    queryFn: () => getOutboundRobotTasksApi(orderId!),
    enabled: !!orderId && orderId > 0 && enabled,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useCreateOutboundOrder = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof createOutboundOrderApi>>,
    AxiosError<ApiErrorResponse>,
    { data: OutboundOrderCreateRequest; outboundType: string }
  >({
    mutationFn: ({ data, outboundType }) =>
      createOutboundOrderApi(data, outboundType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outboundOrders"] });
    },
  });
};

export const useUpdateOutboundOrder = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof updateOutboundOrderApi>>,
    AxiosError<ApiErrorResponse>,
    { orderId: number; data: OutboundOrderUpdateRequest; outboundType: string }
  >({
    mutationFn: ({ orderId, data, outboundType }) =>
      updateOutboundOrderApi(orderId, data, outboundType),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["outboundOrders"] });
      queryClient.invalidateQueries({
        queryKey: ["outboundOrder", variables.orderId],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundOrderDetails", variables.orderId],
      });
    },
  });
};

export const useDeleteOutboundOrder = () => {
  const queryClient = useQueryClient();
  return useMutation<
    OutboundOrderDeleteResponse,
    AxiosError<ApiErrorResponse>,
    string
  >({
    mutationFn: deleteOutboundOrderApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outboundOrders"] });
    },
  });
};

export const useExecuteOutboundRobotTask = () => {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    AxiosError<ApiErrorResponse>,
    {
      orderId: number;
      body: OutboundRobotTaskExecuteRequest;
      detailType?: string;
    }
  >({
    mutationFn: ({ body, detailType }) =>
      executeOutboundRobotTaskApi(body, detailType),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["outboundOrder", variables.orderId],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundOrderDetails", variables.orderId],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundRobotTasks", variables.orderId],
      });
    },
  });
};

export const useConfirmOutboundOrderQr = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof confirmOutboundOrderQrApi>>,
    AxiosError<ApiErrorResponse>,
    { orderId: number; qrCode: string }
  >({
    mutationFn: ({ orderId, qrCode }) =>
      confirmOutboundOrderQrApi(orderId, qrCode),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["outboundOrder", variables.orderId],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundOrderDetails", variables.orderId],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundRobotTasks", variables.orderId],
      });
      queryClient.invalidateQueries({ queryKey: ["outboundOrders"] });
    },
  });
};

export const useConfirmOutboundOrderNoQr = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof confirmOutboundOrderNoQrApi>>,
    AxiosError<ApiErrorResponse>,
    { robotTaskOrderId: string; orderId: number }
  >({
    mutationFn: ({ robotTaskOrderId }) =>
      confirmOutboundOrderNoQrApi(robotTaskOrderId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["outboundOrder", variables.orderId],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundOrderDetails", variables.orderId],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundRobotTasks", variables.orderId],
      });
      queryClient.invalidateQueries({
        queryKey: ["outboundOrderLacked", variables.orderId],
      });
      queryClient.invalidateQueries({ queryKey: ["outboundOrders"] });
    },
  });
};

// --- DEMO HOOKS --- 


import {
  assignSortingPositionApi,
  cancelOutboundOrderApi,
  clearSortingStationFillApi,
  completeOutboundOrderApi,
  createOutboundOrderApi as createOutboundOrderApiDemo,
  deleteOutboundOrderApi as deleteOutboundOrderApiDemo,
  getOutboundOrderApi,
  getOutboundSummaryApi,
  getOutboundVehicleProductsApi,
  getSortingStationAssignmentApi,
  listIncompleteVehiclesApi,
  listOutboundOrdersApi,
  listSortingStationFillsApi,
  pickOutboundItemApi,
  unassignSortingPositionApi,
  updateOutboundOrderApi as updateOutboundOrderApiDemo,
} from "@/api/outbound";
import type {
  AssignSortingPositionInput,
  AssignSortingPositionResult,
  ClearSortingStationFillInput,
  ClearSortingStationFillResult,
  CreateOutboundInput,
  IncompleteVehiclesResponse,
  OutboundVehicleProductsResponse,
  OutboundOrder,
  OutboundOrderSummary,
  PickOutboundItemInput,
  SortingStationAssignment,
  SortingStationFillsResponse,
  UnassignSortingPositionInput,
  UnassignSortingPositionResult,
  UpdateOutboundInput,
} from "@/types/outbound";

export const outboundListQueryKey = (
  zoneId: number,
  status?: string,
  search?: string,
) => ["outbound_orders", zoneId, status ?? "", search ?? ""] as const;

export const outboundSummaryQueryKey = (zoneId: number) =>
  ["outbound_summary", zoneId] as const;

export const outboundIncompleteVehiclesQueryKey = (
  zoneId: number,
  availableForAssign = false,
) =>
  [
    "outbound_incomplete_vehicles",
    zoneId,
    availableForAssign ? "assignable" : "all",
  ] as const;

export const outboundDetailQueryKey = (id: number) =>
  ["outbound_order", id] as const;

export const useOutboundList = (
  zoneId: number,
  options?: { status?: string; search?: string },
) => {
  return useQuery<OutboundOrder[], AxiosError<ApiErrorResponse>>({
    queryKey: outboundListQueryKey(zoneId, options?.status, options?.search),
    queryFn: () =>
      listOutboundOrdersApi(zoneId, {
        status: options?.status,
        search: options?.search,
        limit: 200,
      }),
    enabled: zoneId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
  });
};

export const useOutboundSummary = (zoneId: number) => {
  return useQuery<OutboundOrderSummary, AxiosError<ApiErrorResponse>>({
    queryKey: outboundSummaryQueryKey(zoneId),
    queryFn: () => getOutboundSummaryApi(zoneId),
    enabled: zoneId > 0,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
  });
};

/** Loading Wait board — full list (kể cả xe đã gán sorting). */
export const useIncompleteVehicles = (zoneId: number) => {
  return useQuery<IncompleteVehiclesResponse, AxiosError<ApiErrorResponse>>({
    queryKey: outboundIncompleteVehiclesQueryKey(zoneId, false),
    queryFn: () => listIncompleteVehiclesApi(zoneId),
    enabled: zoneId > 0,
    staleTime: 15 * 1000,
    refetchOnMount: "always",
    refetchInterval: 30 * 1000,
  });
};

export const outboundVehicleProductsQueryKey = (
  zoneId: number,
  vehicleNumber: string,
  status = "incomplete",
) =>
  ["outbound_vehicle_products", zoneId, vehicleNumber, status] as const;

export const useOutboundVehicleProducts = (
  zoneId: number,
  vehicleNumber: string | null,
  enabled: boolean,
  status: "incomplete" = "incomplete",
) => {
  const plate = (vehicleNumber || "").trim();
  return useQuery<OutboundVehicleProductsResponse, AxiosError<ApiErrorResponse>>({
    queryKey: outboundVehicleProductsQueryKey(zoneId, plate, status),
    queryFn: () => getOutboundVehicleProductsApi(zoneId, plate, status),
    enabled: enabled && zoneId > 0 && plate.length > 0,
    staleTime: 10 * 1000,
    refetchOnMount: "always",
  });
};

/** Modal gán sorting — chỉ xe/detail chưa có sorting_position. */
export const useAssignableIncompleteVehicles = (
  zoneId: number,
  options?: { enabled?: boolean },
) => {
  return useQuery<IncompleteVehiclesResponse, AxiosError<ApiErrorResponse>>({
    queryKey: outboundIncompleteVehiclesQueryKey(zoneId, true),
    queryFn: () =>
      listIncompleteVehiclesApi(zoneId, { availableForAssign: true }),
    enabled: (options?.enabled ?? true) && zoneId > 0,
    staleTime: 10 * 1000,
    refetchOnMount: "always",
  });
};

export const outboundSortingStationFillsQueryKey = (
  zoneId: number,
  sortingWaveId?: number | null,
) =>
  [
    "outbound_sorting_station_fills",
    zoneId,
    sortingWaveId ?? 0,
  ] as const;

export const useAssignSortingPosition = () => {
  const queryClient = useQueryClient();
  return useMutation<
    AssignSortingPositionResult,
    AxiosError<ApiErrorResponse>,
    AssignSortingPositionInput
  >({
    mutationFn: assignSortingPositionApi,
    onSuccess: (result) => {
      invalidateOutboundQueries(queryClient, result.zone_id);
    },
  });
};

export const useSortingStationAssignment = (
  zoneId: number,
  locationCode: string | null | undefined,
  options?: { enabled?: boolean },
) => {
  return useQuery<SortingStationAssignment, AxiosError<ApiErrorResponse>>({
    queryKey: [
      "outbound_sorting_station_assignment",
      zoneId,
      locationCode ?? "",
    ] as const,
    queryFn: () =>
      getSortingStationAssignmentApi({
        zoneId,
        locationCode: locationCode ?? undefined,
      }),
    enabled:
      (options?.enabled ?? true) && zoneId > 0 && Boolean(locationCode),
    staleTime: 10 * 1000,
  });
};

export const useUnassignSortingPosition = () => {
  const queryClient = useQueryClient();
  return useMutation<
    UnassignSortingPositionResult,
    AxiosError<ApiErrorResponse>,
    UnassignSortingPositionInput
  >({
    mutationFn: unassignSortingPositionApi,
    onSuccess: (result) => {
      invalidateOutboundQueries(queryClient, result.zone_id);
      queryClient.invalidateQueries({
        queryKey: ["outbound_sorting_station_fills", result.zone_id],
      });
    },
  });
};

export const useSortingStationFills = (
  zoneId: number,
  sortingWaveId?: number | null,
  options?: { enabled?: boolean },
) => {
  return useQuery<SortingStationFillsResponse, AxiosError<ApiErrorResponse>>({
    queryKey: outboundSortingStationFillsQueryKey(zoneId, sortingWaveId),
    queryFn: () =>
      listSortingStationFillsApi({
        zoneId,
        sortingWaveId: sortingWaveId ?? undefined,
      }),
    enabled: (options?.enabled ?? true) && zoneId > 0,
    staleTime: 10 * 1000,
    refetchOnMount: "always",
  });
};

export const useClearSortingStationFill = () => {
  const queryClient = useQueryClient();
  return useMutation<
    ClearSortingStationFillResult,
    AxiosError<ApiErrorResponse>,
    ClearSortingStationFillInput
  >({
    mutationFn: clearSortingStationFillApi,
    onSuccess: (result) => {
      // Chỉ invalidate lớp fill + nhãn overlay — không đụng incomplete vehicles / unassign
      queryClient.invalidateQueries({
        queryKey: ["outbound_sorting_station_fills", result.zone_id],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "outbound_sorting_station_assignment",
          result.zone_id,
        ],
      });
    },
  });
};

export const useOutboundById = (id: number) => {
  return useQuery<OutboundOrder, AxiosError<ApiErrorResponse>>({
    queryKey: outboundDetailQueryKey(id),
    queryFn: () => getOutboundOrderApi(id),
    enabled: id > 0,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
  });
};

const invalidateOutboundQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  zoneId?: number,
  orderId?: number,
) => {
  if (orderId) {
    queryClient.invalidateQueries({
      queryKey: outboundDetailQueryKey(orderId),
    });
  }
  if (zoneId) {
    queryClient.invalidateQueries({ queryKey: ["outbound_orders", zoneId] });
    queryClient.invalidateQueries({
      queryKey: outboundSummaryQueryKey(zoneId),
    });
    queryClient.invalidateQueries({
      queryKey: ["outbound_incomplete_vehicles", zoneId],
    });
    queryClient.invalidateQueries({
      queryKey: ["outbound_sorting_station_assignment", zoneId],
    });
    queryClient.invalidateQueries({
      queryKey: ["outbound_sorting_station_fills", zoneId],
    });
    queryClient.invalidateQueries({
      queryKey: ["outbound_tasks_by_wave"],
    });
    queryClient.invalidateQueries({
      queryKey: ["inbound_buffer_map_view", zoneId],
    });
    queryClient.invalidateQueries({
      queryKey: ["warehouse_locations", zoneId],
    });
    queryClient.invalidateQueries({
      queryKey: ["location_stock_labels", zoneId],
    });
  } else {
    queryClient.invalidateQueries({ queryKey: ["outbound_orders"] });
    queryClient.invalidateQueries({ queryKey: ["outbound_summary"] });
    queryClient.invalidateQueries({
      queryKey: ["outbound_incomplete_vehicles"],
    });
    queryClient.invalidateQueries({
      queryKey: ["outbound_sorting_station_assignment"],
    });
    queryClient.invalidateQueries({
      queryKey: ["outbound_sorting_station_fills"],
    });
    queryClient.invalidateQueries({
      queryKey: ["outbound_tasks_by_wave"],
    });
  }
};

export const useCreateOutbound = () => {
  const queryClient = useQueryClient();
  return useMutation<
    OutboundOrder,
    AxiosError<ApiErrorResponse>,
    CreateOutboundInput
  >({
    mutationFn: createOutboundOrderApiDemo as createOutboundOrderApiDemo,
    onSuccess: (order) => {
      invalidateOutboundQueries(queryClient, order.zone_id);
    },
  });
};

export const useUpdateOutbound = () => {
  const queryClient = useQueryClient();
  return useMutation<
    OutboundOrder,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateOutboundInput }
  >({
    mutationFn: ({ id, data }) => updateOutboundOrderApiDemo(id, data),
    onSuccess: (order) => {
      invalidateOutboundQueries(queryClient, order.zone_id, order.id);
    },
  });
};

export const useDeleteOutbound = () => {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    AxiosError<ApiErrorResponse>,
    { id: number; zoneId: number }
  >({
    mutationFn: ({ id }) => deleteOutboundOrderApiDemo(id),
    onSuccess: (_data, variables) => {
      invalidateOutboundQueries(queryClient, variables.zoneId, variables.id);
    },
  });
};

export const usePickOutboundItem = () => {
  const queryClient = useQueryClient();
  return useMutation<
    OutboundOrder,
    AxiosError<ApiErrorResponse>,
    { orderId: number; itemId: number; data: PickOutboundItemInput }
  >({
    mutationFn: ({ orderId, itemId, data }) =>
      pickOutboundItemApi(orderId, itemId, data),
    onSuccess: (order) => {
      invalidateOutboundQueries(queryClient, order.zone_id, order.id);
    },
  });
};

export const useCompleteOutbound = () => {
  const queryClient = useQueryClient();
  return useMutation<OutboundOrder, AxiosError<ApiErrorResponse>, number>({
    mutationFn: completeOutboundOrderApi,
    onSuccess: (order) => {
      invalidateOutboundQueries(queryClient, order.zone_id, order.id);
    },
  });
};

export const useCancelOutbound = () => {
  const queryClient = useQueryClient();
  return useMutation<OutboundOrder, AxiosError<ApiErrorResponse>, number>({
    mutationFn: cancelOutboundOrderApi,
    onSuccess: (order) => {
      invalidateOutboundQueries(queryClient, order.zone_id, order.id);
    },
  });
};
