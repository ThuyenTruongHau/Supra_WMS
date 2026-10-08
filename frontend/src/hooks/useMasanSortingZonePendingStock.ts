import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMasanSortingZonePendingStockApi } from "@/api/masan";

export const masanSortingZonePendingStockQueryKey = (
  warehouseId: number,
  ccZoneCode: string,
) => ["masan", "sorting-zone", "pending-stock", warehouseId, ccZoneCode] as const;

export function useMasanSortingZonePendingStock(
  warehouseId: number,
  ccZoneCode: string | null,
  enabled: boolean,
) {
  const zone = ccZoneCode?.trim() ?? "";
  const republishDoneRef = useRef(false);

  useEffect(() => {
    republishDoneRef.current = false;
  }, [warehouseId, zone]);

  const query = useQuery({
    queryKey: masanSortingZonePendingStockQueryKey(warehouseId, zone),
    queryFn: async () => {
      const republish = !republishDoneRef.current;
      if (republish) republishDoneRef.current = true;
      return getMasanSortingZonePendingStockApi(warehouseId, zone, republish);
    },
    enabled: enabled && warehouseId > 0 && zone.length > 0,
    staleTime: 1_000,
  });

  return query;
}
