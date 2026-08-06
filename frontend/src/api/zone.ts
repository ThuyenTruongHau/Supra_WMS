import axiosInstance from './axiosInstance';
import type { Warehouse, WarehouseListResponse } from '@/types/warehouse';

/** @deprecated Prefer `@/api/warehouse` — kept so old imports still resolve. */
export type Zone = Warehouse;

export const getZoneApi = async (): Promise<Zone[]> => {
  const response = await axiosInstance.get<WarehouseListResponse>(
    '/api/v1/warehouses',
    { params: { page: 1, page_size: 100 } },
  );
  return response.data.items;
};

export const updateZoneApi = async (
  id: number,
  data: Omit<Zone, 'id'>,
): Promise<Zone> => {
  const response = await axiosInstance.patch<Zone>(
    `/api/v1/warehouses/${id}`,
    data,
  );
  return response.data;
};

export const createZoneApi = async (data: Omit<Zone, 'id'>): Promise<Zone> => {
  const response = await axiosInstance.post<Zone>('/api/v1/warehouses', data);
  return response.data;
};

export const deleteZoneApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`/api/v1/warehouses/${id}`);
};
