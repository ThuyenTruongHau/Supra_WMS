import axiosInstance from './axiosInstance';
import type {
  MapData,
  WarehouseMapImportResult,
  FullLocationsResponse,
  WarehouseLocationItemStockDetail,
  InboundBufferMapView,
  InboundBufferPointsResponse,
  WarehouseMapMetadata,
} from '@/types/warehouseMap';
import type { WarehouseLocationDetail } from '@/types/warehouseLocation';
import { logMapDebug, summarizeMapDataForLog } from '@/utils/warehouseMapRender';

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

export interface LocationsByLogicResponse {
  items: Array<{
    id: number;
    location_code: string;
    location_name: string;
    warehouse_id: number;
    zone_id: number | null;
    is_active: boolean;
  }>;
}

export const getLocationsByLogicApi = async (
  warehouseId: number,
  type: string,
): Promise<LocationsByLogicResponse> => {
  const response = await axiosInstance.get<LocationsByLogicResponse>(
    '/api/v1/locations/by-logic',
    { params: { warehouse_id: warehouseId, type } },
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


// --- NEW OPERATOR MAP APIS ---
export async function getActiveMapApi(zoneId: number): Promise<MapData> {
  const response = await axiosInstance.get<MapData>('/api/v1/warehouse-maps/active', {
    params: { zone_id: zoneId },
    timeout: 60000,
  });

  logMapDebug('API getActiveMap response', {
    zoneId,
    status: response.status,
    summary: summarizeMapDataForLog(response.data),
  });

  return response.data;
}

export async function getActiveMapMetadataApi(zoneId: number): Promise<WarehouseMapMetadata> {
  const response = await axiosInstance.get<WarehouseMapMetadata>(
    '/api/v1/warehouse-maps/active/metadata',
    { params: { zone_id: zoneId } },
  );
  return response.data;
}

export type MapLocationType =
  | 'storage'
  | 'inbound_buffer'
  | 'outbound_station'
  | 'sorting_station';

export type MapLocationTypeParam = MapLocationType | string;

export const DEFAULT_MAP_LOCATION_TYPE: MapLocationType = 'inbound_buffer';

export const WAVE_STATION_LOCATION_TYPES = 'sorting_station,outbound_station' as const;

function buildLocationMapParams(
  zoneId: number,
  locationType: MapLocationTypeParam,
  locationIds?: number[],
) {
  return {
    zone_id: zoneId,
    location_type: locationType,
    ...(locationIds && locationIds.length > 0 ? { location_ids: locationIds } : {}),
  };
}

function serializeMapParams(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        search.append(key, String(item));
      }
      continue;
    }
    search.append(key, String(value));
  }
  return search.toString();
}

export async function getInboundBufferPointsApi(
  zoneId: number,
  locationType: MapLocationTypeParam = DEFAULT_MAP_LOCATION_TYPE,
  locationIds?: number[],
): Promise<InboundBufferPointsResponse> {
  const response = await axiosInstance.get<InboundBufferPointsResponse>(
    '/api/v1/warehouse-maps/inbound-buffers',
    {
      params: buildLocationMapParams(zoneId, locationType, locationIds),
      paramsSerializer: { serialize: serializeMapParams },
    },
  );
  return response.data;
}

export async function getInboundBufferMapViewApi(
  zoneId: number,
  locationType: MapLocationTypeParam = DEFAULT_MAP_LOCATION_TYPE,
  locationIds?: number[],
): Promise<InboundBufferMapView> {
  const response = await axiosInstance.get<InboundBufferMapView>(
    '/api/v1/warehouse-maps/inbound-buffers/view',
    {
      params: buildLocationMapParams(zoneId, locationType, locationIds),
      paramsSerializer: { serialize: serializeMapParams },
      timeout: 60000,
    },
  );
  logMapDebug('API getInboundBufferMapView response', {
    zoneId,
    locationType,
    locationIds,
    status: response.status,
    bufferNodeCount: response.data.buffer_node_count,
    focusNodeCount: response.data.focus_node_count,
    pointCount: response.data.points?.length,
    summary: summarizeMapDataForLog(response.data.map),
  });
  return response.data;
}

export async function importMapApi(zoneId: number, file: File): Promise<WarehouseMapImportResult> {
  const formData = new FormData();
  formData.append('zone_id', String(zoneId));
  formData.append('file', file);

  const response = await axiosInstance.post<WarehouseMapImportResult>(
    '/api/v1/warehouse-maps/import',
    formData,
    {
      timeout: 120000,
      transformRequest: [
        (data, headers) => {
          if (data instanceof FormData && headers) {
            delete headers['Content-Type'];
          }
          return data;
        },
      ],
    },
  );
  return response.data;
}
