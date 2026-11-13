import axiosInstance from './axiosInstance'
import type {
  ItemStockQrLookupRequest,
  ItemStockQrLookupResponse,
  ItemStockSplitListResponse,
} from '@/types/itemStock'

const BASE = '/api/v1/item-stocks'

export const getStockSplitApi = async (
  itemId: number,
): Promise<ItemStockSplitListResponse> => {
  const { data } = await axiosInstance.get<ItemStockSplitListResponse>(
    `${BASE}/split`,
    { params: { item_id: itemId } },
  )
  return data
}

export const lookupItemStockQrCodesApi = async (
  itemStockIds: number[],
): Promise<ItemStockQrLookupResponse> => {
  const body: ItemStockQrLookupRequest = { item_stock_ids: itemStockIds }
  const { data } = await axiosInstance.post<ItemStockQrLookupResponse>(
    `${BASE}/qr-codes/lookup`,
    body,
  )
  return data
}
