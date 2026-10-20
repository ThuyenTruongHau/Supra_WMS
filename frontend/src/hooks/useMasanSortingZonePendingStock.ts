import { useQuery } from "@tanstack/react-query";
import { getMasanSortingZonePendingStockApi } from "@/api/masan";

export const masanSortingZonePendingStockQueryKey = (
  warehouseId: number,
  ccZoneCode: string,
) => ["masan", "sorting-zone", "pending-stock", warehouseId, ccZoneCode] as const;

/** Không poll: dữ liệu được làm mới qua WS `masan.sorting.*` (xem useMasanSortingZoneWebSocket). */
export function useMasanSortingZonePendingStock(
  warehouseId: number,
  ccZoneCode: string | null,
  enabled: boolean,
) {
  const zone = ccZoneCode?.trim() ?? "";

  return useQuery({
    queryKey: masanSortingZonePendingStockQueryKey(warehouseId, zone),
    queryFn: ({ signal }) =>
      getMasanSortingZonePendingStockApi(warehouseId, zone, false, signal),
    enabled: enabled && warehouseId > 0 && zone.length > 0,
    staleTime: 5_000,
  });
}
