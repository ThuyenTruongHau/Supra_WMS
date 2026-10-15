import { useCallback, useMemo, useState } from "react";
import { message } from "@/components/ui";
import OperatorMapCanvas from "@/components/warehouse/OperatorMapCanvas";
import type { BufferMapCanvasTuning } from "@/components/warehouse/OperatorMapCanvas";
import { buildCcPendingStockOverlaysForVt } from "@/utils/masanPendingStockOverlay";
import { useOperatorDisplayZoneMasanMap } from "@/hooks/useOperatorDisplayZoneMasanMap";
import MonitorZoneLocationSidebar from "@/components/monitor/MonitorZoneLocationSidebar";
import type { MasanPendingAllocationWithCc } from "@/types/masan";

type Props = {
  warehouseId: number;
  displayZoneId: number;
  tuning?: BufferMapCanvasTuning;
  className?: string;
  modalZIndex?: number;
};

function linkedCcCodesForVt(
  vtLocationId: number,
  pendingByToLocationId: Map<number, MasanPendingAllocationWithCc[]>,
  locationCodeById: Map<number, string>,
): string[] {
  const lines = pendingByToLocationId.get(vtLocationId) ?? [];
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
}: Props) {
  const masan = useOperatorDisplayZoneMasanMap(warehouseId, displayZoneId);
  const [selectedVtLocationId, setSelectedVtLocationId] = useState<
    number | null
  >(null);

  const assignedCcCodes = useMemo(
    () => assignedCcCodeSet(masan.locationSubLabelByCode ?? {}),
    [masan.locationSubLabelByCode],
  );

  const linkedCcCodes = useMemo(() => {
    if (selectedVtLocationId == null) return [];
    return linkedCcCodesForVt(
      selectedVtLocationId,
      masan.pendingByToLocationId,
      masan.ccLocationCodeById,
    );
  }, [
    selectedVtLocationId,
    masan.pendingByToLocationId,
    masan.ccLocationCodeById,
  ]);

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

  const handleCellClick = useCallback(
    (payload: { locationCode: string }) => {
      const vtId = masan.vtLocationIdByCode.get(payload.locationCode);
      if (vtId != null) {
        setSelectedVtLocationId((prev) => (prev === vtId ? null : vtId));
        return;
      }
      const ccId = masan.clickableLocationIdByCode.get(payload.locationCode);
      if (ccId == null) return;
      message.info(
        "Chọn ô VT (vị trí đích) để xem các ô CC cần lấy hàng cho VT đó.",
      );
    },
    [masan.vtLocationIdByCode, masan.clickableLocationIdByCode],
  );

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
    </div>
  );
}
