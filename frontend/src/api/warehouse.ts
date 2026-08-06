import axiosInstance from './axiosInstance';
import type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  Warehouse,
  WarehouseListResponse,
} from '@/types/warehouse';

const BASE = '/api/v1/warehouses';

export const listWarehousesApi = async (params?: {
  page?: number;
  page_size?: number;
}): Promise<WarehouseListResponse> => {
  const response = await axiosInstance.get<WarehouseListResponse>(BASE, {
    params: {
      page: params?.page ?? 1,
      page_size: params?.page_size ?? 100,
    },
  });
  return response.data;
};

export const getWarehouseApi = async (id: number): Promise<Warehouse> => {
  const response = await axiosInstance.get<Warehouse>(`${BASE}/${id}`);
  return response.data;
};

export const createWarehouseApi = async (
  data: CreateWarehouseInput,
): Promise<Warehouse> => {
  const response = await axiosInstance.post<Warehouse>(BASE, data);
  return response.data;
};

export const updateWarehouseApi = async (
  id: number,
  data: UpdateWarehouseInput,
): Promise<Warehouse> => {
  const response = await axiosInstance.patch<Warehouse>(`${BASE}/${id}`, data);
  return response.data;
};

export const deleteWarehouseApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/${id}`);
};
