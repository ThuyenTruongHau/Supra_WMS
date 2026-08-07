import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createUnitApi,
  deleteUnitApi,
  listUnitsApi,
  updateUnitApi,
} from '@/api/unit';
import type { CreateUnitInput, Unit, UpdateUnitInput } from '@/types/unit';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';

export const useUnits = (search?: string) => {
  return useQuery<Unit[], Error>({
    queryKey: ['units', search],
    queryFn: async () => {
      const data = await listUnitsApi({
        q: search?.trim() || undefined,
        page_size: 100,
      });
      return data.items;
    },
    staleTime: 2 * 60 * 1000,
  });
};

export const useCreateUnit = () => {
  const queryClient = useQueryClient();
  return useMutation<Unit, AxiosError<ApiErrorResponse>, CreateUnitInput>({
    mutationFn: createUnitApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
    },
  });
};

export const useUpdateUnit = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Unit,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateUnitInput }
  >({
    mutationFn: ({ id, data }) => updateUnitApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
    },
  });
};

export const useDeleteUnit = () => {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
    mutationFn: deleteUnitApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
    },
  });
};
