/**
 * Layout dùng chung: tab sorting wave + bản đồ Breaking Pallet.
 * Dùng ở OperatorOutboundPage và OperatorSortingWavePage (user).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftOutlined, PartitionOutlined } from "@ant-design/icons";
import { Button, cn, message } from "@/components/ui";
import { operatorDesktopClass } from "@/constants/operatorDesktopSizes";
import { useSortingWaves } from "@/hooks/useSortingWave";
import {
  useIncompleteVehicles,
  useSortingStationFills,
} from "@/hooks/useOutbound";
import { getSortingStationAssignmentApi } from "@/api/outbound";
import type { SortingStationAssignment } from "@/types/outbound";
import type { SortingWave } from "@/types/sortingWave";
import AssignSortingStationModal from "@/components/outbound/AssignSortingStationModal";
import AssignOutboundStationModal from "@/components/outbound/AssignOutboundStationModal";
import SortingStationPickConfirmModal from "@/components/outbound/SortingStationPickConfirmModal";
import UnassignSortingStationModal from "@/components/outbound/UnassignSortingStationModal";
import { useLocationByCodeMap } from "@/hooks/useWarehouseLocation";
import OutboundSortingMapCanvas from "@/components/outbound/OutboundSortingMapCanvas";
import { type BufferMapCanvasTuning } from "@/components/inbound/InboundBufferMapCanvas";
import { OPERATOR_WAVE_MAP_TUNING } from "@/constants/operatorDesktopSizes";
import { WAVE_STATION_LOCATION_TYPES } from "@/api/warehouseMap";
import {
  buildStationOverlayLabels,
  enrichAssignmentLabels,
  ensureSortingStationLabels,
  mergeStationOverlayLabels,
} from "@/utils/sortingStationOverlay";
import {
  applyConfirmedPicksToOverlayLabels,
  EMPTY_STATION_PICK_CONFIRM,
  STATION_PICK_TOTAL_KEY,
  type StationPickConfirm,
} from "@/utils/sortingStationPickRows";
import {
  OUTBOUND_STATION_FE_SIM_ENABLED,
  buildOutboundStationFeSimulation,
  mergeWithOutboundStationFeSimulation,
} from "@/utils/outboundStationFeSimulation";
import {
  PanelExpandButton,
  PanelFullscreenShell,
} from "@/components/outbound/PanelFullscreen";

export function LiveBadge({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="iot-status iot-status--online inline-flex items-center gap-1.5 rounded-full border border-stripe-success/30 bg-stripe-success/10 px-2 py-0.5">
      <span className="iot-status__led" aria-hidden />
      <span className="iot-status__label !text-xs">{label}</span>
    </span>
  );
}

export type SortingWaveStationBoardProps = {
  zoneId: number;
  fillHeight?: boolean;
  className?: string;
  sideSlot?: ReactNode;
  selectedWaveId?: number | null;
  onSelectedWaveIdChange?: (waveId: number | null) => void;
  emptyHint?: ReactNode;
  /** Chỉ bật trên trang Màn hình chia chọn */
  showMapFullscreen?: boolean;
  /** Tuning canvas map — mặc định giữ layout thật từ map fetch (không lưới ảo). */
  mapTuning?: BufferMapCanvasTuning;
  /** Thanh công cụ phía trên bản đồ (import/export, tiêu đề...). */
  mapToolbar?: ReactNode;
  /** Tiêu đề hiển thị bên trái toolbar (cùng hàng với nút back). */
  mapToolbarTitle?: ReactNode;
  /** Ẩn tab chọn wave — dùng khi đã chọn vị trí từ overview. */
  hideWaveTabs?: boolean;
  /** Nút quay lại màn chọn vị trí chia chọn. */
  onBack?: () => void;
  /** Gộp mọi điểm chia chọn trong zone — không phân theo wave cụ thể. */
  unifyAllWaves?: boolean;
};

const EMPTY_SORTING_WAVES: SortingWave[] = [];

