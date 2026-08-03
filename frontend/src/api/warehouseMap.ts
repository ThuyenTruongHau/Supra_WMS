import axiosInstance from './axiosInstance';
import type {
  MapData,
  WarehouseMapImportResult,
  FullLocationsResponse,
  WarehouseLocationItemStockDetail,
} from '@/types/warehouseMap';

export const getActiveWarehouseMapApi = async (
  zoneId: number,
): Promise<MapData> => {
  const response = await axiosInstance.get<MapData>(
    '/api/v1/warehouse-maps/active',
    { params: { zone_id: zoneId } },
  );
  return response.data;
};

export const getFullLocationsApi = async (
  zoneId: number,
): Promise<FullLocationsResponse> => {
  const response = await axiosInstance.get<FullLocationsResponse>(
    '/api/v1/warehouse-locations/locations_full',
    { params: { zone_id: zoneId } },
  );
  return response.data;
};

export const importWarehouseMapApi = async (
  zoneId: number,
  file: File,
): Promise<WarehouseMapImportResult> => {
  const formData = new FormData();
  formData.append('zone_id', String(zoneId));
  formData.append('file', file);

  // Không tự set Content-Type — để axios/browser tự thêm boundary
  const response = await axiosInstance.post<WarehouseMapImportResult>(
    '/api/v1/warehouse-maps/import',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
  return response.data;
};

export const downloadActiveMapApi = async (
  zoneId: number,
): Promise<Blob> => {
  const response = await axiosInstance.get(
    '/api/v1/warehouse-maps/active/download',
    {
      params: { zone_id: zoneId },
      responseType: 'blob',
    },
  );

  console.log(response.data)
  return response.data;
};

export const getLocationDetailByCodeApi = async (
  locationCode: string,
  includeInactive = false,
): Promise<WarehouseLocationItemStockDetail> => {
  const code = encodeURIComponent(locationCode);
  const response = await axiosInstance.get<WarehouseLocationItemStockDetail>(
    `/api/v1/warehouse-location-details/by-code/${code}`,
    {
      params: { include_inactive: includeInactive },
    },
  );
  return response.data;
};
