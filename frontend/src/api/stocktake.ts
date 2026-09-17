import axiosInstance from "./axiosInstance";
import type {
  ConfirmStocktakeItemQuantityParams,
  CreateStocktakeInput,
  GetStocktakeItemsParams,
  GetStocktakesParams,
  RecordStocktakeItemCountParams,
  Stocktake,
  StocktakeDetail,
  StocktakeItemFormData,
  StocktakeItemStock,
  StocktakeItemStockListResponse,
  StocktakeListResponse,
} from "@/types/stocktake";

const BASE = "/api/v1/stocktakes";
const ITEMS_BASE = "/api/v1/stocktake-items";

export const listStocktakesApi = async (
  params: GetStocktakesParams,
): Promise<StocktakeListResponse> => {
  const { data } = await axiosInstance.get<StocktakeListResponse>(BASE, {
    params: {
      warehouse_id: params.warehouse_id,
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      q: params.q,
    },
  });
  return data;
};

export const getStocktakeDetailApi = async (
  stocktakeId: number,
): Promise<StocktakeDetail> => {
  const { data } = await axiosInstance.get<StocktakeDetail>(
    `${BASE}/${stocktakeId}`,
  );
  return data;
};

export const listStocktakeItemsApi = async (
  params: GetStocktakeItemsParams,
): Promise<StocktakeItemStockListResponse> => {
  const { data } = await axiosInstance.get<StocktakeItemStockListResponse>(
    ITEMS_BASE,
    {
      params: {
        warehouse_id: params.warehouse_id,
        page: params.page ?? 1,
        page_size: params.page_size ?? 20,
        stocktake_id: params.stocktake_id,
        statuses: params.statuses?.length
          ? params.statuses.join(",")
          : undefined,
      },
    },
  );
  return data;
};

export const createStocktakeApi = async (
  payload: CreateStocktakeInput,
): Promise<Stocktake> => {
  const { data } = await axiosInstance.post<Stocktake>(BASE, payload);
  return data;
};

export const deleteStocktakeApi = async (stocktakeId: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/${stocktakeId}`);
};

export const getStocktakeItemFormDataApi = async (
  stocktakeItemId: number,
): Promise<StocktakeItemFormData> => {
  const { data } = await axiosInstance.get<StocktakeItemFormData>(
    `${ITEMS_BASE}/${stocktakeItemId}/form-data`,
  );
  return data;
};

export const recordStocktakeItemCountApi = async ({
  stocktakeId,
  stocktakeItemId,
  payload,
}: RecordStocktakeItemCountParams): Promise<StocktakeItemStock> => {
  const { data } = await axiosInstance.post<StocktakeItemStock>(
    `${BASE}/${stocktakeId}/items/${stocktakeItemId}/record-count`,
    payload,
  );
  return data;
};

export const confirmStocktakeItemQuantityApi = async ({
  stocktakeId,
  stocktakeItemId,
}: ConfirmStocktakeItemQuantityParams): Promise<StocktakeItemStock> => {
  const { data } = await axiosInstance.post<StocktakeItemStock>(
    `${BASE}/${stocktakeId}/items/${stocktakeItemId}/confirm-quantity`,
    {},
  );
  return data;
};
