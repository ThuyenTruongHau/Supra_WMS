import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  OUTBOUND_DISPLAY_ZONES,
  outboundCcZoneIdFor,
  outboundClickableZoneIdsFor,
  outboundMapZoneIdsFor,
  outboundVtClickableZoneIdsFor,
} from "@/constants/outboundMapZones";
import {
  ccVehicleByCodeFromZoneLocations,
  masanSortingZoneCcLocationsQueryKey,
  useMasanSortingZoneCcLocations,
} from "@/hooks/useMasanSortingZoneCcLocations";
import {
  masanSortingZonePendingStockQueryKey,
  useMasanSortingZonePendingStock,
} from "@/hooks/useMasanSortingZonePendingStock";
import { useMasanSortingZoneWebSocket } from "@/hooks/useMasanSortingZoneWebSocket";
import { useZonesMapStatus } from "@/hooks/useWarehouseMap";
import {
  buildPendingStockMapOverlays,
  pendingAllocationsByLocationId,
  pendingAllocationsByToLocationId,
  pendingConfirmOverlayCodes,
} from "@/utils/masanPendingStockOverlay";

/** Masan CC + pending-stock + WS cho một khu display (8 hoặc 9) — dùng Monitor và board xuất. */
export function useOperatorDisplayZoneMasanMap(
  warehouseId: number,
  displayZoneId: number,
) {
  const queryClient = useQueryClient();
  const displayZone = OUTBOUND_DISPLAY_ZONES.find((z) => z.id === displayZoneId);
  const ccBucketZoneCode = displayZone?.ccBucketZoneCode ?? null;
  const mapZoneIds = outboundMapZoneIdsFor(displayZoneId);
  const ccZoneId = outboundCcZoneIdFor(displayZoneId);
  const vtZoneIds = outboundVtClickableZoneIdsFor(displayZoneId);
  const ccClickableZoneIds = outboundClickableZoneIdsFor(displayZoneId);

  const masanEnabled = warehouseId > 0 && Boolean(ccBucketZoneCode);

  const ccQuery = useMasanSortingZoneCcLocations(
    warehouseId,
    ccBucketZoneCode,
    masanEnabled,
  );
  const pendingQuery = useMasanSortingZonePendingStock(
    warehouseId,
    ccBucketZoneCode,
    masanEnabled,
  );

  useMasanSortingZoneWebSocket({
    warehouseId,
    ccZoneCode: ccBucketZoneCode,
    enabled: masanEnabled,
  });

  const ccStatusQuery = useZonesMapStatus(ccClickableZoneIds);
  const vtStatusQuery = useZonesMapStatus(vtZoneIds);

  const allInteractiveLocations = useMemo(() => {
    const seen = new Set<string>();
    const merged = [];
    for (const loc of [...ccStatusQuery.items, ...vtStatusQuery.items]) {
      if (seen.has(loc.location_code)) continue;
      seen.add(loc.location_code);
      merged.push(loc);
    }
    return merged;
  }, [ccStatusQuery.items, vtStatusQuery.items]);

  const clickableLocationIdByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const loc of ccStatusQuery.items) {
      map.set(loc.location_code, loc.id);
    }
    return map;
  }, [ccStatusQuery.items]);

  const clickableLocationCodeById = useMemo(() => {
    const map = new Map<number, string>();
    for (const loc of ccStatusQuery.items) {
      map.set(loc.id, loc.location_code);
    }
    return map;
  }, [ccStatusQuery.items]);

  const vtLocationIdByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const loc of vtStatusQuery.items) {
      map.set(loc.location_code, loc.id);
    }
    return map;
  }, [vtStatusQuery.items]);

  const vtLocationCodeById = useMemo(() => {
    const map = new Map<number, string>();
    for (const loc of vtStatusQuery.items) {
      map.set(loc.id, loc.location_code);
    }
    return map;
  }, [vtStatusQuery.items]);

  const locationSubLabelByCode = useMemo(
    () => ccVehicleByCodeFromZoneLocations(ccQuery.data?.locations ?? []),
    [ccQuery.data?.locations],
  );

  const overlayLabelByCode = useMemo(
    () =>
      buildPendingStockMapOverlays(
        pendingQuery.data,
        vtLocationCodeById,
        clickableLocationCodeById,
      ),
    [pendingQuery.data, vtLocationCodeById, clickableLocationCodeById],
  );

  const pendingConfirmOverlayCodesSet = useMemo(
    () =>
      pendingConfirmOverlayCodes(
        pendingQuery.data,
        vtLocationCodeById,
        clickableLocationCodeById,
      ),
    [pendingQuery.data, vtLocationCodeById, clickableLocationCodeById],
  );

  const pendingByLocationId = useMemo(
    () => pendingAllocationsByLocationId(pendingQuery.data),
    [pendingQuery.data],
  );

  const pendingByToLocationId = useMemo(
    () =>
      pendingAllocationsByToLocationId(
        pendingQuery.data,
        clickableLocationCodeById,
      ),
    [pendingQuery.data, clickableLocationCodeById],
  );

  const interactiveCodes = useMemo(() => {
    if (!masanEnabled || ccZoneId == null) return undefined;
    const codes = new Set<string>();
    for (const loc of allInteractiveLocations) {
      codes.add(loc.location_code);
    }
    return codes.size > 0 ? codes : undefined;
  }, [masanEnabled, ccZoneId, allInteractiveLocations]);

  const invalidateMasanCcCaches = useCallback(() => {
    if (!masanEnabled || !ccBucketZoneCode) return;
    void queryClient.invalidateQueries({
      queryKey: masanSortingZoneCcLocationsQueryKey(warehouseId, ccBucketZoneCode),
    });
    void queryClient.invalidateQueries({
      queryKey: masanSortingZonePendingStockQueryKey(warehouseId, ccBucketZoneCode),
    });
  }, [queryClient, warehouseId, ccBucketZoneCode, masanEnabled]);

  const refreshMasanMapOverlays = useCallback(async () => {
    if (!masanEnabled) return undefined;
    const [ccResult] = await Promise.all([
      ccQuery.refetch(),
      pendingQuery.refetch(),
      ccStatusQuery.refetch(),
      vtStatusQuery.refetch(),
    ]);
    return ccResult.data?.locations;
  }, [masanEnabled, ccQuery, pendingQuery, ccStatusQuery, vtStatusQuery]);

  const resolveLocationName = useCallback(
    (locationCode: string, locationId: number) => {
      const fromStatus = allInteractiveLocations.find(
        (loc) => loc.id === locationId || loc.location_code === locationCode,
      );
      const name = (fromStatus?.location_name ?? "").trim();
      if (name) return name;
      const fromCc = ccQuery.data?.locations?.find(
        (row) =>
          row.location_id === locationId || row.location_code === locationCode,
      );
      return (fromCc?.location_name ?? "").trim() || null;
    },
    [allInteractiveLocations, ccQuery.data?.locations],
  );

  return {
    displayZone,
    mapZoneIds,
    ccBucketZoneCode,
    ccZoneId,
    masanEnabled,
    locationSubLabelByCode,
    overlayLabelByCode,
    pendingConfirmOverlayCodes: pendingConfirmOverlayCodesSet,
    interactiveCodes,
    clickableLocationIdByCode,
    vtLocationIdByCode,
    vtLocationCodeById,
    pendingByLocationId,
    pendingByToLocationId,
    invalidateMasanCcCaches,
    refreshMasanMapOverlays,
    ccLocations: ccQuery.data?.locations,
    pendingStock: pendingQuery.data,
    pendingStockLoading: pendingQuery.isLoading,
    resolveLocationName,
  };
}
