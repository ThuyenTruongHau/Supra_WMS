import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getActiveWarehouseMapApi,
  getFullLocationsApi,
  importWarehouseMapApi,
  downloadActiveMapApi,
  getLocationDetailByCodeApi,
} from '@/api/warehouseMap';
import type {
  MapData,
  FullLocationsResponse,
  WarehouseMapImportResult,
  WarehouseLocationItemStockDetail,
} from '@/types/warehouseMap';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';

// 1. Hook lấy map active — queryKey chứa zoneId → đổi zone = fetch mới tự động
export const useActiveWarehouseMap = (zoneId: number) => {
  return useQuery<MapData, AxiosError<ApiErrorResponse>>({
    queryKey: ['warehouse-map', zoneId],
    queryFn: () => getActiveWarehouseMapApi(zoneId),
    staleTime: 5 * 60 * 1000,
    enabled: zoneId > 0,
  });
};

// 2. Hook lấy renderable locations (active + full)
export const useFullLocations = (zoneId: number) => {
  return useQuery<FullLocationsResponse, AxiosError<ApiErrorResponse>>({
    queryKey: ['full-locations', zoneId],
    queryFn: () => getFullLocationsApi(zoneId),
    staleTime: 2 * 60 * 1000,
    enabled: zoneId > 0,
  });
};

// 3. Hook import ZIP — mutation, invalidate cả map + locations sau thành công
export const useImportWarehouseMap = () => {
  const queryClient = useQueryClient();
  return useMutation<
    WarehouseMapImportResult,
    AxiosError<ApiErrorResponse>,
    { zoneId: number; file: File }
  >({
    mutationFn: ({ zoneId, file }) => importWarehouseMapApi(zoneId, file),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['warehouse-map', variables.zoneId],
      });
      queryClient.invalidateQueries({
        queryKey: ['full-locations', variables.zoneId],
      });
    },
  });
};

// 4. Hook download ZIP active — user-initiated action
export const useDownloadWarehouseMap = () => {
  return useMutation<
    void,
    AxiosError<ApiErrorResponse>,
    { zoneId: number }
  >({
    mutationFn: async ({ zoneId }) => {
      const blob = await downloadActiveMapApi(zoneId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `warehouse-map-zone-${zoneId}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
};

// 5. Hook lấy thông tin chi tiết location (khi click vào node trên map)
export const useLocationDetail = (locationCode: string | undefined) => {
  return useQuery<
    WarehouseLocationItemStockDetail,
    AxiosError<ApiErrorResponse>
  >({
    queryKey: ['location-detail', locationCode],
    queryFn: () => getLocationDetailByCodeApi(locationCode as string),
    staleTime: 60 * 1000, // Cache trong 1 phút vì có thể tồn kho thay đổi
    enabled: !!locationCode,
  });
};
