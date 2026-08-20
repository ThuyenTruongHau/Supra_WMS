import axiosInstance from './axiosInstance'
import { downloadBlobFromResponse } from '@/utils/downloadBlob'
import type {
  Item, ItemListParams, ItemListResponse,
  CreateItemInput, UpdateItemInput,
  ItemAnalyzeResponse,
  ItemDetails,
  ItemImportJobAccepted,
  ItemImportJobStatus,
  QRCodeRecentListResponse,
  GenerateQrCodesResponse,
} from '@/types/item'

const BASE = '/api/v1/items'
const QR_BASE = '/api/v1/qr-codes'

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

export const downloadLastImportItemFileApi = async (
  warehouseId: number,
): Promise<void> => {
  const response = await axiosInstance.get(`${BASE}/import/file`, {
    params: { warehouse_id: warehouseId },
    responseType: 'blob',
    timeout: 5 * 60 * 1000,
  })

  downloadBlobFromResponse(
    response.data,
    response.headers['content-disposition'] as string | undefined,
    `${warehouseId}_Masan_Item_data.csv`,
  )
}

export const listRecentQrCodesByItemApi = async (itemId: number) => {
  const { data } = await axiosInstance.get<QRCodeRecentListResponse>(
    `${QR_BASE}/by-item/${itemId}/recent`,
  )
  return data
}

export const listRecentQrCodesApi = async (params: {
  warehouseId?: number
  itemId?: number
  page?: number
  pageSize?: number
}) => {
  const { warehouseId, itemId, page = 1, pageSize = 20 } = params
  const { data } = await axiosInstance.get<QRCodeRecentListResponse>(
    `${QR_BASE}/recent`,
    {
      params: {
        warehouse_id: warehouseId,
        item_id: itemId,
        page,
        page_size: pageSize,
      },
    },
  )
  return data
}

export const previewQrCodesApi = async (itemId: number, quantity: number) => {
  const { data } = await axiosInstance.post<GenerateQrCodesResponse>(
    `${QR_BASE}/preview`,
    null,
    {
      params: { item_id: itemId, quantity },
    },
  )
  return data
}

export const createQrCodesApi = async (itemId: number, quantity: number) => {
  const { data } = await axiosInstance.post<GenerateQrCodesResponse>(
    `${QR_BASE}/create`,
    null,
    {
      params: { item_id: itemId, quantity },
    },
  )
  return data
}

/** @deprecated Dùng createQrCodesApi */
export const generateQrCodesApi = createQrCodesApi
