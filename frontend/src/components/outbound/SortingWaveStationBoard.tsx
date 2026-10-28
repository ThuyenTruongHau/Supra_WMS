/**
 * Layout dùng chung: tab sorting wave + bản đồ Breaking Pallet.
 * Dùng ở OperatorOutboundPage và OperatorSortingWavePage (user).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import type {
  MasanCcLocationResponse,
  MasanSortingZoneCcLocationRow,
} from "@/types/masan";
import {
  ccVehicleByCodeFromZoneLocations,
  masanSortingZoneCcLocationsQueryKey,
  useMasanSortingZoneCcLocations,
} from "@/hooks/useMasanSortingZoneCcLocations";
import {
  masanSortingZonePendingStockQueryKey,
  useMasanSortingZonePendingStock,
} from "@/hooks/useMasanSortingZonePendingStock";
import { useMasanSortingZoneWebSocket } from "@/hooks/useMasanSortingZoneWebSocket";
import {
  buildPendingStockMapOverlays,
  mergePendingStockOverlays,
  pendingAllocationsForVtLocationId,
} from "@/utils/masanPendingStockOverlay";
import {
  ccLocationLinesFromPendingStock,
  ccLocationResponseFromPendingAndCache,
  loadCcLocationModalData,
} from "@/utils/masanCcLocationModalData";
import { stripVtKeysFromOverlayLabels } from "@/utils/locationBin";
import CcLocationLinesModal from "@/components/outbound/CcLocationLinesModal";
import MasanCcPendingStockConfirmModal from "@/components/outbound/MasanCcPendingStockConfirmModal";
import {
  outboundCcBucketZoneCodeFor,
  outboundVtClickableZoneIdsFor,
} from "@/constants/outboundMapZones";
import type { SortingWave } from "@/types/sortingWave";
import AssignSortingStationModal from "@/components/outbound/AssignSortingStationModal";
import AssignOutboundStationModal from "@/components/outbound/AssignOutboundStationModal";
import SortingStationPickConfirmModal from "@/components/outbound/SortingStationPickConfirmModal";
import UnassignSortingStationModal from "@/components/outbound/UnassignSortingStationModal";
import { useLocationByCodeMap } from "@/hooks/useWarehouseLocation";
import { useZonesMapStatus } from "@/hooks/useWarehouseMap";
import OperatorMapCanvas from "@/components/warehouse/OperatorMapCanvas";
import type { BufferMapCanvasTuning } from "@/components/warehouse/OperatorMapCanvas";
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
import {
  operatorZoneActionButtonClass,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";

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
  /** Zone vẽ trên canvas. Không truyền thì dùng đúng `zoneId`. */
  mapZoneIds?: number[];
  /** Có giá trị thì click ô đọc hàng đã chia từ cache CC Masan thay cho luồng gán sorting station. */
  warehouseId?: number;
  /** Chỉ ô thuộc các zone này được click. Dùng cùng `warehouseId`. */
  clickableZoneIds?: number[];
};

