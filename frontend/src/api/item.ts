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
  const { data } = await axiosInstance.get<ItemListResponse>(`${BASE}/`, { params })
  return data
}

export const analyzeItemsApi = async (zoneId: number) => {
  const { data } = await axiosInstance.get<ItemAnalyzeResponse>(`${BASE}/analyze-items/${zoneId}`)
  return data
}

export const getItemBySkuApi = async (sku: string) => {
  const { data } = await axiosInstance.get<ItemDetails>(`${BASE}/${encodeURIComponent(sku)}`)
  return data
}

export const createItemApi = async (payload: CreateItemInput) => {
  const { data } = await axiosInstance.post<Item>(`${BASE}/`, payload)
  return data
}

export const updateItemApi = async (sku: string, payload: UpdateItemInput) => {
  const { data } = await axiosInstance.patch<Item>(`${BASE}/${encodeURIComponent(sku)}`, payload)
  return data
}

export const deactivateItemApi = async (sku: string) => {
  await axiosInstance.post(`${BASE}/${encodeURIComponent(sku)}/deactivate`)
}

export const importItemsApi = async (
  file: File,
  zoneId: number,
): Promise<ItemImportJobAccepted> => {
  const formData = new FormData()
  formData.append('zone_id', String(zoneId))
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
