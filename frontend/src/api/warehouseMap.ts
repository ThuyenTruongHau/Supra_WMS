import axiosInstance from './axiosInstance';
import type {
  MapData,
  WarehouseMapImportResult,
  FullLocationsResponse,
  WarehouseLocationItemStockDetail,
} from '@/types/warehouseMap';

export const getActiveWarehouseMapApi = async (
  warehouseId: number,
): Promise<MapData> => {
  const response = await axiosInstance.get<MapData>(
    `/api/v1/warehouse-maps/${warehouseId}/map-data`,
  );
  return response.data;
};

export const getFullLocationsApi = async (
  warehouseId: number,
): Promise<FullLocationsResponse> => {
  const response = await axiosInstance.get<FullLocationsResponse>(
    '/api/v1/locations/for-map',
    { params: { warehouse_id: warehouseId } },
  );
  return response.data;
};

export const importWarehouseMapApi = async (
  warehouseId: number,
  file: File,
): Promise<WarehouseMapImportResult> => {
  const formData = new FormData();
  formData.append('warehouse_id', String(warehouseId));
  formData.append('file', file);

  const response = await axiosInstance.post<WarehouseMapImportResult>(
    '/api/v1/warehouse-maps/import',
    formData,
    { timeout: 5 * 60 * 1000 },
  );
  return response.data;
};

export const downloadActiveMapApi = async (
  warehouseId: number,
): Promise<Blob> => {
  const response = await axiosInstance.get(
    `/api/v1/warehouse-maps/${warehouseId}/export`,
    {
      responseType: 'blob',
    },
  );
  return response.data;
};

export const getLocationDetailByIdApi = async (
  locationId: number,
): Promise<WarehouseLocationItemStockDetail> => {
  const response = await axiosInstance.get<WarehouseLocationItemStockDetail>(
    `/api/v1/locations/${locationId}/detail`,
  );
  return response.data;
};

/** Resolve location detail by code via list + detail (for ExitPoint / picker flows). */
export const getLocationDetailByCodeApi = async (
  locationCode: string,
  includeInactive = false,
): Promise<WarehouseLocationItemStockDetail> => {
  const listResponse = await axiosInstance.get<{
    items: Array<{ id: number; location_code: string }>;
  }>('/api/v1/locations', {
    params: {
      q: locationCode,
      page_size: 100,
      ...(includeInactive ? {} : {}),
    },
  });
  const match = listResponse.data.items.find(
    (item) => item.location_code === locationCode,
  );
  if (!match) {
    throw new Error(`Location not found: ${locationCode}`);
  }
  return getLocationDetailByIdApi(match.id);
};