const EMPTY_SORTING_WAVES: SortingWave[] = [];
const EMPTY_ZONE_IDS: number[] = [];

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
  mapZoneIds,
  warehouseId,
  clickableZoneIds = EMPTY_ZONE_IDS,
}: SortingWaveStationBoardProps) {
  const viewportTier = useOperatorViewportTier();
  const { data: sortingWavesData, isLoading: wavesLoading } = useSortingWaves(
    zoneId,
    { enabled: !hideWaveTabs },
  );
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
  const restrictToClickableZones = clickableZoneIds.length > 0;
  const vtClickableZoneIds = useMemo(
    () => outboundVtClickableZoneIdsFor(zoneId),
    [zoneId],
  );
  const ccBucketZoneCode = outboundCcBucketZoneCodeFor(zoneId) ?? "";
  const masanVtPickEnabled =
    vtClickableZoneIds.length > 0 && ccBucketZoneCode.length > 0;
  const queryClient = useQueryClient();
  const masanCcZonePollEnabled =
    Boolean(warehouseId) && ccBucketZoneCode.length > 0;
  const ccZoneStatusQuery = useMasanSortingZoneCcLocations(
    warehouseId ?? 0,
    ccBucketZoneCode || null,
    masanCcZonePollEnabled,
  );
  const ccZoneStatusData = ccZoneStatusQuery.data;
  const ccVehicleByCode = useMemo(
    () => ccVehicleByCodeFromZoneLocations(ccZoneStatusData?.locations ?? []),
    [ccZoneStatusData?.locations],
  );

  const pendingStockQuery = useMasanSortingZonePendingStock(
    warehouseId ?? 0,
    ccBucketZoneCode || null,
    masanCcZonePollEnabled,
  );
  const pendingStockData = pendingStockQuery.data;
  useMasanSortingZoneWebSocket({
    warehouseId: warehouseId ?? 0,
    ccZoneCode: ccBucketZoneCode || null,
    enabled: masanCcZonePollEnabled,
  });

  const { items: clickableLocations } = useZonesMapStatus(clickableZoneIds);
  const { items: vtLocations } = useZonesMapStatus(
    masanVtPickEnabled ? vtClickableZoneIds : EMPTY_ZONE_IDS,
  );
  const clickableLocationIdByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const loc of clickableLocations) map.set(loc.location_code, loc.id);
    return map;
  }, [clickableLocations]);
  const clickableLocationCodeById = useMemo(() => {
    const map = new Map<number, string>();
    for (const loc of clickableLocations) {
      map.set(loc.id, loc.location_code);
    }
    return map;
  }, [clickableLocations]);
  const vtLocationIdByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const loc of vtLocations) map.set(loc.location_code, loc.id);
    return map;
  }, [vtLocations]);
  const vtLocationCodeById = useMemo(() => {
    const map = new Map<number, string>();
    for (const loc of vtLocations) map.set(loc.id, loc.location_code);
    return map;
  }, [vtLocations]);
  const clickableLocationNameByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const loc of clickableLocations) {
      const name = (loc.location_name ?? "").trim();
      if (name) map.set(loc.location_code, name);
    }
    return map;
  }, [clickableLocations]);

  const resolveCcLocationName = (locationCode: string, locationId: number) => {
    const fromClickable = clickableLocations.find(
      (loc) => loc.id === locationId || loc.location_code === locationCode,
    );
    const fromClickableName = (fromClickable?.location_name ?? "").trim();
    if (fromClickableName) return fromClickableName;
    const fromZoneMap = (
      locationByCode[locationCode]?.location_name ?? ""
    ).trim();
    if (fromZoneMap) return fromZoneMap;
    const fromClickableMap = (
      clickableLocationNameByCode.get(locationCode) ?? ""
    ).trim();
    if (fromClickableMap) return fromClickableMap;
    return null;
  };
  const clickableCodes = useMemo(() => {
    if (!restrictToClickableZones) return undefined;
    const codes = new Set<string>();
    for (const code of clickableLocationIdByCode.keys()) codes.add(code);
    for (const code of vtLocationIdByCode.keys()) codes.add(code);
    return codes.size > 0 ? codes : undefined;
  }, [
    restrictToClickableZones,
    clickableLocationIdByCode,
    vtLocationIdByCode,
  ]);
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

  const mapOverlayLabels = useMemo(() => {
    const stationForMap = stripVtKeysFromOverlayLabels(stationOverlayLabels);
    if (!masanCcZonePollEnabled) return stationForMap;
    const pendingOverlays = buildPendingStockMapOverlays(
      pendingStockData,
      vtLocationCodeById,
      clickableLocationCodeById,
    );
    return mergePendingStockOverlays(stationForMap, pendingOverlays);
  }, [
    masanCcZonePollEnabled,
    stationOverlayLabels,
    pendingStockData,
    vtLocationCodeById,
    clickableLocationCodeById,
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
  const [selectedStationLocationName, setSelectedStationLocationName] =
    useState<string | null>(null);
  const [selectedStationKind, setSelectedStationKind] = useState<
    "sorting" | "outbound" | null
  >(null);
  const [ccModalOpen, setCcModalOpen] = useState(false);
  const [ccLocationData, setCcLocationData] =
    useState<MasanCcLocationResponse | null>(null);
  const [ccLoading, setCcLoading] = useState(false);
  const ccRequestIdRef = useRef(0);
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
  const invalidateMasanCcCaches = () => {
    if (!warehouseId || !ccBucketZoneCode) return;
    void queryClient.invalidateQueries({
      queryKey: masanSortingZoneCcLocationsQueryKey(
        warehouseId,
        ccBucketZoneCode,
      ),
    });
    void queryClient.invalidateQueries({
      queryKey: masanSortingZonePendingStockQueryKey(
        warehouseId,
        ccBucketZoneCode,
      ),
    });
  };

  /** Làm mới overlay CC + pending stock khi click ô map (giống admin refetch full-locations). */
  const refreshMasanMapOverlays = async () => {
    if (!warehouseId || !ccBucketZoneCode) return undefined;
    const [ccResult, pendingResult] = await Promise.all([
      ccZoneStatusQuery.refetch(),
      pendingStockQuery.refetch(),
    ]);
    return {
      ccLocations: ccResult.data?.locations,
      pendingStock: pendingResult.data,
    };
  };

  const ccRowToLocationResponse = (
    row: MasanSortingZoneCcLocationRow,
  ): MasanCcLocationResponse => ({
    warehouse_id: warehouseId ?? 0,
    location_id: row.location_id,
    assigned: row.assigned,
    location_name: row.location_name,
    zone: row.zone,
    vehicle_number: row.vehicle_number,
    lines: row.lines,
  });

  const openCcLocation = async (
    locationCode: string,
    locationId: number,
    overlayRefresh?: {
      ccLocations?: MasanSortingZoneCcLocationRow[];
      pendingStock?: typeof pendingStockData;
    },
  ) => {
    if (!warehouseId) return;
    const requestId = ++ccRequestIdRef.current;
    const locationName = resolveCcLocationName(locationCode, locationId);
    setSelectedStationCode(locationCode);
    setSelectedStationLocationId(locationId);
    setSelectedStationLocationName(locationName);
    setSelectedStationKind(null);
    setCcLocationData(null);
    setCcModalOpen(true);

    const locationPool =
      overlayRefresh?.ccLocations ?? ccZoneStatusData?.locations ?? [];
    const pendingStock =
      overlayRefresh?.pendingStock ?? pendingStockData;
    const cachedRow = locationPool.find(
      (row) =>
        row.location_id === locationId || row.location_code === locationCode,
    );
    const cachedName = (cachedRow?.location_name ?? "").trim();
    if (cachedName) setSelectedStationLocationName(cachedName);

    const pendingLines = ccLocationLinesFromPendingStock(
      pendingStock,
      locationId,
      clickableLocationCodeById,
      { locationCode, locationName: cachedName || locationName },
    );
    if (pendingLines.length > 0) {
      setCcLocationData(
        ccLocationResponseFromPendingAndCache(
          warehouseId,
          locationId,
          cachedName || locationName,
          pendingLines,
          cachedRow,
          ccBucketZoneCode,
        ),
      );
    } else if (cachedRow) {
      setCcLocationData(ccRowToLocationResponse(cachedRow));
    }

    setCcLoading(true);
    try {
      const data = await loadCcLocationModalData({
        warehouseId,
        locationId,
        locationCode,
        locationName: cachedName || locationName,
        pendingStock,
        ccLocationIdToCode: clickableLocationCodeById,
        cachedRow,
        ccBucketZoneCode,
      });
      if (requestId === ccRequestIdRef.current) {
        setCcLocationData(data);
        const apiName = (data.location_name ?? "").trim();
        if (apiName) setSelectedStationLocationName(apiName);
      }
    } catch (err) {
      if (requestId !== ccRequestIdRef.current) return;
      if (pendingLines.length === 0 && !cachedRow) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response
            ?.data?.detail ??
          (err instanceof Error ? err.message : "Không tải được hàng đã chia của ô");
        message.error(detail);
      }
    } finally {
      if (requestId === ccRequestIdRef.current) setCcLoading(false);
    }
  };

  const refreshCcModalAfterPickingList = async () => {
    invalidateMasanCcCaches();
    const overlayRefresh = await refreshMasanMapOverlays();
    if (
      !ccModalOpen ||
      !warehouseId ||
      selectedStationLocationId == null ||
      !selectedStationCode
    ) {
      return;
    }
    const locationCode = selectedStationCode;
    const locationId = selectedStationLocationId;
    const requestId = ++ccRequestIdRef.current;
    const locationName =
      (selectedStationLocationName ?? "").trim() ||
      resolveCcLocationName(locationCode, locationId);

    const locationPool =
      overlayRefresh?.ccLocations ?? ccZoneStatusData?.locations ?? [];
    const pendingStock =
      overlayRefresh?.pendingStock ?? pendingStockData;
    const cachedRow = locationPool.find(
      (row) =>
        row.location_id === locationId || row.location_code === locationCode,
    );
    const cachedName = (cachedRow?.location_name ?? "").trim();
    const displayName = cachedName || locationName;

    const pendingLines = ccLocationLinesFromPendingStock(
      pendingStock,
      locationId,
      clickableLocationCodeById,
      { locationCode, locationName: displayName },
    );
    if (pendingLines.length > 0) {
      setCcLocationData(
        ccLocationResponseFromPendingAndCache(
          warehouseId,
          locationId,
          displayName,
          pendingLines,
          cachedRow,
          ccBucketZoneCode,
        ),
      );
    } else if (cachedRow) {
      setCcLocationData(ccRowToLocationResponse(cachedRow));
    }

    setCcLoading(true);
    try {
      const data = await loadCcLocationModalData({
        warehouseId,
        locationId,
        locationCode,
        locationName: displayName,
        pendingStock,
        ccLocationIdToCode: clickableLocationCodeById,
        cachedRow,
        ccBucketZoneCode,
      });
      if (requestId === ccRequestIdRef.current) {
        setCcLocationData(data);
        const apiName = (data.location_name ?? "").trim();
        if (apiName) setSelectedStationLocationName(apiName);
      }
    } catch {
      /* giữ dữ liệu hiện tại nếu API lỗi */
    } finally {
      if (requestId === ccRequestIdRef.current) setCcLoading(false);
    }
  };

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

  const resolveVtLocationName = (locationCode: string, locationId: number) => {
    const vtLoc = vtLocations.find(
      (loc) => loc.id === locationId || loc.location_code === locationCode,
    );
    const name = (vtLoc?.location_name ?? "").trim();
    if (name) return name;
    return locationCode;
  };

  const openPendingStockConfirm = (
    locationCode: string,
    vtLocationId: number,
  ) => {
    const lines = pendingAllocationsForVtLocationId(
      pendingStockData,
      vtLocationId,
      clickableLocationCodeById,
    );
    if (lines.length === 0) {
      message.info("Không có hàng chờ xác nhận lấy tại VT này");
      return;
    }
    setSelectedStationCode(locationCode);
    setSelectedStationLocationId(vtLocationId);
    setPendingConfirmLocationCode(locationCode);
    setPendingConfirmLocationId(vtLocationId);
    setPendingConfirmLocationName(
      resolveVtLocationName(locationCode, vtLocationId),
    );
    setPendingConfirmOpen(true);
  };

  /** Refetch zone sau khi modal CC đã mở; bỏ qua nếu user đã chuyển ô hoặc đóng modal. */
  const refreshOpenCcModal = async (
    locationCode: string,
    locationId: number,
    openedForRequestId: number,
  ) => {
    const overlayRefresh = await refreshMasanMapOverlays();
    if (!warehouseId || ccRequestIdRef.current !== openedForRequestId) return;

    const requestId = ++ccRequestIdRef.current;
    const locationName =
      resolveCcLocationName(locationCode, locationId) || locationCode;
    const locationPool = overlayRefresh?.ccLocations ?? [];
    const pendingStock = overlayRefresh?.pendingStock;
    const cachedRow = locationPool.find(
      (row) =>
        row.location_id === locationId || row.location_code === locationCode,
    );
    const cachedName = (cachedRow?.location_name ?? "").trim();
    const displayName = cachedName || locationName;
    if (cachedName) setSelectedStationLocationName(cachedName);

    const pendingLines = ccLocationLinesFromPendingStock(
      pendingStock,
      locationId,
      clickableLocationCodeById,
      { locationCode, locationName: displayName },
    );
    if (pendingLines.length > 0) {
      setCcLocationData(
        ccLocationResponseFromPendingAndCache(
          warehouseId,
          locationId,
          displayName,
          pendingLines,
          cachedRow,
          ccBucketZoneCode,
        ),
      );
    } else if (cachedRow) {
      setCcLocationData(ccRowToLocationResponse(cachedRow));
    }

    setCcLoading(true);
    try {
      const data = await loadCcLocationModalData({
        warehouseId,
        locationId,
        locationCode,
        locationName: displayName,
        pendingStock,
        ccLocationIdToCode: clickableLocationCodeById,
        cachedRow,
        ccBucketZoneCode,
      });
      if (requestId === ccRequestIdRef.current) {
        setCcLocationData(data);
        const apiName = (data.location_name ?? "").trim();
        if (apiName) setSelectedStationLocationName(apiName);
      }
    } catch {
      /* giữ dữ liệu hiện tại nếu API lỗi */
    } finally {
      if (requestId === ccRequestIdRef.current) setCcLoading(false);
    }
  };

  const openCcLocationFromClick = (locationCode: string, locationId: number) => {
    void openCcLocation(locationCode, locationId);
    const openedForRequestId = ccRequestIdRef.current;
    void refreshOpenCcModal(locationCode, locationId, openedForRequestId);
  };

  const handleStationCellClick = async (payload: { locationCode: string }) => {
    if (restrictToClickableZones) {
      const vtLocationId = vtLocationIdByCode.get(payload.locationCode);
      if (vtLocationId != null) {
        openPendingStockConfirm(payload.locationCode, vtLocationId);
        void refreshMasanMapOverlays();
        return;
      }
      const locationId = clickableLocationIdByCode.get(payload.locationCode);
      if (locationId == null) return;
      if (warehouseId) {
        openCcLocationFromClick(payload.locationCode, locationId);
      }
      return;
    }

    const location = locationByCode[payload.locationCode];
    if (!location) {
      message.error(
        `Không tìm thấy warehouse location cho mã ${payload.locationCode}`,
      );
      return;
    }

    if (warehouseId) {
      openCcLocationFromClick(payload.locationCode, location.id);
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
    setSelectedStationLocationName(null);
    setSelectedStationKind(null);
    ccRequestIdRef.current += 1;
    setCcModalOpen(false);
    setCcLocationData(null);
    setCcLoading(false);
    setPendingConfirmOpen(false);
    setPendingConfirmLocationId(null);
    setPendingConfirmLocationCode(null);
    setPendingConfirmLocationName(null);
    invalidateMasanCcCaches();
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
          <OperatorMapCanvas
            key={`wave-${fullscreen ? "fs" : "n"}-${selectedWaveId ?? "none"}-${waveStationIds.join(",")}`}
            zoneId={mapZoneIds && mapZoneIds.length > 0 ? mapZoneIds : zoneId}
            tuning={mapTuning}
            selectedCodes={selectedStationCode ? [selectedStationCode] : undefined}
            overlayLabelByCode={mapOverlayLabels}
            locationSubLabelByCode={
              warehouseId ? ccVehicleByCode : undefined
            }
            interactiveCodes={clickableCodes}
            onBufferCellClick={handleStationCellClick}
            refetchStatusOnCellClick={false}
            cellClickDelayMs={restrictToClickableZones ? 0 : undefined}
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
        sideSlot ? "@min-[1280px]:col-span-3" : "flex-1",
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
                className={cn(
                  "shrink-0",
                  operatorZoneActionButtonClass(viewportTier),
                )}
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
        <div className="hidden shrink-0 items-center gap-3 border-l border-stripe-hairline px-4 py-2 @min-[640px]:flex">
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

      {!hideWaveTabs && !wavesLoading && sortingWaves.length === 0 ? (
        <div className={cn(
            sideSlot
              ? "grid min-h-0 flex-1 grid-cols-1 items-stretch @min-[1280px]:grid-cols-5"
              : "flex min-h-0 flex-1 flex-col",
            fillHeight && "min-h-0 flex-1",
          )}>
          {mapPanel}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
            <div className="rounded-xl bg-white/95 px-6 py-4 text-center shadow-lg backdrop-blur pointer-events-auto border border-slate-200">
              {emptyHint ?? (
                <p className="text-sm text-slate-500">
                  Không có board chia chọn để hiển thị. Thêm wave để cấu hình stations.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          key={selectedWaveId ?? "none"}
          className={cn(
            sideSlot
              ? "grid min-h-0 flex-1 grid-cols-1 items-stretch @min-[1280px]:grid-cols-5"
              : "flex min-h-0 flex-1 flex-col",
            fillHeight && "min-h-0 flex-1",
          )}
        >
          {mapPanel}
          {sideSlot ? (
            <div className="flex min-h-0 flex-col overflow-hidden border-t border-stripe-hairline @min-[1280px]:col-span-2 @min-[1280px]:border-l @min-[1280px]:border-t-0">
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

      {warehouseId ? (
        <CcLocationLinesModal
          open={ccModalOpen}
          locationCode={selectedStationCode}
          locationName={selectedStationLocationName}
          locationId={selectedStationLocationId}
          warehouseId={warehouseId ?? 0}
          data={ccLocationData}
          loading={ccLoading}
          onClose={clearStationSelection}
          onPickingListDownloadComplete={refreshCcModalAfterPickingList}
          zIndex={mapFullscreen ? 1200 : undefined}
        />
      ) : null}

      {warehouseId && ccBucketZoneCode && pendingConfirmLocationId != null ? (
        <MasanCcPendingStockConfirmModal
          open={pendingConfirmOpen}
          onClose={() => {
            setPendingConfirmOpen(false);
            setPendingConfirmLocationId(null);
            setPendingConfirmLocationCode(null);
            setPendingConfirmLocationName(null);
          }}
          warehouseId={warehouseId}
          displayZoneId={zoneId}
          ccBucketZoneCode={ccBucketZoneCode}
          vtLocationId={pendingConfirmLocationId}
          vtLocationCode={pendingConfirmLocationCode}
          vtLocationName={pendingConfirmLocationName}
          lines={
            pendingConfirmLocationId != null
              ? pendingAllocationsForVtLocationId(
                  pendingStockData,
                  pendingConfirmLocationId,
                  clickableLocationCodeById,
                )
              : []
          }
          onConfirmed={invalidateMasanCcCaches}
          zIndex={mapFullscreen ? 1200 : undefined}
        />
      ) : null}

    </div>
  );
}
