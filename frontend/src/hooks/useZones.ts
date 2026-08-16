import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  assignZoneLocationsApi,
  createZoneApi,
  deleteZoneApi,
  listLocationsApi,
  listZonesApi,
  updateZoneApi,
} from '@/api/zone';
import type { CreateZoneInput, UpdateZoneInput, Zone } from '@/types/zone';
import { AxiosError } from 'axios';
import { ApiErrorResponse } from '@/types/apiError';
import { LIVE_QUERY_OPTIONS } from '@/utils/liveQueryOptions';

export const useZones = (warehouseId?: number) => {
  return useQuery({
    queryKey: ['zones', warehouseId],
    queryFn: async () => {
      const data = await listZonesApi({
        warehouse_id: warehouseId,
        page_size: 100,
      });
      return data.items;
    },
    enabled: (warehouseId ?? 0) > 0,
    staleTime: 2 * 60 * 1000,
  });
};

export const useWarehouseLocations = (
  warehouseId?: number,
  zoneId?: number,
) => {
  return useQuery({
    queryKey: ['locations', warehouseId, zoneId],
    queryFn: async () => {
      const data = await listLocationsApi({
        warehouse_id: warehouseId,
        zone_id: zoneId,
        page_size: 10000,
      });
      return data.items;
    },
    enabled: (warehouseId ?? 0) > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useCreateZone = () => {
  const queryClient = useQueryClient();
  return useMutation<Zone, AxiosError<ApiErrorResponse>, CreateZoneInput>({
    mutationFn: createZoneApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
    },
  });
};

export const useUpdateZone = () => {
  const queryClient = useQueryClient();
  return useMutation<
    Zone,
    AxiosError<ApiErrorResponse>,
    { id: number; data: UpdateZoneInput }
  >({
    mutationFn: ({ id, data }) => updateZoneApi(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
    },
  });
};

export const useDeleteZone = () => {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<ApiErrorResponse>, number>({
    mutationFn: deleteZoneApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      queryClient.invalidateQueries({ queryKey: ['locations'] });
    },
  });
};

export const useAssignZoneLocations = () => {
  const queryClient = useQueryClient();
  return useMutation<
    { assigned: number },
    AxiosError<ApiErrorResponse>,
    { zoneId: number; locationIds: number[] }
  >({
    mutationFn: ({ zoneId, locationIds }) =>
      assignZoneLocationsApi(zoneId, locationIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      queryClient.invalidateQueries({ queryKey: ['zones'] });
    },
  });
};
