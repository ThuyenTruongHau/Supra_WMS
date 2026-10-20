import { useMemo } from "react";
import { outboundClickableZoneIdsFor } from "@/constants/outboundMapZones";
import { useZonesMapStatus } from "@/hooks/useWarehouseMap";
import type { FullLocationDetail } from "@/types/warehouseMap";
import { isCcLocationCode } from "@/utils/locationBin";

export type MasanCcLocationsResult = {
  displayZoneId: number;
  ccZoneIds: number[];
  locations: FullLocationDetail[];
  locationIds: number[];
  isLoading: boolean;
  failedZoneIds: number[];
};

/** Ô CC map (zone DB 10 hoặc 11) theo display zone operator 8/9. */
export function useMasanCcLocations(
  displayZoneId: number,
): MasanCcLocationsResult {
  const ccZoneIds = useMemo(
    () => outboundClickableZoneIdsFor(displayZoneId),
    [displayZoneId],
  );
  const { items, isLoading, failedZoneIds } = useZonesMapStatus(ccZoneIds);

  const locations = useMemo(() => {
    if (ccZoneIds.length === 0) return [];
    const pool = [...items];
    const ccMatched = pool.filter((loc) => isCcLocationCode(loc.location_code));
    const list = ccMatched.length > 0 ? ccMatched : pool;
    return list.sort((a, b) =>
      a.location_code.localeCompare(b.location_code, undefined, {
        numeric: true,
      }),
    );
  }, [ccZoneIds.length, items]);

  const locationIds = useMemo(
    () => locations.map((loc) => loc.id),
    [locations],
  );

  return {
    displayZoneId,
    ccZoneIds,
    locations,
    locationIds,
    isLoading,
    failedZoneIds,
  };
}
