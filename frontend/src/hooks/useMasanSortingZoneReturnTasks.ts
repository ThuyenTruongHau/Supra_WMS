import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMasanSortingZoneReturnTasksApi } from "@/api/masan";
import type { MasanSortingReturnTaskRow } from "@/utils/masanSortingReturnTasks";

export function useMasanSortingZoneReturnTasks(
  warehouseId: number,
  sortingZoneCode: string | null,
  enabled: boolean,
) {
  const zone = (sortingZoneCode ?? "").trim();
  const queryEnabled = enabled && warehouseId > 0 && zone.length > 0;
  const query = useQuery({
    queryKey: ["masanSortingZoneReturnTasks", warehouseId, zone],
    queryFn: ({ signal }) =>
      getMasanSortingZoneReturnTasksApi(warehouseId, zone, signal),
    enabled: queryEnabled,
    staleTime: 0,
    refetchInterval: queryEnabled ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: queryEnabled,
    retry: 1,
  });
  const rows = useMemo(
    (): MasanSortingReturnTaskRow[] =>
      query.isError
        ? []
        : (query.data?.rows ?? []).map((row) => ({
            outboundOrderId: row.outbound_order_id,
            task: row.task,
          })),
    [query.data, query.isError],
  );
  return {
    rows,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
