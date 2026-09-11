import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getActiveWarehouseMapApi,
  getFullLocationsApi,
  getLocationsByLogicApi,
  importWarehouseMapApi,
  previewWarehouseMapImportApi,
  downloadActiveMapApi,
  getLocationDetailByIdApi,
} from '@/api/warehouseMap';
import type {
  MapData,
  MapRemapEntry,
  FullLocationsResponse,
  WarehouseMapImportResult,
  WarehouseLocationItemStockDetail,
} from '@/types/warehouseMap';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';
import { LIVE_QUERY_OPTIONS } from '@/utils/liveQueryOptions';
import type { OutboundLocationLogicType } from '@/utils/outboundLocationLogic';

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
  logicType: OutboundLocationLogicType = 'outbound_buffer',
  enabled = true,
) => {
  return useQuery({
    queryKey: ['outbound-buffer-locations', warehouseId, logicType],
    queryFn: () => getLocationsByLogicApi(warehouseId, logicType),
    enabled: enabled && warehouseId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useStorageAreaLocations = (
  warehouseId: number,
  enabled = true,
) => {
  return useQuery({
    queryKey: ['storage-area-locations', warehouseId],
    queryFn: () => getLocationsByLogicApi(warehouseId, 'storage_area'),
    enabled: enabled && warehouseId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

interface ImportWarehouseMapVariables {
  warehouseId: number;
  file: File;
  remap?: MapRemapEntry[];
  zoneId?: number;
}

/** Dry run the import so the operator can review before anything is written. */
export const usePreviewWarehouseMapImport = () => {
  return useMutation<
    WarehouseMapImportResult,
    AxiosError<ApiErrorResponse>,
    ImportWarehouseMapVariables
  >({
    mutationFn: ({ warehouseId, file, remap, zoneId }) =>
      previewWarehouseMapImportApi(warehouseId, file, remap, zoneId),
  });
};

export const useImportWarehouseMap = () => {
  const queryClient = useQueryClient();
  return useMutation<
    WarehouseMapImportResult,
    AxiosError<ApiErrorResponse>,
    ImportWarehouseMapVariables
  >({
    mutationFn: ({ warehouseId, file, remap, zoneId }) =>
      importWarehouseMapApi(warehouseId, file, remap, zoneId),
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

export const useLocationDetail = (
  locationId: number | undefined,
  refreshToken = 0,
) => {
  return useQuery<
    WarehouseLocationItemStockDetail,
    AxiosError<ApiErrorResponse>
  >({
    queryKey: ['location-detail', locationId, refreshToken],
    queryFn: () => getLocationDetailByIdApi(locationId as number),
    enabled: !!locationId && locationId > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};
