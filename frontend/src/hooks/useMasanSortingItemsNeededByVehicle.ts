import { useQuery } from "@tanstack/react-query";
import { getMasanSortingItemsNeededByVehicleApi } from "@/api/masan";

export const masanSortingItemsNeededByVehicleQueryKey = (
  warehouseId: number,
  ccZoneCode: string,
) => ["masan", "sorting-items-needed-by-vehicle", warehouseId, ccZoneCode] as const;

export function useMasanSortingItemsNeededByVehicle(
  warehouseId: number,
  ccZoneCode: string | null,
  enabled: boolean,
) {
  const zone = ccZoneCode?.trim() ?? "";
  return useQuery({
    queryKey: masanSortingItemsNeededByVehicleQueryKey(warehouseId, zone),
    queryFn: ({ signal }) =>
      getMasanSortingItemsNeededByVehicleApi(warehouseId, zone, signal),
    enabled: enabled && warehouseId > 0 && zone.length > 0,
    staleTime: 4_000,
    refetchInterval:
      enabled && warehouseId > 0 && zone.length > 0 ? 5_000 : false,
  });
}
