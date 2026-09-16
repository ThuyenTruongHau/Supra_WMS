import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { AxiosError } from 'axios';
import {
  DEFAULT_MAP_LOCATION_TYPE,
  getActiveMapApi,
  getActiveMapMetadataApi,
  getInboundBufferMapViewApi,
  getInboundBufferPointsApi,
  importMapApi,
  type MapLocationTypeParam,
} from '@/api/warehouseMap';
import type {
  InboundBufferMapView,
  InboundBufferPointsResponse,
  WarehouseMapMetadata,
} from '@/types/warehouseMap';
import type { ApiErrorResponse } from '@/types/apiError';
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


export const warehouseMapQueryKey = (zoneId: number) => ['warehouse_map', zoneId] as const;
export const warehouseMapMetadataQueryKey = (zoneId: number) =>
  ['warehouse_map_metadata', zoneId] as const;
function locationIdsKey(locationIds?: number[]) {
  if (!locationIds || locationIds.length === 0) return 'all';
  return [...locationIds].sort((a, b) => a - b).join(',');
}

export const inboundBufferPointsQueryKey = (
  zoneId: number,
  locationType: MapLocationTypeParam = DEFAULT_MAP_LOCATION_TYPE,
  locationIds?: number[],
) =>
  [
    'inbound_buffer_points',
    zoneId,
    locationType,
    locationIdsKey(locationIds),
  ] as const;
export const inboundBufferMapViewQueryKey = (
  zoneId: number,
  locationType: MapLocationTypeParam = DEFAULT_MAP_LOCATION_TYPE,
  locationIds?: number[],
) =>
  [
    'inbound_buffer_map_view',
    zoneId,
    locationType,
    locationIdsKey(locationIds),
  ] as const;

export const useActiveMap = (zoneId: number) => {
  return useQuery<MapData, AxiosError<ApiErrorResponse>>({
    queryKey: warehouseMapQueryKey(zoneId),
    queryFn: () => getActiveMapApi(zoneId),
    enabled: zoneId > 0,
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error.response?.status === 404) return false;
      return failureCount < 2;
    },
  });
};

export const useActiveMapMetadata = (zoneId: number) => {
  return useQuery<WarehouseMapMetadata, AxiosError<ApiErrorResponse>>({
    queryKey: warehouseMapMetadataQueryKey(zoneId),
    queryFn: () => getActiveMapMetadataApi(zoneId),
    enabled: zoneId > 0,
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error.response?.status === 404) return false;
      return failureCount < 2;
    },
  });
};

export const useInboundBufferPoints = (
  zoneId: number,
  locationType: MapLocationTypeParam = DEFAULT_MAP_LOCATION_TYPE,
  locationIds?: number[],
) => {
  const hasExplicitEmptyFilter = Array.isArray(locationIds) && locationIds.length === 0;
  return useQuery<InboundBufferPointsResponse, AxiosError<ApiErrorResponse>>({
    queryKey: inboundBufferPointsQueryKey(zoneId, locationType, locationIds),
    queryFn: () => getInboundBufferPointsApi(zoneId, locationType, locationIds),
    enabled: zoneId > 0 && !hasExplicitEmptyFilter,
    staleTime: 60 * 1000,
  });
};

export const useInboundBufferMapView = (
  zoneId: number,
  locationType: MapLocationTypeParam = DEFAULT_MAP_LOCATION_TYPE,
  locationIds?: number[],
) => {
  const hasExplicitEmptyFilter = Array.isArray(locationIds) && locationIds.length === 0;
  return useQuery<InboundBufferMapView, AxiosError<ApiErrorResponse>>({
    queryKey: inboundBufferMapViewQueryKey(zoneId, locationType, locationIds),
    queryFn: () => getInboundBufferMapViewApi(zoneId, locationType, locationIds),
    enabled: zoneId > 0 && !hasExplicitEmptyFilter,
    staleTime: 60 * 1000,
    retry: (failureCount, error) => {
      if (error.response?.status === 404 || error.response?.status === 422) return false;
      return failureCount < 2;
    },
  });
};

export const useImportMap = () => {
  const queryClient = useQueryClient();

  return useMutation<
    WarehouseMapImportResult,
    AxiosError<ApiErrorResponse>,
    { zoneId: number; file: File }
  >({
    mutationFn: ({ zoneId, file }) => importMapApi(zoneId, file),
    onSuccess: async (_data, variables) => {
      const { zoneId } = variables;

      await Promise.all([
        queryClient.resetQueries({ queryKey: warehouseMapQueryKey(zoneId) }),
        queryClient.resetQueries({ queryKey: warehouseMapMetadataQueryKey(zoneId) }),
        queryClient.invalidateQueries({ queryKey: ['inbound_buffer_points', zoneId] }),
        queryClient.invalidateQueries({ queryKey: ['inbound_buffer_map_view', zoneId] }),
        queryClient.invalidateQueries({ queryKey: ['warehouse_locations', zoneId] }),
        queryClient.invalidateQueries({ queryKey: ['item_stock_by_zone', zoneId] }),
      ]);
    },
  });
};
