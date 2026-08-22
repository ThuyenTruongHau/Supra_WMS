import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createStocktakeApi,
  getStocktakeDetailApi,
  listStocktakeItemsApi,
  listStocktakesApi,
} from "@/api/stocktake";
import type {
  CreateStocktakeInput,
  GetStocktakeItemsParams,
  GetStocktakesParams,
  Stocktake,
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
