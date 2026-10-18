import { useCallback, useMemo, useRef, useState } from "react";
import { message } from "@/components/ui";
import CcLocationLinesModal from "@/components/outbound/CcLocationLinesModal";
import OperatorMapCanvas from "@/components/warehouse/OperatorMapCanvas";
import type { BufferMapCanvasTuning } from "@/components/warehouse/OperatorMapCanvas";
import { useOperatorDisplayZoneMasanMap } from "@/hooks/useOperatorDisplayZoneMasanMap";
import MonitorZoneLocationSidebar from "@/components/monitor/MonitorZoneLocationSidebar";
import type { MasanCcLocationResponse } from "@/types/masan";
import {
  ccLocationLinesFromPendingStock,
  ccLocationResponseFromPendingAndCache,
  loadCcLocationModalData,
} from "@/utils/masanCcLocationModalData";
import {
  buildCcPendingStockOverlaysForVt,
  pendingAllocationsForVtLocationId,
} from "@/utils/masanPendingStockOverlay";

type Props = {
  warehouseId: number;
  displayZoneId: number;
  tuning?: BufferMapCanvasTuning;
  className?: string;
  modalZIndex?: number;
};

function linkedCcCodesForVt(
  vtLocationId: number,
  pendingStock: Parameters<typeof pendingAllocationsForVtLocationId>[0],
  locationCodeById: Map<number, string>,
): string[] {
  const lines = pendingAllocationsForVtLocationId(
    pendingStock,
    vtLocationId,
    locationCodeById,
  );
  const codes = new Set<string>();
  for (const row of lines) {
    const fromRow = row.ccLocationCode?.trim();
    if (fromRow) {
      codes.add(fromRow);
      continue;
    }
    const fromId = locationCodeById.get(row.ccLocationId)?.trim();
    if (fromId) codes.add(fromId);
  }
  return [...codes];
}

/** CC đã gán xe (biển số dưới ô) — không có coi như không có chia tại ô đó. */
function assignedCcCodeSet(
  locationSubLabelByCode: Record<string, string>,
): Set<string> {
  const out = new Set<string>();
  for (const [code, plate] of Object.entries(locationSubLabelByCode)) {
    if (code.trim() && plate?.trim()) out.add(code.trim());
  }
  return out;
}

