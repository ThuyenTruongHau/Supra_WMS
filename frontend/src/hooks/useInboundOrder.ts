import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getInboundOrdersApi,
  getInboundVehiclesApi,
  getInboundOrderDetailApi,
  draftInboundOrderApi,
  getStorageLocationSuggestionsApi,
  createInboundOrderApi,
  receiveInboundOrderDetailApi
} from '@/api/inboundOrder';
import {
  GetInboundOrdersParams,
  CreateInboundOrderRequest,
  ReceiveInboundOrderDetailRequest
} from '@/types/inboundOrder';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';

export const useGetInboundVehicles = (zone_id?: number) => {
  return useQuery({
    queryKey: ['inboundVehicles', zone_id],
    queryFn: () => getInboundVehiclesApi(zone_id!),
    enabled: !!zone_id,
    staleTime: 5 * 60 * 1000,
  });
};

export const useGetInboundOrders = (params: GetInboundOrdersParams) => {
  return useInfiniteQuery({
    queryKey: ['inboundOrders', params],
    queryFn: async ({ pageParam }) => {
      const query = { ...params, cursor: pageParam || undefined, limit: params.limit ?? 10 };
      return getInboundOrdersApi(query);
    },
    initialPageParam: undefined as string | number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: params.zone_id > 0,
    staleTime: 5 * 60 * 1000,
  });
};

export const useGetInboundOrderDetail = (orderCode: string | undefined) => {
  return useQuery({
    queryKey: ['inboundOrder', orderCode],
    queryFn: () => getInboundOrderDetailApi(orderCode!),
    enabled: !!orderCode,
    staleTime: 5 * 60 * 1000,
  });
};

export const useDraftInboundOrder = () => {
  return useMutation({
    mutationFn: draftInboundOrderApi,
  });
};

export const useGetStorageLocationSuggestions = () => {
  return useMutation({
    mutationFn: getStorageLocationSuggestionsApi,
  });
};

export const useCreateInboundOrder = () => {
  const queryClient = useQueryClient();
  return useMutation<any, AxiosError<ApiErrorResponse>, { sessionId: string; data: CreateInboundOrderRequest }>({
    mutationFn: ({ sessionId, data }) => createInboundOrderApi(sessionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inboundOrders'] });
    },
  });
};

export const useReceiveInboundOrderDetail = () => {
  const queryClient = useQueryClient();
  return useMutation<any, AxiosError<ApiErrorResponse>, { orderCode: string; detailId: number; data: ReceiveInboundOrderDetailRequest }>({
    mutationFn: ({ orderCode, detailId, data }) => receiveInboundOrderDetailApi(orderCode, detailId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inboundOrders'] });
      queryClient.invalidateQueries({ queryKey: ['inboundOrder', variables.orderCode] });
    },
  });
};
