import axiosInstance from './axiosInstance'
import type {
  Item, ItemListParams, ItemListResponse,
  CreateItemInput, UpdateItemInput,
  ItemAnalyzeResponse,
  ItemDetails,
  ItemImportJobAccepted,
  ItemImportJobStatus,
} from '@/types/item'

const BASE = '/api/v1/items'

export const listItemsApi = async (params: ItemListParams) => {
  const { warehouse_id, q, page, page_size, limit, is_active } = params
  const { data } = await axiosInstance.get<ItemListResponse>(BASE, {
    params: {
      warehouse_id,
      q,
      page: page ?? 1,
      page_size: page_size ?? limit ?? 20,
      is_active,
    },
  })
  return data
}

export const analyzeItemsApi = async (warehouseId: number) => {
  const { data } = await axiosInstance.get<ItemAnalyzeResponse>(
    `${BASE}/analyze-items/${warehouseId}`,
  )
  return data
}

export const getItemByIdApi = async (itemId: number) => {
  const { data } = await axiosInstance.get<ItemDetails>(`${BASE}/${itemId}`)
  return data
}

export const createItemApi = async (payload: CreateItemInput) => {
  const { data } = await axiosInstance.post<Item>(BASE, payload)
  return data
}

export const updateItemApi = async (itemId: number, payload: UpdateItemInput) => {
  const { data } = await axiosInstance.patch<Item>(`${BASE}/${itemId}`, payload)
  return data
}

export const deactivateItemApi = async (itemId: number) => {
  await axiosInstance.delete(`${BASE}/${itemId}`)
}

export const importItemsApi = async (
  file: File,
  warehouseId: number,
): Promise<ItemImportJobAccepted> => {
  const formData = new FormData()
  formData.append('warehouse_id', String(warehouseId))
  formData.append('file', file)
  const { data } = await axiosInstance.post<ItemImportJobAccepted>(
    `${BASE}/import`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 5 * 60 * 1000,
    },
  )
  return data
}

export const getItemImportJobApi = async (
  jobId: string,
): Promise<ItemImportJobStatus> => {
  const { data } = await axiosInstance.get<ItemImportJobStatus>(
    `${BASE}/import/${encodeURIComponent(jobId)}`,
  )
  return data
}
