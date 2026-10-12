import { useRef, useState } from "react";
import { message } from "@/components/ui";
import OperatorMapCanvas from "@/components/warehouse/OperatorMapCanvas";
import type { BufferMapCanvasTuning } from "@/components/warehouse/OperatorMapCanvas";
import CcLocationLinesModal from "@/components/outbound/CcLocationLinesModal";
import MasanCcPendingStockConfirmModal from "@/components/outbound/MasanCcPendingStockConfirmModal";
import MasanCcPendingStockViewModal from "@/components/outbound/MasanCcPendingStockViewModal";
import { pendingAllocationsForCcLocationId } from "@/utils/masanPendingStockOverlay";
import { getMasanCcLocationApi } from "@/api/masan";
import type {
  MasanCcLocationResponse,
  MasanSortingZoneCcLocationRow,
} from "@/types/masan";
import { useOperatorDisplayZoneMasanMap } from "@/hooks/useOperatorDisplayZoneMasanMap";
import MonitorZoneLocationSidebar from "@/components/monitor/MonitorZoneLocationSidebar";

type Props = {
  warehouseId: number;
  displayZoneId: number;
  tuning?: BufferMapCanvasTuning;
  className?: string;
  /** Modal chi tiết ô CC / xác nhận lấy — cao hơn khi phóng to fullscreen. */
  modalZIndex?: number;
};

