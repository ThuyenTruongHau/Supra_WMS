import axiosInstance from "./axiosInstance";
import type { ItemStockSplitListResponse } from "@/types/itemStock";

const BASE = "/api/v1/item-stocks";

export const getStockSplitApi = async (
  itemId: number,
): Promise<ItemStockSplitListResponse> => {
  const { data } = await axiosInstance.get<ItemStockSplitListResponse>(
    `${BASE}/split`,
    { params: { item_id: itemId } },
  );
  return data;
};
