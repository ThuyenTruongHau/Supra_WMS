import axiosInstance from './axiosInstance';
import type {
  EmptyLocation,
  EmptyLocationsListResponse,
  ItemStockRow,
  LocationStockLabelsResponse,
  StorageLocationsListResponse,
  StorageRelocateInput,
  StorageRelocateResult,
  StorageRelocateCommandListResponse,
  StorageStockStatus,
  SuggestEmptyLocationsInput,
  SuggestEmptyLocationsResponse,
  WarehouseLocation,
  WarehouseLocationDetail,
} from '@/types/warehouseLocation';
import { formatDisplayBin } from '@/utils/locationBin';

const PAGE_SIZE = 200;

export async function getLocationsByZoneApi(
  zoneId: number,
  skip = 0,
  limit = PAGE_SIZE,
): Promise<WarehouseLocation[]> {
  const response = await axiosInstance.get<WarehouseLocation[]>('/api/v1/warehouse-locations/', {
    params: { zone_id: zoneId, is_active: true, skip, limit },
  });
  return response.data;
}

export async function getAllLocationsByZoneApi(zoneId: number): Promise<WarehouseLocation[]> {
  const all: WarehouseLocation[] = [];
  let skip = 0;

  while (true) {
    const page = await getLocationsByZoneApi(zoneId, skip, PAGE_SIZE);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return all;
}

export async function getItemStockByZoneApi(
  zoneId: number,
  skip = 0,
  limit = PAGE_SIZE,
): Promise<ItemStockRow[]> {
  const response = await axiosInstance.get<ItemStockRow[]>('/api/v1/item-stock', {
    params: { zone_id: zoneId, skip, limit },
  });
  return response.data;
}

export async function getAllItemStockByZoneApi(zoneId: number): Promise<ItemStockRow[]> {
  const all: ItemStockRow[] = [];
  let skip = 0;

  while (true) {
    const page = await getItemStockByZoneApi(zoneId, skip, PAGE_SIZE);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return all;
}

export async function getLocationDetailApi(locationId: number): Promise<WarehouseLocationDetail> {
  const response = await axiosInstance.get<WarehouseLocationDetail>(
    `/api/v1/warehouse-location-details/${locationId}`,
  );
  return response.data;
}

export async function suggestEmptyLocationsApi(
  data: SuggestEmptyLocationsInput,
): Promise<SuggestEmptyLocationsResponse> {
  const response = await axiosInstance.post<SuggestEmptyLocationsResponse>(
    '/api/v1/warehouse-locations/suggest-empty',
    data,
  );
  return response.data;
}

export async function listEmptyLocationsApi(params: {
  zoneId: number;
  excludeLocationIds?: number[];
  limit?: number;
}): Promise<EmptyLocationsListResponse> {
  const response = await axiosInstance.get<EmptyLocationsListResponse>(
    '/api/v1/warehouse-locations/empty',
    {
      params: {
        zone_id: params.zoneId,
        exclude_location_ids: params.excludeLocationIds ?? [],
        limit: params.limit ?? 200,
      },
    },
  );
  return response.data;
}

export async function listStorageLocationsApi(params: {
  zoneId: number;
  stockStatus: StorageStockStatus;
  excludeLocationIds?: number[];
  limit?: number;
  q?: string;
}): Promise<StorageLocationsListResponse> {
  const response = await axiosInstance.get<StorageLocationsListResponse>(
    '/api/v1/warehouse-locations/storage',
    {
      params: {
        zone_id: params.zoneId,
        stock_status: params.stockStatus,
        exclude_location_ids: params.excludeLocationIds ?? [],
        limit: params.limit ?? 200,
        ...(params.q?.trim() ? { q: params.q.trim() } : {}),
      },
    },
  );
  return response.data;
}

export async function relocateStorageStockApi(
  data: StorageRelocateInput,
): Promise<StorageRelocateResult> {
  const response = await axiosInstance.post<StorageRelocateResult>(
    '/api/v1/warehouse-locations/storage/relocate',
    data,
  );
  return response.data;
}

export async function listStorageRelocateCommandsApi(params: {
  zoneId: number;
  skip?: number;
  limit?: number;
}): Promise<StorageRelocateCommandListResponse> {
  const response = await axiosInstance.get<StorageRelocateCommandListResponse>(
    '/api/v1/warehouse-locations/storage/relocate-commands',
    {
      params: {
        zone_id: params.zoneId,
        skip: params.skip ?? 0,
        limit: params.limit ?? 50,
      },
    },
  );
  return response.data;
}

export async function getLocationStockLabelsApi(
  zoneId: number,
): Promise<LocationStockLabelsResponse> {
  const response = await axiosInstance.get<LocationStockLabelsResponse>(
    '/api/v1/warehouse-locations/stock-labels',
    { params: { zone_id: zoneId } },
  );
  return response.data;
}

export function formatEmptyLocationLabel(location: EmptyLocation): string {
  const bin = formatDisplayBin(location.bin, location.location_type);
  const parts = [location.row, location.column, bin || location.bin]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  if (parts.length > 0) {
    return parts.join("-");
  }

  return "—";
}

export function formatStorageLocationLabel(
  location: {
    location_code: string;
    row: string | null;
    column: string | null;
    bin: string | null;
    location_type?: string | null;
    has_stock: boolean;
    product_name: string | null;
    quantity: number;
  },
): string {
  const bin = formatDisplayBin(location.bin, location.location_type ?? 'storage');
  const aisle = [location.row, location.column, bin || location.bin]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join("-");

  const aislePart = aisle ? `Dãy ${aisle}` : location.location_code;

  if (location.has_stock) {
    const qty = Number.isFinite(location.quantity)
      ? Math.round(location.quantity)
      : 0;
    const product = location.product_name?.trim() || "Có hàng";
    return `${location.location_code} (${aislePart} — ${qty} ${product})`;
  }

  return `${location.location_code} (${aislePart} — Đang trống)`;
}
