import axiosInstance from "./axiosInstance";
import type {
  InboundBufferStockUpdate,
  ItemStockResponse,
  ItemStockSplitListResponse,
} from "@/types/itemStock";

const BASE = "/api/v1/item-stocks";

export const updateInboundBufferStockApi = async (
  stockId: number,
  locationId: number,
  body: InboundBufferStockUpdate,
): Promise<ItemStockResponse> => {
  const { data } = await axiosInstance.patch<ItemStockResponse>(
    `${BASE}/${stockId}`,
    body,
    {
      params: { inbound_buffer_location_id: locationId },
    },
  );
  return data;
};

export const getStockSplitApi = async (
  itemId: number,
): Promise<ItemStockSplitListResponse> => {
  const { data } = await axiosInstance.get<ItemStockSplitListResponse>(
    `${BASE}/split`,
    { params: { item_id: itemId } },
  );
  return data;
};
