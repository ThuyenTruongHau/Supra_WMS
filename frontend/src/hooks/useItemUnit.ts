import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createItemUnitApi,
  deleteItemUnitApi,
  listItemUnitsApi,
  updateItemUnitApi,
} from '@/api/itemUnit';
import { listItemsApi } from '@/api/item';
import type {
  CreateItemUnitInput,
  ItemUnit,
  UpdateItemUnitInput,
} from '@/types/itemUnit';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';

export const useItemUnits = (params?: { item_id?: number; unit_id?: number }) => {
  return useQuery<ItemUnit[], Error>({
    queryKey: ['item-units', params],
    queryFn: async () => {
      const data = await listItemUnitsApi({
        page_size: 100,
        item_id: params?.item_id,
        unit_id: params?.unit_id,
      });
      return data.items;
    },
    staleTime: 2 * 60 * 1000,
  });
};

export const useItemOptions = (search?: string) => {
  return useQuery({
    queryKey: ['item-options', search],
    queryFn: () =>
      listItemsApi({
        q: search?.trim() || undefined,
        page_size: 100,
        is_active: true,
      }),
    staleTime: 2 * 60 * 1000,
  });
};

export const useCreateItemUnit = () => {
  const queryClient = useQueryClient();
  return useMutation<ItemUnit, AxiosError<ApiErrorResponse>, CreateItemUnitInput>({
    mutationFn: createItemUnitApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-units'] });
    },
  });
};

export const useUpdateItemUnit = () => {
  const queryClient = useQueryClient();
  return useMutation<
    ItemUnit,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateItemUnitInput }
  >({
    mutationFn: ({ id, data }) => updateItemUnitApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-units'] });
    },
  });
};

export const useDeleteItemUnit = () => {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
    mutationFn: deleteItemUnitApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item-units'] });
    },
  });
};
