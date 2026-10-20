import { useQuery } from "@tanstack/react-query";
import { getMasanSortingZoneCcLocationsApi } from "@/api/masan";

const MASAN_CC_ZONE_REFETCH_MS = 5_000;
const MASAN_CC_ZONE_STALE_MS = 4_000;

export const masanSortingZoneCcLocationsQueryKey = (
  warehouseId: number,
  ccZoneCode: string,
) => ["masan", "sorting-zone", "cc-locations", warehouseId, ccZoneCode] as const;

export function useMasanSortingZoneCcLocations(
  warehouseId: number,
  ccZoneCode: string | null,
  enabled: boolean,
) {
  const zone = ccZoneCode?.trim() ?? "";
  return useQuery({
    queryKey: masanSortingZoneCcLocationsQueryKey(warehouseId, zone),
    queryFn: ({ signal }) =>
      getMasanSortingZoneCcLocationsApi(warehouseId, zone, signal),
    enabled: enabled && warehouseId > 0 && zone.length > 0,
    refetchInterval: MASAN_CC_ZONE_REFETCH_MS,
    staleTime: MASAN_CC_ZONE_STALE_MS,
  });
}

export function ccVehicleByCodeFromZoneLocations(
  locations: { location_code: string; assigned: boolean; vehicle_number: string | null }[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of locations) {
    const code = (row.location_code || "").trim();
    const plate = (row.vehicle_number ?? "").trim();
    if (!code || !row.assigned || !plate) continue;
    out[code] = plate;
  }
  return out;
}
