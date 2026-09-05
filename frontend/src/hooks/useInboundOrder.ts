import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getInboundOrdersApi,
  getInboundOrderDetailsApi,
  suggestInboundAllocationApi,
  releaseInboundLocationsApi,
  createInboundOrderApi,
  updateInboundOrderApi,
  deleteInboundOrderApi,
  acceptInboundTaskApi,
  assignOrGetItemStockApi,
  cacheForPackingUserApi,
  getPackingUserStocksApi,
  previewQrCodeApi,
  callerInboundOrderApi,
} from "@/api/inboundOrder";
import type {
  AssignOrGetItemStockRequest,
  CacheForPackingUserRequest,
  GetInboundOrdersParams,
  InboundOrderCreateRequest,
  InboundOrderDeleteResponse,
  InboundOrderUpdateRequest,
  InboundReleaseLocationsRequest,
  InboundSuggestAllocationRequest,
  QrCodePreviewRequest,
} from "@/types/inboundOrder";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";
import { LIVE_QUERY_OPTIONS } from "@/utils/liveQueryOptions";

export const useGetInboundOrders = (params: GetInboundOrdersParams) => {
  return useQuery({
    queryKey: ["inboundOrders", params],
    queryFn: () => getInboundOrdersApi(params),
    enabled: params.warehouse_id > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useGetInboundOrderDetails = (orderCode: string | undefined) => {
  return useQuery({
    queryKey: ["inboundOrderDetails", orderCode],
    queryFn: () => getInboundOrderDetailsApi(orderCode!),
    enabled: !!orderCode,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useSuggestInboundAllocation = () => {
  return useMutation({
    mutationFn: (body: InboundSuggestAllocationRequest) =>
      suggestInboundAllocationApi(body),
  });
};

export const useReleaseInboundLocations = () => {
  return useMutation({
    mutationFn: (body: InboundReleaseLocationsRequest) =>
      releaseInboundLocationsApi(body),
  });
};

export const useCreateInboundOrder = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof createInboundOrderApi>>,
    AxiosError<ApiErrorResponse>,
    { data: InboundOrderCreateRequest; inboundType: string }
  >({
    mutationFn: ({ data, inboundType }) =>
      createInboundOrderApi(data, inboundType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inboundOrders"] });
    },
  });
};

export const useUpdateInboundOrder = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof updateInboundOrderApi>>,
    AxiosError<ApiErrorResponse>,
    { orderCode: string; data: InboundOrderUpdateRequest; inboundType: string }
  >({
    mutationFn: ({ orderCode, data, inboundType }) =>
      updateInboundOrderApi(orderCode, data, inboundType),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["inboundOrders"] });
      queryClient.invalidateQueries({
        queryKey: ["inboundOrderDetails", variables.orderCode],
      });
    },
  });
};

export const useDeleteInboundOrder = () => {
  const queryClient = useQueryClient();
  return useMutation<
    InboundOrderDeleteResponse,
    AxiosError<ApiErrorResponse>,
    string
  >({
    mutationFn: deleteInboundOrderApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inboundOrders"] });
    },
  });
};

export const useAcceptInboundTask = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (detailId: number) => acceptInboundTaskApi(detailId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inboundOrderDetails"] });
      queryClient.invalidateQueries({ queryKey: ["inboundOrders"] });
    },
  });
};

export const useAssignOrGetItemStock = () => {
  return useMutation({
    mutationFn: (body: AssignOrGetItemStockRequest) =>
      assignOrGetItemStockApi(body),
  });
};

export const usePreviewQrCode = () => {
  return useMutation({
    mutationFn: (body: QrCodePreviewRequest) => previewQrCodeApi(body),
  });
};

export const useCacheForPackingUser = () => {
  return useMutation({
    mutationFn: (body: CacheForPackingUserRequest) =>
      cacheForPackingUserApi(body),
  });
};

export const useGetPackingUserStocks = () => {
  return useMutation({
    mutationFn: (packingUser: string) => getPackingUserStocksApi(packingUser),
  });
};

export const useCallerInboundOrder = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Awaited<ReturnType<typeof callerInboundOrderApi>>,
    AxiosError<ApiErrorResponse>,
    { data: InboundOrderCreateRequest; inboundType: string }
  >({
    mutationFn: ({ data, inboundType }) =>
      callerInboundOrderApi(data, inboundType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inboundOrders"] });
    },
  });
};
