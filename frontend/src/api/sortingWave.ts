import axiosInstance from './axiosInstance';
import type {
  CreateSortingWaveInput,
  SortingWave,
  UpdateSortingWaveInput,
} from '@/types/sortingWave';

export const listSortingWavesApi = async (
  warehouseId: number,
  options?: { search?: string; skip?: number; limit?: number },
): Promise<SortingWave[]> => {
  const response = await axiosInstance.get<SortingWave[]>('/api/v1/sorting-waves/', {
    params: {
      zone_id: warehouseId,
      search: options?.search || undefined,
      skip: options?.skip ?? 0,
      limit: options?.limit ?? 200,
    },
  });
  return response.data;
};

export const createSortingWaveApi = async (
  data: CreateSortingWaveInput,
): Promise<SortingWave> => {
  const response = await axiosInstance.post<SortingWave>('/api/v1/sorting-waves/', data);
  return response.data;
};

export const updateSortingWaveApi = async (
  id: number,
  data: UpdateSortingWaveInput,
): Promise<SortingWave> => {
  const response = await axiosInstance.patch<SortingWave>(
    `/api/v1/sorting-waves/${id}`,
    data,
  );
  return response.data;
};

export const deleteSortingWaveApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`/api/v1/sorting-waves/${id}`);
};
