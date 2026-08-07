import axiosInstance from './axiosInstance';
import type {
  CreateZoneInput,
  LocationListResponse,
  UpdateZoneInput,
  Zone,
  ZoneListResponse,
} from '@/types/zone';

const ZONES_BASE = '/api/v1/zones';
const LOCATIONS_BASE = '/api/v1/locations';

export const listZonesApi = async (params?: {
  warehouse_id?: number;
  page?: number;
  page_size?: number;
}): Promise<ZoneListResponse> => {
  const { data } = await axiosInstance.get<ZoneListResponse>(ZONES_BASE, {
    params: {
      warehouse_id: params?.warehouse_id,
      page: params?.page ?? 1,
      page_size: params?.page_size ?? 100,
    },
  });
  return data;
};

export const createZoneApi = async (payload: CreateZoneInput): Promise<Zone> => {
  const { data } = await axiosInstance.post<Zone>(ZONES_BASE, payload);
  return data;
};

export const updateZoneApi = async (
  id: number,
  payload: UpdateZoneInput,
): Promise<Zone> => {
  const { data } = await axiosInstance.patch<Zone>(`${ZONES_BASE}/${id}`, payload);
  return data;
};

export const deleteZoneApi = async (id: number): Promise<void> => {
  await axiosInstance.delete(`${ZONES_BASE}/${id}`);
};

export const assignZoneLocationsApi = async (
  zoneId: number,
  locationIds: number[],
): Promise<{ assigned: number }> => {
  const { data } = await axiosInstance.put<{ assigned: number }>(
    `${ZONES_BASE}/${zoneId}/locations`,
    { location_ids: locationIds },
  );
  return data;
};

export const listLocationsApi = async (params?: {
  warehouse_id?: number;
  zone_id?: number;
  q?: string;
  page?: number;
  page_size?: number;
}): Promise<LocationListResponse> => {
  const { data } = await axiosInstance.get<LocationListResponse>(LOCATIONS_BASE, {
    params: {
      warehouse_id: params?.warehouse_id,
      zone_id: params?.zone_id,
      q: params?.q,
      page: params?.page ?? 1,
      page_size: params?.page_size ?? 10000,
    },
  });
  return data;
};