export default function MonitorZoneInteractiveMap({
  warehouseId,
  displayZoneId,
  tuning,
  className,
  modalZIndex,
}: Props) {
  const masan = useOperatorDisplayZoneMasanMap(warehouseId, displayZoneId);

  const ccRequestIdRef = useRef(0);
  const [ccModalOpen, setCcModalOpen] = useState(false);
  const [ccLocationData, setCcLocationData] =
    useState<MasanCcLocationResponse | null>(null);
  const [ccLoading, setCcLoading] = useState(false);
  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(
    null,
  );
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(
    null,
  );
  const [selectedLocationName, setSelectedLocationName] = useState<
    string | null
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
  const [ccPendingViewOpen, setCcPendingViewOpen] = useState(false);
  const [ccPendingViewLocationId, setCcPendingViewLocationId] = useState<
    number | null
  >(null);
  const [ccPendingViewLocationCode, setCcPendingViewLocationCode] = useState<
    string | null
  >(null);
  const [ccPendingViewLocationName, setCcPendingViewLocationName] = useState<
    string | null
  >(null);

  const ccRowToLocationResponse = (
    row: MasanSortingZoneCcLocationRow,
  ): MasanCcLocationResponse => ({
    warehouse_id: warehouseId,
    location_id: row.location_id,
    assigned: row.assigned,
    location_name: row.location_name,
    zone: row.zone,
    vehicle_number: row.vehicle_number,
    lines: row.lines,
  });

  const clearSelection = () => {
    ccRequestIdRef.current += 1;
    setCcModalOpen(false);
    setCcLocationData(null);
    setCcLoading(false);
    setSelectedLocationCode(null);
    setSelectedLocationId(null);
    setSelectedLocationName(null);
    setPendingConfirmOpen(false);
    setPendingConfirmLocationId(null);
    setPendingConfirmLocationCode(null);
    setPendingConfirmLocationName(null);
    setCcPendingViewOpen(false);
    setCcPendingViewLocationId(null);
    setCcPendingViewLocationCode(null);
    setCcPendingViewLocationName(null);
    masan.invalidateMasanCcCaches();
  };

  const openCcLocation = async (
    locationCode: string,
    locationId: number,
    ccLocations?: MasanSortingZoneCcLocationRow[],
  ) => {
    const requestId = ++ccRequestIdRef.current;
    setSelectedLocationCode(locationCode);
    setSelectedLocationId(locationId);
    setSelectedLocationName(masan.resolveLocationName(locationCode, locationId));
    setCcLocationData(null);
    setCcModalOpen(true);

    const locationPool = ccLocations ?? masan.ccLocations ?? [];
    const cachedRow = locationPool.find(
      (row) =>
        row.location_id === locationId || row.location_code === locationCode,
    );
    if (cachedRow) {
      setCcLocationData(ccRowToLocationResponse(cachedRow));
      const cachedName = (cachedRow.location_name ?? "").trim();
      if (cachedName) setSelectedLocationName(cachedName);
    }
    setCcLoading(!cachedRow);

    try {
      const data = await getMasanCcLocationApi(warehouseId, locationId);
      if (requestId === ccRequestIdRef.current) {
        setCcLocationData(data);
        const apiName = (data.location_name ?? "").trim();
        if (apiName) setSelectedLocationName(apiName);
      }
    } catch (err) {
      if (requestId !== ccRequestIdRef.current) return;
      if (!cachedRow) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail ?? "Không tải được hàng đã chia của ô";
        message.error(detail);
      }
    } finally {
      if (requestId === ccRequestIdRef.current) setCcLoading(false);
    }
  };

  const openCcPendingStockView = (
    locationCode: string,
    ccLocationId: number,
  ) => {
    const lines = pendingAllocationsForCcLocationId(
      masan.pendingStock,
      ccLocationId,
      masan.clickableLocationCodeById,
    );
    if (lines.length === 0) {
      message.info("Không có hàng stock_ready tại ô CC này");
      return;
    }
    setCcPendingViewLocationId(ccLocationId);
    setCcPendingViewLocationCode(locationCode);
    setCcPendingViewLocationName(
      masan.resolveLocationName(locationCode, ccLocationId),
    );
    setCcPendingViewOpen(true);
  };

  const openPendingStockConfirm = (
    locationCode: string,
    vtLocationId: number,
  ) => {
    const lines = masan.pendingByToLocationId.get(vtLocationId) ?? [];
    if (lines.length === 0) {
      message.info("Không có hàng chờ xác nhận lấy tại VT này");
      return;
    }
    setSelectedLocationCode(locationCode);
    setSelectedLocationId(vtLocationId);
    setPendingConfirmLocationCode(locationCode);
    setPendingConfirmLocationId(vtLocationId);
    setPendingConfirmLocationName(
      masan.resolveLocationName(locationCode, vtLocationId),
    );
    setPendingConfirmOpen(true);
  };

  const handleCellClick = async (payload: { locationCode: string }) => {
    const freshCc = await masan.refreshMasanMapOverlays();
    const vtId = masan.vtLocationIdByCode.get(payload.locationCode);
    if (vtId != null) {
      message.info("Chọn mã hàng xuất tại màn Đơn xuất");
      return;
    }
    const ccId = masan.clickableLocationIdByCode.get(payload.locationCode);
    if (ccId == null) return;
    await openCcLocation(payload.locationCode, ccId, freshCc);
  };

  const handleCellDoubleClick = async (payload: { locationCode: string }) => {
    await masan.refreshMasanMapOverlays();
    const vtLocationId = masan.vtLocationIdByCode.get(payload.locationCode);
    if (vtLocationId != null) {
      openPendingStockConfirm(payload.locationCode, vtLocationId);
      return;
    }
    const ccLocationId = masan.clickableLocationIdByCode.get(
      payload.locationCode,
    );
    if (ccLocationId != null) {
      openCcPendingStockView(payload.locationCode, ccLocationId);
    }
  };

  const pendingCodes =
    masan.pendingConfirmOverlayCodes.size > 0
      ? masan.pendingConfirmOverlayCodes
      : undefined;

  return (
    <>
      <div className="flex h-full min-h-0 w-full">
        <div className="min-h-0 min-w-0 flex-1">
          <OperatorMapCanvas
            zoneId={masan.mapZoneIds}
            tuning={tuning}
            overlayLabelByCode={masan.overlayLabelByCode}
            locationSubLabelByCode={masan.locationSubLabelByCode}
            pendingConfirmOverlayCodes={pendingCodes}
            interactiveCodes={masan.interactiveCodes}
            onBufferCellClick={masan.masanEnabled ? handleCellClick : undefined}
            onBufferCellDoubleClick={
              masan.masanEnabled ? handleCellDoubleClick : undefined
            }
            className={className}
          />
        </div>
        {masan.masanEnabled ? (
          <MonitorZoneLocationSidebar
            zoneTitle={masan.displayZone?.name ?? "Khu chia chọn"}
            pendingStock={masan.pendingStock}
            pendingStockLoading={masan.pendingStockLoading}
            vtLocationCodeById={masan.vtLocationCodeById}
            ccLocationIdToCode={masan.clickableLocationCodeById}
          />
        ) : null}
      </div>

      {warehouseId > 0 && masan.ccBucketZoneCode ? (
        <>
          <CcLocationLinesModal
            open={ccModalOpen}
            locationCode={selectedLocationCode}
            locationName={selectedLocationName}
            locationId={selectedLocationId}
            warehouseId={warehouseId}
            data={ccLocationData}
            loading={ccLoading}
            onClose={clearSelection}
            zIndex={modalZIndex}
          />
          {ccPendingViewLocationId != null ? (
            <MasanCcPendingStockViewModal
              open={ccPendingViewOpen}
              onClose={clearSelection}
              zIndex={modalZIndex}
              ccLocationCode={ccPendingViewLocationCode}
              ccLocationName={ccPendingViewLocationName}
              lines={pendingAllocationsForCcLocationId(
                masan.pendingStock,
                ccPendingViewLocationId,
                masan.clickableLocationCodeById,
              )}
              vtLocationCodeById={masan.vtLocationCodeById}
            />
          ) : null}
          {pendingConfirmLocationId != null ? (
            <MasanCcPendingStockConfirmModal
              open={pendingConfirmOpen}
              onClose={clearSelection}
              zIndex={modalZIndex}
              warehouseId={warehouseId}
              ccBucketZoneCode={masan.ccBucketZoneCode}
              vtLocationId={pendingConfirmLocationId}
              vtLocationCode={pendingConfirmLocationCode}
              vtLocationName={pendingConfirmLocationName}
              lines={
                masan.pendingByToLocationId.get(pendingConfirmLocationId) ?? []
              }
              onConfirmed={masan.invalidateMasanCcCaches}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
