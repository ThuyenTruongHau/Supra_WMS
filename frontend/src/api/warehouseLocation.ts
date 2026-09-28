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
  warehouseId: number,
  skip = 0,
  limit = PAGE_SIZE,
): Promise<WarehouseLocation[]> {
  const response = await axiosInstance.get<WarehouseLocation[]>('/api/v1/warehouse-locations/', {
    params: { zone_id: warehouseId, is_active: true, skip, limit },
  });
  return response.data;
}

export async function getAllLocationsByZoneApi(warehouseId: number): Promise<WarehouseLocation[]> {
  const all: WarehouseLocation[] = [];
  let skip = 0;

  while (true) {
    const page = await getLocationsByZoneApi(warehouseId, skip, PAGE_SIZE);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return all;
}

export async function getItemStockByZoneApi(
  warehouseId: number,
  skip = 0,
  limit = PAGE_SIZE,
): Promise<ItemStockRow[]> {
  const response = await axiosInstance.get<ItemStockRow[]>('/api/v1/item-stock', {
    params: { zone_id: warehouseId, skip, limit },
  });
  return response.data;
}

export async function getAllItemStockByZoneApi(warehouseId: number): Promise<ItemStockRow[]> {
  const all: ItemStockRow[] = [];
  let skip = 0;

  while (true) {
    const page = await getItemStockByZoneApi(warehouseId, skip, PAGE_SIZE);
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
  warehouseId: number;
  excludeLocationIds?: number[];
  limit?: number;
}): Promise<EmptyLocationsListResponse> {
  const response = await axiosInstance.get<EmptyLocationsListResponse>(
    '/api/v1/warehouse-locations/empty',
    {
      params: {
        zone_id: params.warehouseId,
        exclude_location_ids: params.excludeLocationIds ?? [],
        limit: params.limit ?? 200,
      },
    },
  );
  return response.data;
}

export async function listStorageLocationsApi(params: {
  warehouseId: number;
  stockStatus: StorageStockStatus;
  excludeLocationIds?: number[];
  limit?: number;
  q?: string;
}): Promise<StorageLocationsListResponse> {
  const response = await axiosInstance.get<StorageLocationsListResponse>(
    '/api/v1/warehouse-locations/storage',
    {
      params: {
        zone_id: params.warehouseId,
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
  warehouseId: number;
  skip?: number;
  limit?: number;
}): Promise<StorageRelocateCommandListResponse> {
  const response = await axiosInstance.get<StorageRelocateCommandListResponse>(
    '/api/v1/warehouse-locations/storage/relocate-commands',
    {
      params: {
        zone_id: params.warehouseId,
        skip: params.skip ?? 0,
        limit: params.limit ?? 50,
      },
    },
  );
  return response.data;
}

export async function getLocationStockLabelsApi(
  warehouseId: number,
): Promise<LocationStockLabelsResponse> {
  const response = await axiosInstance.get<LocationStockLabelsResponse>(
    '/api/v1/warehouse-locations/stock-labels',
    { params: { zone_id: warehouseId } },
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
