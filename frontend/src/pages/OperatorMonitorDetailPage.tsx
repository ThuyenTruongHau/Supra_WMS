import { useCallback, useEffect, useState } from "react";
import { ArrowLeftOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, cn, message } from "@/components/ui";
import { useOperatorShell } from "@/components/layout/OperatorShellContext";
import OperatorZoneCrossNavButton from "@/components/outbound/OperatorZoneCrossNavButton";
import MonitorZoneInteractiveMap from "@/components/monitor/MonitorZoneInteractiveMap";
import MasanVtLocationPickerModal from "@/components/outbound/MasanVtLocationPickerModal";
import type { MasanVtLocationPick } from "@/components/outbound/MasanVtLocationPickerModal";
import SortingItemsNeededModal from "@/components/outbound/SortingItemsNeededModal";
import {
  PanelExpandButton,
  PanelFullscreenShell,
} from "@/components/outbound/PanelFullscreen";
import { operatorDesktopClass } from "@/constants/operatorDesktopSizes";
import {
  isOperatorTabletViewport,
  operatorWaveMapTuningForTier,
  operatorZoneActionButtonClass,
  operatorZoneToolbarBackButtonClass,
  operatorZoneToolbarShellClass,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";
import {
  OUTBOUND_DISPLAY_ZONES,
  isOutboundDetailZoneId,
  outboundCcBucketZoneCodeFor,
  outboundVtSortingZoneCodeFor,
} from "@/constants/outboundMapZones";
import { useMasanVtLocations } from "@/hooks/useMasanVtLocations";
import { useMasanVtSortingDispatch } from "@/hooks/useMasanVtSortingDispatch";
import { useAppStore } from "@/store/useAppStore";
import OperatorAssigneeSelect from "@/components/operator/OperatorAssigneeSelect";
import { useOutboundOperatorAssignees } from "@/store/useOperatorAssigneeStore";
import {
  hasOutboundOperatorAssignees,
  OPERATOR_ASSIGNEE_REQUIRED_OUTBOUND,
} from "@/utils/operatorSortingPersons";

const MONITOR_FULLSCREEN_MODAL_Z = 1200;

export default function OperatorMonitorDetailPage() {
  const viewportTier = useOperatorViewportTier();
  const waveMapTuning = operatorWaveMapTuningForTier(viewportTier);
  const { zoneId: zoneIdStr } = useParams<{ zoneId: string }>();
  const zoneId = Number(zoneIdStr);
  const navigate = useNavigate();
  const warehouseId = useAppStore((s) => s.selectedWarehouseId) ?? 0;
  const { usernames: outboundAssignees, setUsernames: setOutboundAssignees } =
    useOutboundOperatorAssignees(zoneId);
  const outboundAssigneeReady = hasOutboundOperatorAssignees(outboundAssignees);
  const { setShellHeaderCollapsed } = useOperatorShell();
  const [contentFullscreen, setContentFullscreen] = useState(false);
  const [vtPickerOpen, setVtPickerOpen] = useState(false);
  const [dispatchVt, setDispatchVt] = useState<MasanVtLocationPick | null>(
    null,
  );
  const [sortingItemsModalOpen, setSortingItemsModalOpen] = useState(false);

  const zoneMeta = OUTBOUND_DISPLAY_ZONES.find((z) => z.id === zoneId);
  const fullscreenTitle = zoneMeta?.name ?? "Giám sát khu vực";
  const ccBucketZoneCode = outboundCcBucketZoneCodeFor(zoneId) ?? "";
  const vtSortingZoneCode = outboundVtSortingZoneCodeFor(zoneId) ?? "";
  const {
    locations: vtLocations,
    vtZoneIds,
    isLoading: vtLocationsLoading,
    failedZoneIds: vtLocationFailedZoneIds,
  } = useMasanVtLocations(zoneId);
  const runVtSortingDispatch = useMasanVtSortingDispatch(zoneId, warehouseId);

  const handleVtPickerSelect = useCallback((pick: MasanVtLocationPick) => {
    setVtPickerOpen(false);
    setDispatchVt(pick);
    setSortingItemsModalOpen(true);
  }, []);

  const closeDispatchFlow = useCallback(() => {
    setSortingItemsModalOpen(false);
    setDispatchVt(null);
  }, []);

  useEffect(() => {
    setShellHeaderCollapsed(true);
    return () => setShellHeaderCollapsed(false);
  }, [setShellHeaderCollapsed]);

  if (Number.isNaN(zoneId) || !isOutboundDetailZoneId(zoneId)) {
    return <Navigate to="/monitor" replace />;
  }

  const renderMonitorBody = (fullscreen: boolean) => (
    <MonitorZoneInteractiveMap
      key={fullscreen ? "monitor-fs" : "monitor-inline"}
      warehouseId={warehouseId}
      displayZoneId={zoneId}
      tuning={waveMapTuning}
      className="!h-full !min-h-0"
      modalZIndex={fullscreen ? MONITOR_FULLSCREEN_MODAL_Z : undefined}
    />
  );

  const zoneActionBtnClass = operatorZoneActionButtonClass(viewportTier);

  const toolbar = (showExpand: boolean) => (
    <header
      className={cn(
        "flex shrink-0 border-b border-stripe-hairline bg-panel px-2",
        operatorZoneToolbarShellClass(viewportTier),
      )}
    >
      <Button
        variant="secondary"
        icon={<ArrowLeftOutlined className="!text-lg" />}
        onClick={() => navigate("/monitor")}
        aria-label="Quay lại"
        title="Quay lại"
        className={operatorZoneToolbarBackButtonClass(viewportTier)}
      />
      <Button
        variant="primary"
        icon={<PlayCircleOutlined />}
        onClick={() => {
          if (!outboundAssigneeReady) {
            message.warning(OPERATOR_ASSIGNEE_REQUIRED_OUTBOUND);
            return;
          }
          setVtPickerOpen(true);
        }}
        disabled={
          warehouseId <= 0 || !ccBucketZoneCode || !outboundAssigneeReady
        }
        title={
          !outboundAssigneeReady
            ? OPERATOR_ASSIGNEE_REQUIRED_OUTBOUND
            : undefined
        }
        className={zoneActionBtnClass}
      >
        Gọi lệnh
      </Button>
      <OperatorAssigneeSelect
        mode="multiple"
        label="Người xuất"
        value={outboundAssignees}
        onChange={(next) =>
          setOutboundAssignees(Array.isArray(next) ? next : [])
        }
        disabled={warehouseId <= 0}
      />
      <OperatorZoneCrossNavButton
        target="export"
        displayZoneId={zoneId}
        className={zoneActionBtnClass}
      />
      {showExpand ? (
        <div className="ml-auto">
          <PanelExpandButton
            onClick={() => setContentFullscreen(true)}
            title="Phóng to toàn màn hình"
            className={
              isOperatorTabletViewport(viewportTier)
                ? "!h-20 !min-h-20 !px-4 !text-lg"
                : "!h-11 !px-3"
            }
          />
        </div>
      ) : null}
    </header>
  );

  return (
    <>
      {!contentFullscreen ? (
        <div
          className={cn(
            "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-panel",
            operatorDesktopClass.mainPadding.replace(/\bp-/g, "-m-"),
          )}
        >
          {toolbar(true)}
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {renderMonitorBody(false)}
          </div>
        </div>
      ) : null}

      <PanelFullscreenShell
        open={contentFullscreen}
        title={fullscreenTitle}
        onClose={() => setContentFullscreen(false)}
        className="bg-panel"
      >
        <div className="flex h-full min-h-0 flex-col">
          {toolbar(false)}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {renderMonitorBody(true)}
          </div>
        </div>
      </PanelFullscreenShell>

      <MasanVtLocationPickerModal
        open={vtPickerOpen}
        onClose={() => setVtPickerOpen(false)}
        title="Gọi lệnh — chọn vị trí VT"
        subtitle={
          ccBucketZoneCode
            ? `Khu CC Masan: ${ccBucketZoneCode}`
            : null
        }
        locations={vtLocations}
        vtZoneIds={vtZoneIds}
        isLoading={vtLocationsLoading}
        failedZoneIds={vtLocationFailedZoneIds}
        onSelect={handleVtPickerSelect}
        zIndex={contentFullscreen ? MONITOR_FULLSCREEN_MODAL_Z : undefined}
      />
      {warehouseId > 0 && ccBucketZoneCode && dispatchVt ? (
        <SortingItemsNeededModal
          open={sortingItemsModalOpen}
          onClose={closeDispatchFlow}
          warehouseId={warehouseId}
          ccBucketZoneCode={ccBucketZoneCode}
          sortingZoneCode={vtSortingZoneCode}
          title={`Chọn mã hàng — ${dispatchVt.locationName}`}
          subtitle={`Vị trí VT: ${dispatchVt.locationName}`}
          zIndex={contentFullscreen ? MONITOR_FULLSCREEN_MODAL_Z : undefined}
          vtLocationId={dispatchVt.locationId}
          onConfirmExport={async (picked) => {
            await runVtSortingDispatch(picked, dispatchVt.locationId);
          }}
        />
      ) : null}
    </>
  );
}
