import React from "react";
import { cn } from "@/components/ui";
import OperatorMapCanvas from "@/components/warehouse/OperatorMapCanvas";
import { operatorDesktopClass } from "@/constants/operatorDesktopSizes";
import {
  operatorWaveMapTuningForTier,
  operatorZoneOverviewPickRowClass,
  useOperatorViewportTier,
  type OperatorViewportTier,
} from "@/utils/operatorViewportTier";
import {
  OUTBOUND_DISPLAY_ZONES,
  type OutboundDisplayZone,
} from "@/constants/outboundMapZones";
import { useOperatorDisplayZoneMasanMap } from "@/hooks/useOperatorDisplayZoneMasanMap";

type MonitorZoneCellProps = {
  displayZone: OutboundDisplayZone;
  warehouseId: number;
  onOpen: () => void;
  waveMapTuning: ReturnType<typeof operatorWaveMapTuningForTier>;
  viewportTier: OperatorViewportTier;
};

function MonitorZoneCell({
  displayZone,
  warehouseId,
  onOpen,
  waveMapTuning,
  viewportTier,
}: MonitorZoneCellProps) {
  const masan = useOperatorDisplayZoneMasanMap(warehouseId, displayZone.id);

  return (
    <div className="group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel text-left shadow-stripe-1 transition hover:border-brand-primary/40 hover:shadow-[0_8px_28px_rgba(37,99,235,0.12)]">
      <button
        type="button"
        onClick={onOpen}
        title={`Mở giám sát ${displayZone.name}`}
        aria-label={`Mở giám sát ${displayZone.name}`}
        className={cn(
          "flex w-full shrink-0 items-center border-b border-stripe-hairline bg-panel-soft px-4 py-2.5 text-left transition hover:bg-sky-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
          operatorZoneOverviewPickRowClass(viewportTier),
        )}
      >
        <p className="truncate text-3xl font-extrabold text-brand-dark">
          {displayZone.name}
        </p>
      </button>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "relative min-h-0 flex-1 cursor-pointer bg-industrial-pattern p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary/40",
          operatorDesktopClass.boardFill,
        )}
        title={`Mở giám sát ${displayZone.name}`}
        aria-label={`Mở bản đồ giám sát ${displayZone.name}`}
      >
        <div className="relative h-full min-h-0 overflow-hidden rounded-lg bg-panel">
          <OperatorMapCanvas
            zoneId={[...displayZone.zoneIds]}
            tuning={waveMapTuning}
            overlayLabelByCode={masan.overlayLabelByCode}
            locationSubLabelByCode={masan.locationSubLabelByCode}
            className="pointer-events-none !h-full !min-h-0"
          />
        </div>
      </button>
    </div>
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
  const tier = useOperatorViewportTier();
  const waveMapTuning = operatorWaveMapTuningForTier(tier);

  return (
    <div
      className={cn(
        "operator-monitor-overview-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel shadow-stripe-1",
        className,
      )}
    >
      <div className="shrink-0 border-b border-stripe-hairline px-4 py-2.5">
        <h3 className="text-4xl font-black text-brand-dark">
          Giám sát khu chia chọn
        </h3>
        <p className="mt-1 text-base text-stripe-ink-mute">
          Nhấp một khu để mở bản đồ giám sát chi tiết
        </p>
      </div>
      <div className="operator-monitor-overview-grid grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 @min-[1024px]:grid-cols-2 @min-[1024px]:gap-3 @min-[1024px]:p-3">
        {DISPLAY_ZONES.length > 0 ? (
          DISPLAY_ZONES.map((z) => (
            <MonitorZoneCell
              key={z.id}
              displayZone={z}
              warehouseId={warehouseId}
              waveMapTuning={waveMapTuning}
              viewportTier={tier}
              onOpen={() => onSelectZone(z.id)}
            />
          ))
        ) : (
          <div className="col-span-full flex items-center justify-center text-slate-500">
            Không có khu vực giám sát
          </div>
        )}
      </div>
    </div>
  );
});
