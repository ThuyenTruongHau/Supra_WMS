import React from "react";
import { cn } from "@/components/ui";
import OperatorMapCanvas from "@/components/warehouse/OperatorMapCanvas";
import {
  OPERATOR_WAVE_MAP_TUNING,
  operatorDesktopClass,
} from "@/constants/operatorDesktopSizes";
import {
  OUTBOUND_DISPLAY_ZONES,
  type OutboundDisplayZone,
} from "@/constants/outboundMapZones";
import { useOperatorDisplayZoneMasanMap } from "@/hooks/useOperatorDisplayZoneMasanMap";

type MonitorZoneCellProps = {
  displayZone: OutboundDisplayZone;
  warehouseId: number;
  onOpen: () => void;
};

function MonitorZoneCell({
  displayZone,
  warehouseId,
  onOpen,
}: MonitorZoneCellProps) {
  const masan = useOperatorDisplayZoneMasanMap(warehouseId, displayZone.id);
  const pendingCodes =
    masan.pendingConfirmOverlayCodes.size > 0
      ? masan.pendingConfirmOverlayCodes
      : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Mở giám sát ${displayZone.name}`}
      aria-label={`Mở giám sát ${displayZone.name}`}
      className="group flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel text-left shadow-stripe-1 transition hover:border-brand-primary/40 hover:shadow-[0_8px_28px_rgba(37,99,235,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
    >
      <div className="shrink-0 border-b border-stripe-hairline bg-panel-soft px-4 py-2">
        <p className="truncate text-2xl font-extrabold text-brand-dark">
          {displayZone.name}
        </p>
      </div>
      <div
        className={cn(
          "relative min-h-0 flex-1 bg-industrial-pattern p-2",
          operatorDesktopClass.boardFill,
        )}
      >
        <div className="relative h-full min-h-0 overflow-hidden rounded-lg bg-panel">
          <OperatorMapCanvas
            zoneId={displayZone.zoneIds}
            tuning={OPERATOR_WAVE_MAP_TUNING}
            overlayLabelByCode={masan.overlayLabelByCode}
            locationSubLabelByCode={masan.locationSubLabelByCode}
            pendingConfirmOverlayCodes={pendingCodes}
            className="pointer-events-none !h-full !min-h-0"
          />
        </div>
      </div>
    </button>
  );
}

type MonitorZoneOverviewPickerProps = {
  warehouseId: number;
  onSelectZone: (zoneId: number) => void;
  className?: string;
};

const DISPLAY_ZONES: OutboundDisplayZone[] = OUTBOUND_DISPLAY_ZONES;

export default React.memo(function MonitorZoneOverviewPicker({
  warehouseId,
  onSelectZone,
  className,
}: MonitorZoneOverviewPickerProps) {
  return (
    <div
      className={cn(
        "grid min-h-0 flex-1 grid-cols-1 gap-2 @min-[1024px]:grid-cols-2 @min-[1024px]:gap-3",
        className,
      )}
    >
      {DISPLAY_ZONES.length > 0 ? (
        DISPLAY_ZONES.map((z) => (
          <MonitorZoneCell
            key={z.id}
            displayZone={z}
            warehouseId={warehouseId}
            onOpen={() => onSelectZone(z.id)}
          />
        ))
      ) : (
        <div className="col-span-full flex items-center justify-center text-slate-500">
          Không có khu vực giám sát
        </div>
      )}
    </div>
  );
});
