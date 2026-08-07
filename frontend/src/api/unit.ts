import axiosInstance from './axiosInstance';
import type {
  CreateUnitInput,
  Unit,
  UnitListResponse,
  UpdateUnitInput,
} from '@/types/unit';

const BASE = '/api/v1/units';

export const listUnitsApi = async (params?: {
  q?: string;
  page?: number;
  page_size?: number;
}): Promise<UnitListResponse> => {
  const { data } = await axiosInstance.get<UnitListResponse>(BASE, {
    params: {
      q: params?.q,
      page: params?.page ?? 1,
      page_size: params?.page_size ?? 100,
    },
  });
  return data;
};

export const createUnitApi = async (payload: CreateUnitInput): Promise<Unit> => {
  const { data } = await axiosInstance.post<Unit>(BASE, payload);
  return data;
};

export const updateUnitApi = async (
  id: number,
  payload: UpdateUnitInput,
): Promise<Unit> => {
  const { data } = await axiosInstance.patch<Unit>(`${BASE}/${id}`, payload);
  return data;
};

export const deleteUnitApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${BASE}/${id}`);
};
