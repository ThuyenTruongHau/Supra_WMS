import { useQuery } from "@tanstack/react-query";
import { getMasanSortingItemsNeededApi } from "@/api/masan";

export const masanSortingItemsNeededQueryKey = (
  warehouseId: number,
  ccZoneCode: string,
) => ["masan", "sorting-items-needed", warehouseId, ccZoneCode] as const;

export function useMasanSortingItemsNeeded(
  warehouseId: number,
  ccZoneCode: string | null,
  enabled: boolean,
) {
  const zone = ccZoneCode?.trim() ?? "";
  return useQuery({
    queryKey: masanSortingItemsNeededQueryKey(warehouseId, zone),
    queryFn: ({ signal }) =>
      getMasanSortingItemsNeededApi(warehouseId, zone, signal),
    enabled: enabled && warehouseId > 0 && zone.length > 0,
    staleTime: 4_000,
    refetchInterval: enabled && warehouseId > 0 && zone.length > 0 ? 5_000 : false,
  });
}
