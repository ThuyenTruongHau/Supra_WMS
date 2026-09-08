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

export const sortingWavesQueryKey = (zoneId: number, search?: string) =>
  ['sorting-waves', zoneId, search ?? ''] as const;

export const useSortingWaves = (
  zoneId: number,
  options?: { search?: string },
) => {
  return useQuery<SortingWave[], AxiosError<ApiErrorResponse>>({
    queryKey: sortingWavesQueryKey(zoneId, options?.search),
    queryFn: () =>
      listSortingWavesApi(zoneId, {
        search: options?.search,
        limit: 200,
      }),
    enabled: zoneId > 0,
    staleTime: 60 * 1000,
  });
};

const invalidateSortingWaves = (
  queryClient: ReturnType<typeof useQueryClient>,
  zoneId: number,
) => {
  queryClient.invalidateQueries({ queryKey: ['sorting-waves', zoneId] });
  queryClient.invalidateQueries({ queryKey: ['sorting_order_summary', zoneId] });
  queryClient.invalidateQueries({ queryKey: ['sorting_orders', zoneId] });
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
    { id: number; data: UpdateSortingWaveInput; zoneId: number }
  >({
    mutationFn: ({ id, data }) => updateSortingWaveApi(id, data),
    onSuccess: (_, variables) => {
      invalidateSortingWaves(queryClient, variables.zoneId);
    },
  });
};

export const useDeleteSortingWave = () => {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    AxiosError<ApiErrorResponse>,
    { id: number; zoneId: number }
  >({
    mutationFn: ({ id }) => deleteSortingWaveApi(id),
    onSuccess: (_, variables) => {
      invalidateSortingWaves(queryClient, variables.zoneId);
    },
  });
};
