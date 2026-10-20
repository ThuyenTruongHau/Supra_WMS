import { useMemo } from "react";
import { outboundVtClickableZoneIdsFor } from "@/constants/outboundMapZones";
import { useZonesMapStatus } from "@/hooks/useWarehouseMap";
import type { FullLocationDetail } from "@/types/warehouseMap";
import { isVtMapLocation } from "@/utils/locationBin";

export type MasanVtLocationsResult = {
  /** Display zone (URL `/export/zone/{id}`): 8 hoặc 9. */
  displayZoneId: number;
  /** Zone DB chứa ô VT (8 hoặc 9) — dùng cho `GET .../zones/{id}/for-map`. */
  vtZoneIds: number[];
  locations: FullLocationDetail[];
  isLoading: boolean;
  failedZoneIds: number[];
};

/**
 * Lấy danh sách VT theo khu operator (display zone), giống `SortingWaveStationBoard`:
 * `outboundVtClickableZoneIdsFor(displayZoneId)` → zone map VT (không lẫn CC 10/11).
 */
export function useMasanVtLocations(
  displayZoneId: number,
): MasanVtLocationsResult {
  const vtZoneIds = useMemo(
    () => outboundVtClickableZoneIdsFor(displayZoneId),
    [displayZoneId],
  );
  const { items, isLoading, failedZoneIds } = useZonesMapStatus(vtZoneIds);

  const locations = useMemo(() => {
    if (vtZoneIds.length === 0) return [];
    const pool = [...items];
    const vtMatched = pool.filter((loc) =>
      isVtMapLocation(loc.location_code, loc.location_name),
    );
    // Zone VT chỉ nên có ô VT; nếu mã DB lệch chuẩn, fallback toàn bộ zone như board.
    const list = vtMatched.length > 0 ? vtMatched : pool;
    return list.sort((a, b) =>
      a.location_code.localeCompare(b.location_code, undefined, {
        numeric: true,
      }),
    );
  }, [items, vtZoneIds.length]);

  return {
    displayZoneId,
    vtZoneIds,
    locations,
    isLoading,
    failedZoneIds,
  };
}
