import axiosInstance from './axiosInstance';
import type {
  ConvertQuantityInput,
  ConvertQuantityResponse,
  CreateItemUnitInput,
  ItemAvailableUnitsResponse,
  ItemUnit,
  ItemUnitListResponse,
  UpdateItemUnitInput,
} from '@/types/itemUnit';

const BASE = '/api/v1/item-units';

export const listItemUnitsApi = async (params?: {
  page?: number;
  page_size?: number;
  item_id?: number;
  unit_id?: number;
}): Promise<ItemUnitListResponse> => {
  const { data } = await axiosInstance.get<ItemUnitListResponse>(BASE, {
    params: {
      page: params?.page ?? 1,
      page_size: params?.page_size ?? 100,
      item_id: params?.item_id,
      unit_id: params?.unit_id,
    },
  });
  return data;
};

export const createItemUnitApi = async (
  payload: CreateItemUnitInput,
): Promise<ItemUnit> => {
  const { data } = await axiosInstance.post<ItemUnit>(BASE, payload);
  return data;
};

export const updateItemUnitApi = async (
  id: number,
  payload: UpdateItemUnitInput,
): Promise<ItemUnit> => {
  const { data } = await axiosInstance.patch<ItemUnit>(`${BASE}/${id}`, payload);
  return data;
};

export const deleteItemUnitApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/${id}`);
};

export const getItemAvailableUnitsApi = async (
  itemId: number,
): Promise<ItemAvailableUnitsResponse> => {
  const { data } = await axiosInstance.get<ItemAvailableUnitsResponse>(
    `${BASE}/by-item/${itemId}`,
  );
  return data;
};

export const convertQuantityApi = async (
  payload: ConvertQuantityInput,
): Promise<ConvertQuantityResponse> => {
  const { data } = await axiosInstance.post<ConvertQuantityResponse>(
    `${BASE}/convert-quantity`,
    payload,
  );
  return data;
};
