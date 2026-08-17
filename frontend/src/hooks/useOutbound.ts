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
