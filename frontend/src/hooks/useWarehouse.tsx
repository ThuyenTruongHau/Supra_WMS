import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listWarehousesApi,
  createWarehouseApi,
  updateWarehouseApi,
  deleteWarehouseApi,
} from '@/api/warehouse';
import type {
  CreateWarehouseInput,
  UpdateWarehouseInput,
  Warehouse,
} from '@/types/warehouse';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';

export const useWarehouses = () => {
  return useQuery<Warehouse[], Error>({
    queryKey: ['warehouse'],
    queryFn: async () => {
      const data = await listWarehousesApi({ page_size: 100 });
      return data.items;
    },
    staleTime: 5 * 60 * 1000,
  });
};

export const useCreateWarehouse = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Warehouse,
    AxiosError<ApiErrorResponse>,
    CreateWarehouseInput
  >({
    mutationFn: createWarehouseApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
    },
  });
};

export const useUpdateWarehouse = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Warehouse,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateWarehouseInput }
  >({
    mutationFn: ({ id, data }) => updateWarehouseApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
    },
  });
};

export const useDeleteWarehouse = () => {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
    mutationFn: deleteWarehouseApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouse'] });
    },
  });
};
