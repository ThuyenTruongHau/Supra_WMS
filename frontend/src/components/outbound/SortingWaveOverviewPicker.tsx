/**
 * Màn chọn vị trí chia chọn — 2 map song song, double-click để vào chi tiết.
 */
import { PartitionOutlined } from "@ant-design/icons";
import { cn } from "@/components/ui";
import { operatorDesktopClass } from "@/constants/operatorDesktopSizes";
import type { SortingWave } from "@/types/sortingWave";
import OutboundSortingMapCanvas from "@/components/outbound/OutboundSortingMapCanvas";
import { OPERATOR_WAVE_MAP_TUNING } from "@/constants/operatorDesktopSizes";
import { WAVE_STATION_LOCATION_TYPES } from "@/api/warehouseMap";
import { useSortingWaveMapContext } from "@/hooks/useSortingWaveMapContext";

type SortingWaveOverviewCellProps = {
  zoneId: number;
  wave: SortingWave;
  onActivate: () => void;
};

function SortingWaveOverviewCell({
  zoneId,
  wave,
  onActivate,
}: SortingWaveOverviewCellProps) {
  const { waveStationIds, stationOverlayLabels, feSimulation } =
    useSortingWaveMapContext(zoneId, wave);

  const stationCount =
    (wave.sorting_stations?.length ?? 0) +
    (wave.outbound_stations?.length ?? 0);

  return (
    <button
      type="button"
      title={`Nhấp đúp để mở ${wave.name}`}
      aria-label={`Nhấp đúp để mở vị trí chia chọn ${wave.name}`}
      onDoubleClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter") onActivate();
      }}
      className="group relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel text-left shadow-stripe-1 transition hover:border-brand-primary/35 hover:shadow-[0_8px_28px_rgba(37,99,235,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stripe-hairline bg-panel-soft px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <PartitionOutlined className="shrink-0 text-base text-brand-primary" />
          <div className="min-w-0">
            <p className="truncate text-3xl font-extrabold text-brand-dark">
              {wave.name}
            </p>

          </div>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-700 opacity-0 transition group-hover:opacity-100">
          Nhấp đúp để mở
        </span>
      </div>
      <div
        className={cn(
          "relative min-h-0 flex-1 bg-industrial-pattern p-3",
          operatorDesktopClass.boardFill,
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.06),transparent_55%)]" />
        <div className="relative h-full min-h-0 overflow-hidden rounded-lg bg-panel">
          {zoneId > 0 ? (
            <OutboundSortingMapCanvas
              key={`overview-${wave.id}-${waveStationIds.join(",")}`}
              zoneId={zoneId}
              locationType={WAVE_STATION_LOCATION_TYPES}
              locationIds={waveStationIds}
              tuning={OPERATOR_WAVE_MAP_TUNING}
              overlayLabelByCode={stationOverlayLabels}
              statusOverrideByCode={feSimulation?.statusOverrideByCode}
              className="pointer-events-none !h-full !min-h-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">
              Chọn kho để xem bản đồ
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

type SortingWaveOverviewPickerProps = {
  zoneId: number;
  waves: SortingWave[];
  loading?: boolean;
  onSelectWave: (waveId: number) => void;
  className?: string;
};

export default function SortingWaveOverviewPicker({
  zoneId,
  waves,
  loading = false,
  onSelectWave,
  className,
}: SortingWaveOverviewPickerProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center rounded-xl border border-stripe-hairline bg-panel text-sm text-slate-500 shadow-stripe-1",
          className,
        )}
      >
        Đang tải vị trí chia chọn...
      </div>
    );
  }

  if (waves.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center rounded-xl border border-stripe-hairline bg-panel p-8 text-center shadow-stripe-1",
          className,
        )}
      >
        <p className="text-sm text-slate-500">
          Chưa có vị trí chia chọn trong kho này. Liên hệ admin cấu hình tại{" "}
          <span className="font-semibold text-brand-dark">Quản lý chia chọn</span>
          .
        </p>
      </div>
    );
  }

  const displayWaves = waves.slice(0, 2);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel shadow-stripe-1",
        className,
      )}
    >
      <div className="shrink-0 border-b border-stripe-hairline px-4 py-2.5">
        <h3 className="text-4xl font-black text-brand-dark">
          Chọn vị trí chia chọn
        </h3>
        <p className="mt-1 text-base text-stripe-ink-mute">
          Nhấp đúp vào khu vực để mở bản đồ chi tiết và danh sách xe
        </p>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-2 lg:gap-3 lg:p-3">
        {displayWaves.map((wave) => (
          <SortingWaveOverviewCell
            key={wave.id}
            zoneId={zoneId}
            wave={wave}
            onActivate={() => onSelectWave(wave.id)}
          />
        ))}
      </div>
    </div>
  );
}
