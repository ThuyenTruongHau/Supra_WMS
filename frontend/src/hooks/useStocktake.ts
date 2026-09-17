import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  confirmStocktakeItemQuantityApi,
  createStocktakeApi,
  deleteStocktakeApi,
  getStocktakeDetailApi,
  getStocktakeItemFormDataApi,
  listStocktakeItemsApi,
  listStocktakesApi,
  recordStocktakeItemCountApi,
} from "@/api/stocktake";
import type {
  ConfirmStocktakeItemQuantityParams,
  CreateStocktakeInput,
  GetStocktakeItemsParams,
  GetStocktakesParams,
  RecordStocktakeItemCountParams,
  Stocktake,
  StocktakeItemFormData,
  StocktakeItemStock,
} from "@/types/stocktake";
import { LIVE_QUERY_OPTIONS } from "@/utils/liveQueryOptions";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";

export const useGetStocktakes = (params: GetStocktakesParams) => {
  return useQuery({
    queryKey: ["stocktakes", params],
    queryFn: () => listStocktakesApi(params),
    enabled: params.warehouse_id > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useGetStocktakeDetail = (stocktakeId: number) => {
  return useQuery({
    queryKey: ["stocktakeDetail", stocktakeId],
    queryFn: () => getStocktakeDetailApi(stocktakeId),
    enabled: stocktakeId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useGetStocktakeItems = (params: GetStocktakeItemsParams) => {
  return useQuery({
    queryKey: ["stocktakeItems", params],
    queryFn: () => listStocktakeItemsApi(params),
    enabled: params.warehouse_id > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useCreateStocktake = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Stocktake,
    AxiosError<ApiErrorResponse>,
    CreateStocktakeInput
  >({
    mutationFn: createStocktakeApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeItems"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeDetail"] });
    },
  });
};

export const useDeleteStocktake = () => {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
    mutationFn: deleteStocktakeApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeItems"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeDetail"] });
    },
  });
};

export const useGetStocktakeItemFormData = (
  stocktakeItemId: number,
  enabled: boolean,
) => {
  return useQuery({
    queryKey: ["stocktakeItemFormData", stocktakeItemId],
    queryFn: () => getStocktakeItemFormDataApi(stocktakeItemId),
    enabled: enabled && stocktakeItemId > 0,
  });
};

export const useRecordStocktakeItemCount = () => {
  const queryClient = useQueryClient();
  return useMutation<
    StocktakeItemStock,
    AxiosError<ApiErrorResponse>,
    RecordStocktakeItemCountParams
  >({
    mutationFn: recordStocktakeItemCountApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeItems"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeDetail"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeItemFormData"] });
    },
  });
};

export const useConfirmStocktakeItemQuantity = () => {
  const queryClient = useQueryClient();
  return useMutation<
    StocktakeItemStock,
    AxiosError<ApiErrorResponse>,
    ConfirmStocktakeItemQuantityParams
  >({
    mutationFn: confirmStocktakeItemQuantityApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stocktakes"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeItems"] });
      queryClient.invalidateQueries({ queryKey: ["stocktakeDetail"] });
    },
  });
};