export default function SortingWaveStationBoard({
  zoneId,
  fillHeight = false,
  className,
  sideSlot,
  selectedWaveId: controlledWaveId,
  onSelectedWaveIdChange,
  emptyHint,
  showMapFullscreen = false,
  mapTuning = OPERATOR_WAVE_MAP_TUNING,
  mapToolbar,
  mapToolbarTitle,
  hideWaveTabs = false,
  onBack,
  unifyAllWaves = false,
}: SortingWaveStationBoardProps) {
  const { data: sortingWavesData, isLoading: wavesLoading } =
    useSortingWaves(zoneId);
  const sortingWaves = sortingWavesData ?? EMPTY_SORTING_WAVES;
  const waveIdsKey = useMemo(
    () => sortingWaves.map((wave) => wave.id).join(","),
    [sortingWaves],
  );
  const [internalWaveId, setInternalWaveId] = useState<number | null>(null);
  const isControlled = controlledWaveId !== undefined;
  const selectedWaveId = isControlled ? controlledWaveId : internalWaveId;
  const onSelectedWaveIdChangeRef = useRef(onSelectedWaveIdChange);

  useEffect(() => {
    onSelectedWaveIdChangeRef.current = onSelectedWaveIdChange;
  }, [onSelectedWaveIdChange]);

  useEffect(() => {
    if (sortingWaves.length === 0) {
      if (selectedWaveId != null) {
        if (!isControlled) setInternalWaveId(null);
        onSelectedWaveIdChangeRef.current?.(null);
      }
      return;
    }
    const stillValid =
      selectedWaveId != null &&
      sortingWaves.some((w) => w.id === selectedWaveId);
    if (!stillValid) {
      const nextId = sortingWaves[0].id;
      if (!isControlled) setInternalWaveId(nextId);
      onSelectedWaveIdChangeRef.current?.(nextId);
    }
  }, [waveIdsKey, selectedWaveId, isControlled, sortingWaves]);

  const setSelectedWaveId = (id: number | null) => {
    if (!isControlled) setInternalWaveId(id);
    onSelectedWaveIdChange?.(id);
  };

  const selectedWave: SortingWave | null = useMemo(
    () => sortingWaves.find((w) => w.id === selectedWaveId) ?? null,
    [sortingWaves, selectedWaveId],
  );

  const sortingStationIds = useMemo(() => {
    if (unifyAllWaves) {
      return [
        ...new Set(
          sortingWaves.flatMap((wave) => wave.sorting_stations ?? []),
        ),
      ];
    }
    return selectedWave?.sorting_stations ?? [];
  }, [selectedWave, sortingWaves, unifyAllWaves]);
  const outboundStationIds = useMemo(() => {
    if (unifyAllWaves) {
      return [
        ...new Set(
          sortingWaves.flatMap((wave) => wave.outbound_stations ?? []),
        ),
      ];
    }
    return selectedWave?.outbound_stations ?? [];
  }, [selectedWave, sortingWaves, unifyAllWaves]);
  const waveStationIds = useMemo(() => {
    const merged = [...sortingStationIds, ...outboundStationIds];
    return [...new Set(merged)];
  }, [sortingStationIds, outboundStationIds]);
  const sortingStationIdSet = useMemo(
    () => new Set(sortingStationIds),
    [sortingStationIds],
  );
  const outboundStationIdSet = useMemo(
    () => new Set(outboundStationIds),
    [outboundStationIds],
  );

  const { data: incompleteVehiclesData } = useIncompleteVehicles(zoneId);
  const incompleteVehicles = incompleteVehiclesData?.vehicles ?? [];
  const { locationByCode } = useLocationByCodeMap(zoneId);
  const { data: sortingFillsData } = useSortingStationFills(
    zoneId,
    selectedWaveId,
  );
  const fillStations = sortingFillsData?.stations ?? [];

  const feSimulation = useMemo(() => {
    if (!OUTBOUND_STATION_FE_SIM_ENABLED || zoneId <= 0) return null;
    return buildOutboundStationFeSimulation({
      locationByCode,
      outboundStationIds,
      sortingStationIds,
      incompleteVehicles,
    });
  }, [
    zoneId,
    locationByCode,
    outboundStationIds,
    sortingStationIds,
    incompleteVehicles,
  ]);

  const mergedFillStations = useMemo(() => {
    if (!feSimulation) return fillStations;
    const byCode = new Map(
      fillStations.map((station) => [station.location_code, station]),
    );
    for (const simStation of feSimulation.fillStations) {
      byCode.set(simStation.location_code, simStation);
    }
    return [...byCode.values()];
  }, [fillStations, feSimulation]);

  const [confirmedPicksByStation, setConfirmedPicksByStation] = useState<
    Record<string, StationPickConfirm>
  >({});

  const sortingStationCodes = useMemo(
    () =>
      sortingStationIds
        .map((id) => {
          const loc = Object.values(locationByCode).find(
            (item) => item.id === id,
          );
          return (loc?.location_code || "").trim();
        })
        .filter(Boolean),
    [sortingStationIds, locationByCode],
  );

  const stationOverlayLabels = useMemo(() => {
    const base = mergeStationOverlayLabels(
      {
        ...buildStationOverlayLabels(incompleteVehicles, locationByCode),
        ...enrichAssignmentLabels(
          sortingFillsData?.assignment_labels,
          locationByCode,
        ),
      },
      mergedFillStations,
      locationByCode,
    );
    const withSimulation = mergeWithOutboundStationFeSimulation(
      base,
      feSimulation,
    );
    const withSortingFallback = ensureSortingStationLabels(
      withSimulation,
      sortingStationCodes,
      locationByCode,
    );
    return applyConfirmedPicksToOverlayLabels(
      withSortingFallback,
      mergedFillStations,
      confirmedPicksByStation,
      locationByCode,
    );
  }, [
    incompleteVehicles,
    mergedFillStations,
    sortingFillsData?.assignment_labels,
    feSimulation,
    confirmedPicksByStation,
    locationByCode,
    sortingStationCodes,
  ]);

  const [assignSortingModalOpen, setAssignSortingModalOpen] = useState(false);
  const [assignOutboundModalOpen, setAssignOutboundModalOpen] = useState(false);
  const [pickConfirmModalOpen, setPickConfirmModalOpen] = useState(false);
  const [unassignModalOpen, setUnassignModalOpen] = useState(false);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [stationAssignment, setStationAssignment] =
    useState<SortingStationAssignment | null>(null);
  const [selectedStationCode, setSelectedStationCode] = useState<string | null>(
    null,
  );
  const [selectedStationLocationId, setSelectedStationLocationId] = useState<
    number | null
  >(null);
  const [selectedStationKind, setSelectedStationKind] = useState<
    "sorting" | "outbound" | null
  >(null);

  const resolveStationKind = (
    locationId: number,
    locationType?: string | null,
  ): "sorting" | "outbound" => {
    const type = (locationType || "").trim();
    // Ưu tiên location_type — tránh mở sai modal khi ID nằm cả hai tập
    if (type === "outbound_station") return "outbound";
    if (
      type === "sorting_station" ||
      type === "breaking_pallet" ||
      type === "sorting"
    ) {
      return "sorting";
    }
    if (outboundStationIdSet.has(locationId)) return "outbound";
    if (sortingStationIdSet.has(locationId)) return "sorting";
    return "sorting";
  };

  const handleStationCellClick = async (payload: { locationCode: string }) => {
    const location = locationByCode[payload.locationCode];
    if (!location) {
      message.error(
        `Không tìm thấy warehouse location cho mã ${payload.locationCode}`,
      );
      return;
    }

    const kind = resolveStationKind(location.id, location.location_type);
    setSelectedStationCode(payload.locationCode);
    setSelectedStationLocationId(location.id);
    setSelectedStationKind(kind);

    if (kind === "outbound") {
      setAssignSortingModalOpen(false);
      setUnassignModalOpen(false);
      setStationAssignment(null);
      setAssignOutboundModalOpen(true);
      return;
    }

    setAssignOutboundModalOpen(false);

    try {
      const assignment = await getSortingStationAssignmentApi({
        zoneId,
        locationCode: payload.locationCode,
        locationId: location.id,
      });
      if (assignment.is_assigned || assignment.has_fill) {
        setStationAssignment(assignment);
        setPickConfirmModalOpen(true);
        setUnassignModalOpen(false);
        setAssignSortingModalOpen(false);
        return;
      }
      setStationAssignment(null);
      setUnassignModalOpen(false);
      setAssignSortingModalOpen(true);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Không kiểm tra được trạng thái gán ô";
      message.error(detail);
    }
  };

  const clearStationSelection = () => {
    setAssignSortingModalOpen(false);
    setAssignOutboundModalOpen(false);
    setPickConfirmModalOpen(false);
    setUnassignModalOpen(false);
    setStationAssignment(null);
    setSelectedStationCode(null);
    setSelectedStationLocationId(null);
    setSelectedStationKind(null);
  };

  const selectedFillStation = useMemo(
    () =>
      selectedStationCode
        ? (mergedFillStations.find(
            (station) => station.location_code === selectedStationCode,
          ) ?? null)
        : null,
    [mergedFillStations, selectedStationCode],
  );

  const selectedPreviousPicks = useMemo(
    () =>
      selectedStationCode
        ? (confirmedPicksByStation[selectedStationCode] ??
          EMPTY_STATION_PICK_CONFIRM)
        : EMPTY_STATION_PICK_CONFIRM,
    [confirmedPicksByStation, selectedStationCode],
  );

  const handlePickConfirm = (
    locationCode: string,
    picks: StationPickConfirm,
  ) => {
    setConfirmedPicksByStation((prev) => {
      const prevPicks = prev[locationCode] ?? {};
      const merged: StationPickConfirm = { ...prevPicks };
      const qty =
        picks[STATION_PICK_TOTAL_KEY] ??
        Object.values(picks).reduce((sum, value) => sum + value, 0);
      if (qty > 0) {
        merged[STATION_PICK_TOTAL_KEY] =
          (merged[STATION_PICK_TOTAL_KEY] ?? 0) + qty;
      }
      return {
        ...prev,
        [locationCode]: merged,
      };
    });
  };

  const renderMapBody = (fullscreen: boolean) => (
    <div
      className={cn(
        "relative bg-industrial-pattern",
        fullscreen
          ? "min-h-0 flex-1 p-0"
          : fillHeight
            ? `flex ${operatorDesktopClass.boardFill} flex-col p-3 sm:p-4`
            : `${operatorDesktopClass.boardHeight} p-3 sm:p-4`,
      )}
    >
      {!fullscreen ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(14,165,233,0.06),transparent_55%)]" />
      ) : null}
      {!fullscreen && showMapFullscreen && !mapFullscreen ? (
        <div className="pointer-events-auto absolute right-3 top-3 z-30">
          <PanelExpandButton
            onClick={() => setMapFullscreen(true)}
            title="Phóng to khu vực chia lẻ"
          />
        </div>
      ) : null}
      <div
        className={cn(
          "relative h-full min-h-0 overflow-hidden bg-panel",
          !fullscreen && "rounded-lg",
        )}
      >
        {zoneId > 0 ? (
          <OutboundSortingMapCanvas
            key={`wave-${fullscreen ? "fs" : "n"}-${selectedWaveId ?? "none"}-${waveStationIds.join(",")}`}
            zoneId={zoneId}
            locationType={WAVE_STATION_LOCATION_TYPES}
            locationIds={waveStationIds}
            tuning={mapTuning}
            selectedLocationCode={selectedStationCode}
            overlayLabelByCode={stationOverlayLabels}
            statusOverrideByCode={feSimulation?.statusOverrideByCode}
            onBufferCellClick={handleStationCellClick}
            className={cn(
              "!h-full",
              fullscreen ? "!min-h-0" : operatorDesktopClass.mapMinHeight,
            )}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Chọn kho để xem bản đồ chia chọn
          </div>
        )}
      </div>
    </div>
  );

  const mapPanel = (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-panel",
        sideSlot ? "xl:col-span-3" : "flex-1",
        fillHeight ? "min-h-0 flex-1" : "",
      )}
    >
      {mapToolbar || mapToolbarTitle || onBack || (hideWaveTabs && selectedWave) ? (
        <div className="flex shrink-0 flex-col gap-3 border-b border-stripe-hairline px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {onBack ? (
              <Button
                variant="secondary"
                icon={<ArrowLeftOutlined />}
                onClick={onBack}
                className="!h-9 shrink-0 !px-2.5 !text-sm"
              >
                Chọn vị trí
              </Button>
            ) : null}
            {mapToolbarTitle ? (
              <div className="min-w-0">{mapToolbarTitle}</div>
            ) : hideWaveTabs && selectedWave ? (
              <div className="flex min-w-0 items-center gap-2">
                <PartitionOutlined className="shrink-0 text-brand-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-brand-dark">
                    {selectedWave.name}
                  </p>
                  <p className="text-xs text-slate-500">Wave #{selectedWave.id}</p>
                </div>
              </div>
            ) : null}
          </div>
          {mapToolbar ? (
            <div className="flex min-w-0 w-full items-center gap-2">
              {mapToolbar}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {renderMapBody(false)}
      </div>
    </div>
  );

  const waveTabs = (
    <div className="flex shrink-0 flex-nowrap items-stretch justify-between gap-0 overflow-hidden border-b border-stripe-hairline bg-panel-soft">
      <div className="flex min-w-0 flex-1 items-stretch gap-0 overflow-x-auto overflow-y-hidden">
        {wavesLoading && (
          <div className="flex min-h-12 items-center px-5 text-sm text-slate-500">
            Đang tải vị trí chia chọn...
          </div>
        )}
        {!wavesLoading && sortingWaves.length === 0 && (
          <div className="flex min-h-12 items-center px-5 text-sm text-slate-500">
            Chưa có vị trí chia chọn trong kho này.
          </div>
        )}
        {!wavesLoading &&
          sortingWaves.map((wave) => {
            const isActive = wave.id === selectedWaveId;
            const stationCount =
              (wave.outbound_stations?.length ?? 0) +
              (wave.sorting_stations?.length ?? 0);
            return (
              <button
                key={wave.id}
                type="button"
                onClick={() => setSelectedWaveId(wave.id)}
                className={cn(
                  "relative flex min-h-12 min-w-[180px] items-center gap-2 px-5 py-3.5 text-sm font-semibold transition-all",
                  isActive
                    ? "z-10 -mb-px border border-stripe-hairline border-b-white bg-white text-brand-dark shadow-[0_1px_0_0_#fff]"
                    : "mb-0 border border-transparent bg-transparent text-stripe-ink-mute hover:bg-white/40 hover:text-brand-dark",
                )}
              >
                <PartitionOutlined
                  className={cn(
                    "text-base",
                    isActive ? "text-brand-primary" : "text-stripe-ink-mute",
                  )}
                />
                <span className="truncate">{wave.name}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                    isActive
                      ? "bg-brand-primary/15 text-brand-primary"
                      : "bg-white/80 text-stripe-ink-mute",
                  )}
                >
                  {stationCount}
                </span>
              </button>
            );
          })}
      </div>
      {selectedWave && (
        <div className="hidden shrink-0 items-center gap-3 border-l border-stripe-hairline px-4 py-2 sm:flex">
          <span className="text-xs font-semibold text-slate-500">
            Wave #{selectedWave.id}
          </span>
          <span className="text-xs text-slate-500">
            OUT {selectedWave.outbound_stations?.length ?? 0} · SORT{" "}
            {selectedWave.sorting_stations?.length ?? 0}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel shadow-stripe-1",
        fillHeight && "min-h-0 flex-1",
        className,
      )}
    >
      {hideWaveTabs ? null : waveTabs}

      {!wavesLoading && sortingWaves.length === 0 ? (
        <div className="p-8 text-center">
          {emptyHint ?? (
            <p className="text-sm text-slate-500">
              Không có board chia chọn để hiển thị. Thêm wave để cấu hình
              stations.
            </p>
          )}
        </div>
      ) : (
        <div
          key={selectedWaveId ?? "none"}
          className={cn(
            sideSlot
              ? "grid min-h-0 flex-1 grid-cols-1 items-stretch xl:grid-cols-5"
              : "flex min-h-0 flex-1 flex-col",
            fillHeight && "min-h-0 flex-1",
          )}
        >
          {mapPanel}
          {sideSlot ? (
            <div className="flex min-h-0 flex-col overflow-hidden border-t border-stripe-hairline xl:col-span-2 xl:border-l xl:border-t-0">
              {sideSlot}
            </div>
          ) : null}
        </div>
      )}

      {showMapFullscreen ? (
        <PanelFullscreenShell
          open={mapFullscreen}
          title="Khu vực chờ chia lẻ"
          onClose={() => setMapFullscreen(false)}
        >
          <div className="flex h-full min-h-0 flex-col bg-industrial-pattern">
            {renderMapBody(true)}
          </div>
        </PanelFullscreenShell>
      ) : null}

      {selectedStationCode && selectedStationKind === "sorting" ? (
        <AssignSortingStationModal
          open={assignSortingModalOpen}
          zoneId={zoneId}
          locationCode={selectedStationCode}
          locationId={selectedStationLocationId}
          onClose={clearStationSelection}
          zIndex={mapFullscreen ? 1200 : undefined}
        />
      ) : null}

      {selectedStationCode && selectedStationKind === "outbound" ? (
        <AssignOutboundStationModal
          open={assignOutboundModalOpen}
          zoneId={zoneId}
          sortingWaveId={selectedWaveId ?? 0}
          locationCode={selectedStationCode}
          locationId={selectedStationLocationId}
          onClose={clearStationSelection}
          zIndex={mapFullscreen ? 1200 : undefined}
        />
      ) : null}

      <SortingStationPickConfirmModal
        open={pickConfirmModalOpen}
        assignment={stationAssignment}
        fillStation={selectedFillStation}
        previousPicks={selectedPreviousPicks}
        onClose={clearStationSelection}
        onConfirm={handlePickConfirm}
        zIndex={mapFullscreen ? 1200 : undefined}
      />

      <UnassignSortingStationModal
        open={unassignModalOpen}
        assignment={stationAssignment}
        onClose={clearStationSelection}
        zIndex={mapFullscreen ? 1200 : undefined}
      />
    </div>
  );
}
