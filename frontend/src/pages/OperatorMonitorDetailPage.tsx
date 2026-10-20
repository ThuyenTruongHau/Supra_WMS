import { useEffect, useState } from "react";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, cn } from "@/components/ui";
import { useOperatorShell } from "@/components/layout/OperatorShellContext";
import OperatorZoneCrossNavButton from "@/components/outbound/OperatorZoneCrossNavButton";
import MonitorZoneInteractiveMap from "@/components/monitor/MonitorZoneInteractiveMap";
import {
  PanelExpandButton,
  PanelFullscreenShell,
} from "@/components/outbound/PanelFullscreen";
import {
  OPERATOR_WAVE_MAP_TUNING,
  operatorDesktopClass,
} from "@/constants/operatorDesktopSizes";
import {
  OUTBOUND_DISPLAY_ZONES,
  isOutboundDetailZoneId,
} from "@/constants/outboundMapZones";
import { useAppStore } from "@/store/useAppStore";

const MONITOR_FULLSCREEN_MODAL_Z = 1200;

export default function OperatorMonitorDetailPage() {
  const { zoneId: zoneIdStr } = useParams<{ zoneId: string }>();
  const zoneId = Number(zoneIdStr);
  const navigate = useNavigate();
  const warehouseId = useAppStore((s) => s.selectedWarehouseId) ?? 0;
  const { setShellHeaderCollapsed } = useOperatorShell();
  const [contentFullscreen, setContentFullscreen] = useState(false);

  const zoneMeta = OUTBOUND_DISPLAY_ZONES.find((z) => z.id === zoneId);
  const fullscreenTitle = zoneMeta?.name ?? "Giám sát khu vực";

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
      tuning={OPERATOR_WAVE_MAP_TUNING}
      className="!h-full !min-h-0"
      modalZIndex={fullscreen ? MONITOR_FULLSCREEN_MODAL_Z : undefined}
    />
  );

  const toolbar = (showExpand: boolean) => (
    <header
      className={cn(
        "flex shrink-0 items-center gap-2 border-b border-stripe-hairline bg-panel px-2",
        operatorDesktopClass.controlHeight,
      )}
    >
      <Button
        variant="secondary"
        icon={<ArrowLeftOutlined className="!text-lg" />}
        onClick={() => navigate("/monitor")}
        aria-label="Quay lại"
        title="Quay lại"
        className={cn(
          operatorDesktopClass.controlSizeSquare,
          "!flex !items-center !justify-center !rounded-lg !p-0 [&_.ant-btn-icon]:!m-0",
        )}
      />
      <OperatorZoneCrossNavButton target="export" displayZoneId={zoneId} />
      {showExpand ? (
        <div className="ml-auto">
          <PanelExpandButton
            onClick={() => setContentFullscreen(true)}
            title="Phóng to toàn màn hình"
            className="!h-11 !px-3"
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
            "flex min-h-0 flex-1 flex-col overflow-hidden bg-panel",
            operatorDesktopClass.mainPadding.replace(/\bp-/g, "-m-"),
          )}
        >
          {toolbar(true)}
          <div className="relative min-h-0 flex-1 overflow-hidden">
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
    </>
  );
}
