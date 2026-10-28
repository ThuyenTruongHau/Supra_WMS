import { useCallback, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import { message } from "@/components/ui";
import { masanStartSortingTimeApi } from "@/api/masan";
import MasanCcPendingStockConfirmModal from "@/components/outbound/MasanCcPendingStockConfirmModal";
import OperatorMapCanvas from "@/components/warehouse/OperatorMapCanvas";
import type { BufferMapCanvasTuning } from "@/components/warehouse/OperatorMapCanvas";
import { useOperatorDisplayZoneMasanMap } from "@/hooks/useOperatorDisplayZoneMasanMap";
import MonitorZoneLocationSidebar from "@/components/monitor/MonitorZoneLocationSidebar";
import { getApiErrorDetail } from "@/types/apiError";
import {
  buildCcPendingStockOverlaysForVt,
  confirmableAllocationsForCcLocationId,
  pendingAllocationsForVtLocationId,
} from "@/utils/masanPendingStockOverlay";

function formatSortingClock(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = dayjs(value);
  if (!parsed.isValid()) return null;
  return parsed.format("HH:mm:ss DD/MM/YYYY");
}

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
  const vtClickGenRef = useRef(0);
  const [selectedVtLocationId, setSelectedVtLocationId] = useState<
    number | null
  >(null);
  const [pendingConfirmOpen, setPendingConfirmOpen] = useState(false);
  const [pendingConfirmLocationId, setPendingConfirmLocationId] = useState<
    number | null
  >(null);
  const [pendingConfirmLocationCode, setPendingConfirmLocationCode] = useState<
    string | null
  >(null);
  const [pendingConfirmLocationName, setPendingConfirmLocationName] = useState<
    string | null
  >(null);

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

  const closeConfirmModal = useCallback(() => {
    setPendingConfirmOpen(false);
    setPendingConfirmLocationId(null);
    setPendingConfirmLocationCode(null);
    setPendingConfirmLocationName(null);
  }, []);

  const clearVtSelection = useCallback(() => {
    vtClickGenRef.current += 1;
    setSelectedVtLocationId(null);
    closeConfirmModal();
  }, [closeConfirmModal]);

  const handleCellClick = useCallback(
    async (payload: { locationCode: string }) => {
      const vtId = masan.vtLocationIdByCode.get(payload.locationCode);
      if (vtId != null) {
        if (selectedVtLocationId === vtId) {
          clearVtSelection();
          return;
        }

        const clickGen = ++vtClickGenRef.current;
        setSelectedVtLocationId(vtId);
        closeConfirmModal();

        const overlayRefresh = await masan.refreshMasanMapOverlays();
        if (vtClickGenRef.current !== clickGen) return;

        const pendingStock =
          overlayRefresh?.pendingStock ?? masan.pendingStock;
        const lines = pendingAllocationsForVtLocationId(
          pendingStock,
          vtId,
          masan.ccLocationCodeById,
        );
        const allocationIds = lines
          .map((row) => row.id)
          .filter((id) => Number.isFinite(id) && id > 0);

        if (allocationIds.length > 0) {
          try {
            const result = await masanStartSortingTimeApi({
              allocation_ids: allocationIds,
            });
            if (vtClickGenRef.current !== clickGen) return;
            const clock = formatSortingClock(result.started_at);
            if (clock) {
              if (result.already_started) {
                message.info(`Đã tính thời gian chia từ ${clock}`);
              } else {
                message.success(`Bắt đầu tính thời gian chia từ ${clock}`);
              }
            }
          } catch (err: unknown) {
            if (vtClickGenRef.current !== clickGen) return;
            message.error(
              getApiErrorDetail(err, "Không ghi được thời gian bắt đầu chia"),
            );
            setSelectedVtLocationId(null);
            closeConfirmModal();
          }
        }
        return;
      }
      if (selectedVtLocationId == null) {
        message.info("Chọn ô VT trên map trước khi xác nhận tại ô CC");
        return;
      }

      const ccCode = payload.locationCode.trim();
      if (!activeSortCcCodes.includes(ccCode)) {
        message.info("Ô CC này không có hàng chờ cho VT đang chọn");
        return;
      }

      const ccId = masan.clickableLocationIdByCode.get(payload.locationCode);
      if (ccId == null) return;
      const label =
        masan.ccLocationDisplayLabelById?.get(ccId)?.trim() ||
        payload.locationCode;

      const zone = (masan.ccBucketZoneCode ?? "").trim();
      if (warehouseId <= 0 || !zone) {
        message.error("Thiếu thông tin xác nhận");
        return;
      }

      setPendingConfirmLocationId(ccId);
      setPendingConfirmLocationCode(payload.locationCode);
      setPendingConfirmLocationName(label);
      setPendingConfirmOpen(true);
      void masan.refreshMasanMapOverlays();
    },
    [
      masan,
      warehouseId,
      selectedVtLocationId,
      closeConfirmModal,
      clearVtSelection,
      activeSortCcCodes,
    ],
  );

  const selectedVtDisplayLabel = useMemo(() => {
    if (selectedVtLocationId == null) return null;
    return (
      masan.vtLocationDisplayLabelById?.get(selectedVtLocationId)?.trim() ||
      masan.vtLocationCodeById.get(selectedVtLocationId)?.trim() ||
      `#${selectedVtLocationId}`
    );
  }, [
    selectedVtLocationId,
    masan.vtLocationDisplayLabelById,
    masan.vtLocationCodeById,
  ]);

  const pendingConfirmLines = useMemo(() => {
    if (pendingConfirmLocationId == null || selectedVtLocationId == null) {
      return [];
    }
    return confirmableAllocationsForCcLocationId(
      masan.pendingStock,
      pendingConfirmLocationId,
      masan.ccLocationCodeById,
      {
        locationCode: pendingConfirmLocationCode,
        locationName: pendingConfirmLocationName,
      },
      selectedVtLocationId,
    );
  }, [
    masan.pendingStock,
    masan.ccLocationCodeById,
    pendingConfirmLocationId,
    pendingConfirmLocationCode,
    pendingConfirmLocationName,
    selectedVtLocationId,
  ]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1">
      <div className="flex min-h-0 min-w-0 w-[60%] shrink-0 flex-col">
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
          onClearVtSelection={clearVtSelection}
        />
      ) : null}

      {warehouseId > 0 &&
      masan.ccBucketZoneCode &&
      pendingConfirmLocationId != null &&
      selectedVtLocationId != null ? (
        <MasanCcPendingStockConfirmModal
          open={pendingConfirmOpen}
          onClose={closeConfirmModal}
          warehouseId={warehouseId}
          displayZoneId={displayZoneId}
          ccBucketZoneCode={masan.ccBucketZoneCode}
          vtLocationId={selectedVtLocationId}
          vtLocationCode={
            masan.vtLocationCodeById.get(selectedVtLocationId) ?? null
          }
          vtLocationName={selectedVtDisplayLabel}
          ccLocationCode={pendingConfirmLocationCode}
          ccLocationName={pendingConfirmLocationName}
          title="Xác nhận lấy hàng tại CC"
          locationKindLabel="Vị trí CC"
          secondaryLocationKindLabel="Vị trí VT"
          emptyHint="Không còn hàng chờ xác nhận tại CC này cho VT đang chọn."
          lines={pendingConfirmLines}
          onConfirmed={masan.invalidateMasanCcCaches}
          zIndex={modalZIndex}
        />
      ) : null}
    </div>
  );
}
