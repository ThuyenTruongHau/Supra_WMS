/**
 * Board tab Xuất trực tiếp (bypass).
 * Điểm nhập: ô BP (inbound_buffer) — lấy ItemStock tại ô.
 * Điểm xuất: ô VT (Zone_sorting) — gửi BE Zone_CC cùng cặp làm `target_zone`.
 * Click map chỉ fill select — không mở popup; ô không hợp lệ bị mờ và không chọn được.
 */
import { useMemo, useState } from "react";
import { RobotOutlined } from "@ant-design/icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Select, message } from "@/components/ui";
import { OPERATOR_DESKTOP } from "@/constants/operatorDesktopSizes";
import {
  isOperatorTabletViewport,
  operatorInboundMapTuningForTier,
  operatorWaveMapTuningForTier,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";
import { cn } from "@/components/ui";
import OperatorMapCanvas from "@/components/warehouse/OperatorMapCanvas";
import {
  useLocationByCodeMap,
  useLocationsByZone,
} from "@/hooks/useWarehouseLocation";
import { useLocationDetail } from "@/hooks/useWarehouseMap";
import { bypassMasanInboundToOutboundApi } from "@/api/masan";
import { getApiErrorDetail } from "@/types/apiError";
import { toDisplayInteger } from "@/utils/number";
import { getLocationDisplayLabel } from "@/utils/locationBin";
import {
  OUTBOUND_DISPLAY_ZONES,
  OUTBOUND_MAP_ZONE_IDS,
} from "@/constants/outboundMapZones";
import { useInboundOperatorAssignee } from "@/store/useOperatorAssigneeStore";
import {
  hasInboundOperatorAssignee,
  OPERATOR_ASSIGNEE_REQUIRED_INBOUND,
} from "@/utils/operatorSortingPersons";
import { useMasanVtLocations } from "@/hooks/useMasanVtLocations";

const DIRECT_OUTBOUND_VT_ZONE_A = OUTBOUND_DISPLAY_ZONES[0];
const DIRECT_OUTBOUND_VT_ZONE_B = OUTBOUND_DISPLAY_ZONES[1];

const SELECT_CLASS =
  "!h-12 flex-1 min-w-0 [&_.ant-select-selection-item]:!text-base [&_.ant-select-selection-item]:!leading-[46px] [&_.ant-select-selection-placeholder]:!text-base [&_.ant-select-selection-placeholder]:!leading-[46px] [&_.ant-select-selector]:!h-12";

type DirectOutboundFromInboundBoardProps = {
  /** Thực chất là warehouse id (OperatorInboundPage truyền `warehouseId`). */
  zoneId: number;
  onImportClick?: () => void;
  importLoading?: boolean;
  importDisabled?: boolean;
};

type VtTarget = {
  id: number;
  location_code: string;
  location_name: string;
  /** Zone.code CC cùng cặp với khu VT. */
  ccZoneCode: string;
};

function locationName(loc: {
  location_code: string;
  location_name?: string | null;
}): string {
  return (loc.location_name ?? "").trim() || loc.location_code;
}

function isBypassBin(loc: {
  location_name?: string | null;
  bin?: string | null;
  location_type?: string | null;
  location_code?: string | null;
}): boolean {
  return getLocationDisplayLabel(loc, loc.location_type)
    .toUpperCase()
    .startsWith("BP");
}

export default function DirectOutboundFromInboundBoard({
  zoneId = 1,
}: DirectOutboundFromInboundBoardProps) {
  const warehouseId = zoneId;
  const queryClient = useQueryClient();
  const { username: inboundAssignee } = useInboundOperatorAssignee(zoneId);
  const viewportTier = useOperatorViewportTier();
  const inboundMapTuning = operatorInboundMapTuningForTier(viewportTier);
  const waveMapTuning = operatorWaveMapTuningForTier(viewportTier);
  const tabletControls = isOperatorTabletViewport(viewportTier);

  const { data: allLocations = [], isLoading: locationsLoading } =
    useLocationsByZone(zoneId);
  const { locationByCode } = useLocationByCodeMap(zoneId);

  const [inboundLocationId, setInboundLocationId] = useState<
    number | undefined
  >();
  const [outboundVt, setOutboundVt] = useState<VtTarget | null>(null);

  const bypassCells = useMemo(
    () =>
      allLocations.filter(
        (loc) =>
          (loc.location_type || "").trim() === "inbound_buffer" &&
          isBypassBin(loc),
      ),
    [allLocations],
  );

  const inboundOptions = useMemo(
    () =>
      bypassCells.map((loc) => ({
        value: loc.id,
        label: locationName(loc),
      })),
    [bypassCells],
  );

  const inboundInteractiveCodes = useMemo(
    () => bypassCells.map((loc) => loc.location_code),
    [bypassCells],
  );

  const selectedInboundLocation =
    bypassCells.find((loc) => loc.id === inboundLocationId) ?? null;
  const inboundLocationCode = selectedInboundLocation?.location_code ?? null;

  const { data: inboundLocationDetail, isFetching: inboundDetailLoading } =
    useLocationDetail(inboundLocationId);
  const bypassStock = useMemo(
    () =>
      (inboundLocationDetail?.item_stock ?? []).find(
        (stock) => Number(stock.quantity || 0) > 0,
      ) ?? null,
    [inboundLocationDetail?.item_stock],
  );
  const inboundDisplayName = inboundLocationDetail?.location
    ? locationName(inboundLocationDetail.location)
    : selectedInboundLocation
      ? locationName(selectedInboundLocation)
      : null;

  const vtZoneA = useMasanVtLocations(DIRECT_OUTBOUND_VT_ZONE_A?.id ?? 8);
  const vtZoneB = useMasanVtLocations(DIRECT_OUTBOUND_VT_ZONE_B?.id ?? 9);
  const vtByCode = useMemo(() => {
    const map = new Map<string, VtTarget>();
    const pairs = [
      [vtZoneA.locations, DIRECT_OUTBOUND_VT_ZONE_A?.ccBucketZoneCode],
      [vtZoneB.locations, DIRECT_OUTBOUND_VT_ZONE_B?.ccBucketZoneCode],
    ] as const;
    for (const [locations, ccZoneCode] of pairs) {
      if (!ccZoneCode) continue;
      for (const loc of locations) {
        const code = (loc.location_code ?? "").trim();
        if (!code) continue;
        map.set(code, {
          id: loc.id,
          location_code: code,
          location_name: locationName(loc),
          ccZoneCode,
        });
      }
    }
    return map;
  }, [vtZoneA.locations, vtZoneB.locations]);

  const vtLocationCodes = useMemo(() => new Set(vtByCode.keys()), [vtByCode]);
  const vtById = useMemo(
    () => new Map([...vtByCode.values()].map((vt) => [vt.id, vt])),
    [vtByCode],
  );
  const outboundOptions = useMemo(
    () =>
      [...vtByCode.values()]
        .sort((a, b) =>
          a.location_name.localeCompare(b.location_name, undefined, {
            numeric: true,
          }),
        )
        .map((vt) => ({
          value: vt.id,
          label: `${vt.location_name} · ${vt.ccZoneCode}`,
        })),
    [vtByCode],
  );
  const vtLoading = vtZoneA.isLoading || vtZoneB.isLoading;

  const bypassMetadata = useMemo(() => {
    if (!inboundLocationId) return "Chưa chọn ô bypass";
    if (inboundDetailLoading && !inboundLocationDetail) return "Đang tải tồn ô bypass...";
    if (!bypassStock) return "Ô bypass không có hàng";
    const parts = [
      bypassStock.sku || `#${bypassStock.item_id}`,
      bypassStock.item_name || "Chưa có tên hàng",
      bypassStock.lot_number ? `Lot ${bypassStock.lot_number}` : null,
      `SL ${toDisplayInteger(Number(bypassStock.quantity || 0))}`,
    ].filter(Boolean);
    const target = outboundVt
      ? ` → ${outboundVt.location_name} (${outboundVt.ccZoneCode})`
      : "";
    return `${parts.join(" - ")}${target}`;
  }, [
    bypassStock,
    inboundDetailLoading,
    inboundLocationDetail,
    inboundLocationId,
    outboundVt,
  ]);

  const handleInboundMapClick = (payload: { locationCode: string }) => {
    const location = locationByCode[payload.locationCode];
    if (!location) {
      message.error(
        `Không tìm thấy warehouse location cho mã ${payload.locationCode}`,
      );
      return;
    }
    if (
      (location.location_type || "").trim() !== "inbound_buffer" ||
      !isBypassBin(location)
    ) {
      message.error("Điểm nhập phải là ô bypass (BP).");
      return;
    }
    setInboundLocationId(location.id);
  };

  const handleWaveMapClick = (payload: { locationCode: string }) => {
    const vt = vtByCode.get(payload.locationCode);
    if (!vt) return;
    setOutboundVt(vt);
  };

  const bypassMutation = useMutation({
    mutationFn: bypassMasanInboundToOutboundApi,
  });

  const inboundAssigneeReady = hasInboundOperatorAssignee(inboundAssignee);

  const handleSendCommand = () => {
    if (!inboundAssigneeReady) {
      message.warning(OPERATOR_ASSIGNEE_REQUIRED_INBOUND);
      return;
    }
    if (!inboundLocationId || !outboundVt) {
      message.warning("Vui lòng chọn đủ điểm nhập (BP) và điểm xuất (VT)");
      return;
    }
    if (!bypassStock) {
      message.warning("Ô bypass không có hàng");
      return;
    }

    const stock = bypassStock;
    const target = outboundVt;
    Modal.confirm({
      title: "Xác nhận bypass xuất trực tiếp",
      width: OPERATOR_DESKTOP.modal.default,
      content: (
        <div className="space-y-2 text-sm text-slate-600">
          <p>
            Điểm nhập: <strong>{inboundDisplayName}</strong>
          </p>
          <p>
            Điểm xuất: <strong>{target.location_name}</strong> · Zone CC{" "}
            <strong>{target.ccZoneCode}</strong>
          </p>
          <p>
            Hàng: <strong>{stock.sku || `#${stock.item_id}`}</strong>
            {stock.item_name ? ` - ${stock.item_name}` : null}
            {stock.lot_number ? ` · Lot ${stock.lot_number}` : null} · SL{" "}
            <strong>{toDisplayInteger(Number(stock.quantity || 0))}</strong>
          </p>
        </div>
      ),
      okText: "Gửi lệnh",
      cancelText: "Hủy",
      onOk: () =>
        bypassMutation.mutateAsync(
          {
            warehouse_id: warehouseId,
            target_zone: target.ccZoneCode,
            item_stock_id: stock.id,
            to_location_id: target.id,
          },
          {
            onSuccess: (result) => {
              message.success(result.message || "Bypass hàng thành công");
              void queryClient.invalidateQueries({
                queryKey: ["location-detail"],
              });
              for (const zone of [
                ...vtZoneA.vtZoneIds,
                ...vtZoneB.vtZoneIds,
              ]) {
                void queryClient.invalidateQueries({
                  queryKey: ["zone_map_status", zone],
                });
              }
            },
            onError: (err) => {
              message.error(getApiErrorDetail(err, "Không thể bypass hàng"));
            },
          },
        ),
    });
  };

  const canSend =
    inboundAssigneeReady &&
    bypassStock != null &&
    outboundVt != null &&
    !bypassMutation.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
      <div className="grid shrink-0 grid-cols-1 items-end gap-2 border-b border-stripe-hairline px-3 py-2.5 sm:px-4 @min-[768px]:grid-cols-3 @min-[1280px]:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
        <div className="min-w-0 space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Điểm nhập
          </label>
          <div className="flex gap-2">
            <Select
              showSearch
              optionFilterProp="label"
              loading={locationsLoading}
              value={inboundLocationId}
              placeholder="Chọn / click ô BP map trái"
              onChange={(next) => setInboundLocationId(Number(next))}
              options={inboundOptions}
              disabled={zoneId <= 0 || locationsLoading}
              className={SELECT_CLASS}
              notFoundContent="Không có ô bypass"
            />
          </div>
        </div>

        <div className="min-w-0 space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Điểm xuất
          </label>
          <div className="flex gap-2">
            <Select
              showSearch
              optionFilterProp="label"
              loading={vtLoading}
              value={outboundVt?.id}
              placeholder="Chọn / click ô VT trên map"
              onChange={(next) => setOutboundVt(vtById.get(Number(next)) ?? null)}
              options={outboundOptions}
              disabled={zoneId <= 0 || vtLoading}
              className={SELECT_CLASS}
              notFoundContent="Không có ô VT"
            />
          </div>
        </div>
        <div className="min-w-0 space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Metadata
          </label>
          <Input
            readOnly
            value={bypassMetadata}
            title={bypassMetadata}
            className="!h-12 !w-full !truncate !border-cyan-300/40 !bg-cyan-50/50 !px-3 !font-mono !text-base !font-semibold !text-slate-700"
          />
        </div>
        <Button
          variant="primary"
          icon={<RobotOutlined />}
          onClick={handleSendCommand}
          disabled={!canSend}
          title={
            !inboundAssigneeReady
              ? OPERATOR_ASSIGNEE_REQUIRED_INBOUND
              : undefined
          }
          loading={bypassMutation.isPending}
          className={cn("!h-12", tabletControls ? "!text-base" : "!text-sm")}
        >
          Gửi lệnh
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden @min-[1280px]:grid-cols-2">
        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden @min-[1280px]:border-r @min-[1280px]:border-stripe-hairline">
          <div className="flex shrink-0 items-center border-b border-stripe-hairline px-3 py-2">
            <h4 className="text-sm font-semibold text-brand-dark">
              Sơ đồ điểm nhập
            </h4>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-industrial-pattern p-2">
            {zoneId > 0 ? (
              <OperatorMapCanvas
                zoneId={[2, 12]}
                showInboundSeparator={true}
                tuning={inboundMapTuning}
                selectedCodes={inboundLocationCode ? [inboundLocationCode] : undefined}
                interactiveCodes={inboundInteractiveCodes}
                onBufferCellClick={handleInboundMapClick}
                className="!h-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Chọn kho để xem sơ đồ điểm nhập
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col overflow-hidden border-t border-stripe-hairline @min-[1280px]:border-t-0">
          <div className="flex shrink-0 items-center border-b border-stripe-hairline px-3 py-2">
            <h4 className="text-sm font-semibold text-brand-dark">
              Sơ đồ chia chọn (VT)
            </h4>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-industrial-pattern p-2">
            {zoneId > 0 ? (
              <OperatorMapCanvas
                key="wave-all-vt"
                zoneId={[...OUTBOUND_MAP_ZONE_IDS]}
                tuning={waveMapTuning}
                selectedCodes={outboundVt ? [outboundVt.location_code] : undefined}
                interactiveCodes={vtLocationCodes}
                vtLocationCodes={vtLocationCodes}
                onBufferCellClick={handleWaveMapClick}
                className="!h-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
                Chọn kho để xem sơ đồ chia chọn
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