export default function MonitorZoneInteractiveMap({
  warehouseId,
  displayZoneId,
  tuning,
  className,
  modalZIndex,
}: Props) {
  const masan = useOperatorDisplayZoneMasanMap(warehouseId, displayZoneId);
  const ccRequestIdRef = useRef(0);
  const [selectedVtLocationId, setSelectedVtLocationId] = useState<
    number | null
  >(null);
  const [ccModalOpen, setCcModalOpen] = useState(false);
  const [ccLocationData, setCcLocationData] =
    useState<MasanCcLocationResponse | null>(null);
  const [ccLoading, setCcLoading] = useState(false);
  const [ccLocationCode, setCcLocationCode] = useState<string | null>(null);
  const [ccLocationName, setCcLocationName] = useState<string | null>(null);
  const [ccLocationId, setCcLocationId] = useState<number | null>(null);

  const assignedCcCodes = useMemo(
    () => assignedCcCodeSet(masan.locationSubLabelByCode ?? {}),
    [masan.locationSubLabelByCode],
  );

  const linkedCcCodes = useMemo(() => {
    if (selectedVtLocationId == null) return [];
    return linkedCcCodesForVt(
      selectedVtLocationId,
      masan.pendingStock,
      masan.ccLocationCodeById,
    );
  }, [selectedVtLocationId, masan.pendingStock, masan.ccLocationCodeById]);

  /** CC vừa có stock_ready cho VT vừa đang gán xe (có biển số). */
  const activeSortCcCodes = useMemo(
    () => linkedCcCodes.filter((code) => assignedCcCodes.has(code)),
    [linkedCcCodes, assignedCcCodes],
  );

  const mapOverlayLabelByCode = useMemo(() => {
    if (selectedVtLocationId == null) {
      return masan.overlayLabelByCode ?? {};
    }
    const forVt = buildCcPendingStockOverlaysForVt(
      masan.pendingStock,
      selectedVtLocationId,
      masan.ccLocationCodeById,
    );
    const focused: Record<string, string> = {};
    for (const code of activeSortCcCodes) {
      const overlay = forVt[code];
      if (overlay) focused[code] = overlay;
    }
    return focused;
  }, [
    masan.overlayLabelByCode,
    masan.pendingStock,
    masan.ccLocationCodeById,
    selectedVtLocationId,
    activeSortCcCodes,
  ]);

  const ccSortingActiveCodes = useMemo(() => {
    if (selectedVtLocationId == null) return undefined;
    return activeSortCcCodes;
  }, [selectedVtLocationId, activeSortCcCodes]);

  const selectedVtCodes = useMemo(() => {
    if (selectedVtLocationId == null) return undefined;
    const code = masan.vtLocationCodeById.get(selectedVtLocationId)?.trim();
    return code ? [code] : undefined;
  }, [selectedVtLocationId, masan.vtLocationCodeById]);

  const openCcLocation = useCallback(
    async (locationCode: string, locationId: number, displayLabel: string) => {
      const requestId = ++ccRequestIdRef.current;
      setCcLocationCode(locationCode);
      setCcLocationId(locationId);
      setCcLocationName(displayLabel);
      setCcLocationData(null);
      setCcModalOpen(true);

      const overlayRefresh = await masan.refreshMasanMapOverlays();
      const pendingStock =
        overlayRefresh?.pendingStock ?? masan.pendingStock;
      const ccLocations =
        overlayRefresh?.ccLocations ?? masan.ccLocations;
      const cachedRow = ccLocations?.find(
        (row) =>
          row.location_id === locationId || row.location_code === locationCode,
      );
      const resolvedName =
        (cachedRow?.location_name ?? displayLabel).trim() || displayLabel;
      if (resolvedName) setCcLocationName(resolvedName);

      const pendingLines = ccLocationLinesFromPendingStock(
        pendingStock,
        locationId,
        masan.ccLocationCodeById,
        { locationCode, locationName: resolvedName },
      );
      if (pendingLines.length > 0) {
        setCcLocationData(
          ccLocationResponseFromPendingAndCache(
            warehouseId,
            locationId,
            resolvedName,
            pendingLines,
            cachedRow,
            masan.ccBucketZoneCode,
          ),
        );
      } else if (cachedRow) {
        setCcLocationData({
          warehouse_id: warehouseId,
          location_id: cachedRow.location_id,
          assigned: cachedRow.assigned,
          location_name: cachedRow.location_name,
          zone: cachedRow.zone,
          vehicle_number: cachedRow.vehicle_number,
          lines: cachedRow.lines,
        });
      }

      setCcLoading(true);
      try {
        const data = await loadCcLocationModalData({
          warehouseId,
          locationId,
          locationCode,
          locationName: resolvedName,
          pendingStock,
          ccLocationIdToCode: masan.ccLocationCodeById,
          cachedRow,
          ccBucketZoneCode: masan.ccBucketZoneCode,
        });
        if (requestId === ccRequestIdRef.current) {
          setCcLocationData(data);
          const apiName = (data.location_name ?? "").trim();
          if (apiName) setCcLocationName(apiName);
        }
      } catch (err) {
        if (requestId !== ccRequestIdRef.current) return;
        if (pendingLines.length === 0 && !cachedRow) {
          const detail =
            (err as { response?: { data?: { detail?: string } } })?.response
              ?.data?.detail ??
            (err instanceof Error
              ? err.message
              : "Không tải được hàng đã chia của ô");
          message.error(detail);
        }
      } finally {
        if (requestId === ccRequestIdRef.current) setCcLoading(false);
      }
    },
    [masan, warehouseId],
  );

  const handleCellClick = useCallback(
    async (payload: { locationCode: string }) => {
      const vtId = masan.vtLocationIdByCode.get(payload.locationCode);
      if (vtId != null) {
        setSelectedVtLocationId((prev) => (prev === vtId ? null : vtId));
        return;
      }
      const ccId = masan.clickableLocationIdByCode.get(payload.locationCode);
      if (ccId == null) return;
      const label =
        masan.ccLocationDisplayLabelById?.get(ccId)?.trim() ||
        payload.locationCode;
      await openCcLocation(payload.locationCode, ccId, label);
    },
    [
      masan.vtLocationIdByCode,
      masan.clickableLocationIdByCode,
      masan.ccLocationDisplayLabelById,
      openCcLocation,
    ],
  );

  const closeCcModal = useCallback(() => {
    setCcModalOpen(false);
    setCcLocationData(null);
    setCcLocationCode(null);
    setCcLocationName(null);
    setCcLocationId(null);
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="min-h-0 min-w-0 w-[60%] shrink-0">
        <OperatorMapCanvas
          zoneId={masan.mapZoneIds}
          tuning={tuning}
          overlayLabelByCode={mapOverlayLabelByCode}
          locationSubLabelByCode={masan.locationSubLabelByCode}
          interactiveCodes={masan.interactiveCodes}
          selectedCodes={selectedVtCodes}
          pendingConfirmOverlayCodes={activeSortCcCodes}
          ccSortingActiveCodes={ccSortingActiveCodes}
          vtLocationCodes={masan.vtLocationCodes}
          refetchStatusOnCellClick={false}
          cellClickDelayMs={0}
          onBufferCellClick={masan.masanEnabled ? handleCellClick : undefined}
          className={className}
        />
      </div>
      {masan.masanEnabled ? (
        <MonitorZoneLocationSidebar
          zoneTitle={masan.displayZone?.name ?? "Khu chia chọn"}
          pendingStock={masan.pendingStock}
          pendingStockLoading={masan.pendingStockLoading}
          vtLocationCodeById={masan.vtLocationCodeById}
          vtLocationDisplayLabelById={masan.vtLocationDisplayLabelById}
          ccLocationIdToCode={masan.ccLocationCodeById}
          ccLocationDisplayLabelById={masan.ccLocationDisplayLabelById}
          selectedVtLocationId={selectedVtLocationId}
          assignedCcCodes={assignedCcCodes}
          onClearVtSelection={() => setSelectedVtLocationId(null)}
        />
      ) : null}

      {ccLocationId != null && ccLocationCode ? (
        <CcLocationLinesModal
          open={ccModalOpen}
          locationCode={ccLocationCode}
          locationName={ccLocationName}
          locationId={ccLocationId}
          warehouseId={warehouseId}
          data={ccLocationData}
          loading={ccLoading}
          onClose={closeCcModal}
          onPickingListDownloadComplete={async () => {
            if (ccLocationCode && ccLocationId != null) {
              await openCcLocation(
                ccLocationCode,
                ccLocationId,
                ccLocationName ?? ccLocationCode,
              );
              return;
            }
            await masan.refreshMasanMapOverlays();
          }}
          zIndex={modalZIndex}
        />
      ) : null}
    </div>
  );
}
