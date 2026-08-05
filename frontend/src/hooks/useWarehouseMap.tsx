import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getActiveWarehouseMapApi,
  getFullLocationsApi,
  importWarehouseMapApi,
  downloadActiveMapApi,
  getLocationDetailByIdApi,
} from '@/api/warehouseMap';
import type {
  MapData,
  FullLocationsResponse,
  WarehouseMapImportResult,
  WarehouseLocationItemStockDetail,
} from '@/types/warehouseMap';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';

export const useActiveWarehouseMap = (warehouseId: number) => {
  return useQuery<MapData, AxiosError<ApiErrorResponse>>({
    queryKey: ['warehouse-map', warehouseId],
    queryFn: () => getActiveWarehouseMapApi(warehouseId),
    staleTime: 5 * 60 * 1000,
    enabled: warehouseId > 0,
  });
};

export const useFullLocations = (warehouseId: number) => {
  return useQuery<FullLocationsResponse, AxiosError<ApiErrorResponse>>({
    queryKey: ['full-locations', warehouseId],
    queryFn: () => getFullLocationsApi(warehouseId),
    staleTime: 2 * 60 * 1000,
    enabled: warehouseId > 0,
  });
};

export const useImportWarehouseMap = () => {
  const queryClient = useQueryClient();
  return useMutation<
    WarehouseMapImportResult,
    AxiosError<ApiErrorResponse>,
    { warehouseId: number; file: File }
  >({
    mutationFn: ({ warehouseId, file }) =>
      importWarehouseMapApi(warehouseId, file),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['warehouse-map', variables.warehouseId],
      });
      queryClient.invalidateQueries({
        queryKey: ['full-locations', variables.warehouseId],
      });
    },
  });
};

export const useDownloadWarehouseMap = () => {
  return useMutation<
    void,
    AxiosError<ApiErrorResponse>,
    { warehouseId: number }
  >({
    mutationFn: async ({ warehouseId }) => {
      const blob = await downloadActiveMapApi(warehouseId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `warehouse-map-${warehouseId}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
};

export const useLocationDetail = (locationId: number | undefined) => {
  return useQuery<
    WarehouseLocationItemStockDetail,
    AxiosError<ApiErrorResponse>
  >({
    queryKey: ['location-detail', locationId],
    queryFn: () => getLocationDetailByIdApi(locationId as number),
    staleTime: 60 * 1000,
    enabled: !!locationId && locationId > 0,
  });
};
