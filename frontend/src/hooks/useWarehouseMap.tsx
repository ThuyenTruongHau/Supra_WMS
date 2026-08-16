import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getActiveWarehouseMapApi,
  getFullLocationsApi,
  getLocationsByLogicApi,
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
import { LIVE_QUERY_OPTIONS } from '@/utils/liveQueryOptions';

export const useActiveWarehouseMap = (warehouseId: number) => {
  return useQuery<MapData, AxiosError<ApiErrorResponse>>({
    queryKey: ['warehouse-map', warehouseId],
    queryFn: () => getActiveWarehouseMapApi(warehouseId),
    enabled: warehouseId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useFullLocations = (warehouseId: number) => {
  return useQuery<FullLocationsResponse, AxiosError<ApiErrorResponse>>({
    queryKey: ['full-locations', warehouseId],
    queryFn: () => getFullLocationsApi(warehouseId),
    enabled: warehouseId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useInboundBufferLocations = (
  warehouseId: number,
  enabled = true,
) => {
  return useQuery({
    queryKey: ['inbound-buffer-locations', warehouseId],
    queryFn: () => getLocationsByLogicApi(warehouseId, 'inbound_buffer'),
    enabled: enabled && warehouseId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useOutboundBufferLocations = (
  warehouseId: number,
  enabled = true,
) => {
  return useQuery({
    queryKey: ['outbound-buffer-locations', warehouseId],
    queryFn: () => getLocationsByLogicApi(warehouseId, 'outbound_buffer'),
    enabled: enabled && warehouseId > 0,
    ...LIVE_QUERY_OPTIONS,
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
    enabled: !!locationId && locationId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};
