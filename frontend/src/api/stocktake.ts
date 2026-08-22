import axiosInstance from "./axiosInstance";
import type {
  CreateStocktakeInput,
  GetStocktakeItemsParams,
  GetStocktakesParams,
  Stocktake,
  StocktakeDetail,
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
