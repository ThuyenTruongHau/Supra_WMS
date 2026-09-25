import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  createSortingWaveApi,
  deleteSortingWaveApi,
  listSortingWavesApi,
  updateSortingWaveApi,
} from '@/api/sortingWave';
import type {
  CreateSortingWaveInput,
  SortingWave,
  UpdateSortingWaveInput,
} from '@/types/sortingWave';
import { ApiErrorResponse } from '@/types/apiError';

export const sortingWavesQueryKey = (warehouseId: number, search?: string) =>
  ['sorting-waves', warehouseId, search ?? ''] as const;

export const useSortingWaves = (
  warehouseId: number,
  options?: { search?: string },
) => {
  return useQuery<SortingWave[], AxiosError<ApiErrorResponse>>({
    queryKey: sortingWavesQueryKey(warehouseId, options?.search),
    queryFn: () =>
      listSortingWavesApi(warehouseId, {
        search: options?.search,
        limit: 200,
      }),
    enabled: warehouseId > 0,
    staleTime: 60 * 1000,
  });
};

const invalidateSortingWaves = (
  queryClient: ReturnType<typeof useQueryClient>,
  warehouseId: number,
) => {
  queryClient.invalidateQueries({ queryKey: ['sorting-waves', warehouseId] });
  queryClient.invalidateQueries({ queryKey: ['sorting_order_summary', warehouseId] });
  queryClient.invalidateQueries({ queryKey: ['sorting_orders', warehouseId] });
};

export const useCreateSortingWave = () => {
  const queryClient = useQueryClient();
  return useMutation<SortingWave, AxiosError<ApiErrorResponse>, CreateSortingWaveInput>({
    mutationFn: createSortingWaveApi,
    onSuccess: (wave) => {
      invalidateSortingWaves(queryClient, wave.zone_id);
    },
  });
};

export const useUpdateSortingWave = () => {
  const queryClient = useQueryClient();
  return useMutation<
    SortingWave,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateSortingWaveInput; warehouseId: number }
  >({
    mutationFn: ({ id, data }) => updateSortingWaveApi(id, data),
    onSuccess: (_, variables) => {
      invalidateSortingWaves(queryClient, variables.warehouseId);
    },
  });
};

export const useDeleteSortingWave = () => {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    AxiosError<ApiErrorResponse>,
    { id: number; warehouseId: number }
  >({
    mutationFn: ({ id }) => deleteSortingWaveApi(id),
    onSuccess: (_, variables) => {
      invalidateSortingWaves(queryClient, variables.warehouseId);
    },
  });
};
