import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ExportOutlined,
  FileExcelOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Modal, Space, Table, message } from "@/components/ui";
import OperatorPageHeader from "@/components/layout/OperatorPageHeader";
import { useOperatorShell } from "@/components/layout/OperatorShellContext";
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
  operatorDesktopTableWidths,
} from "@/constants/operatorDesktopSizes";
import { useAppStore } from "@/store/useAppStore";
import { useZone } from "@/hooks/useZone";
import { useProduct } from "@/hooks/useProduct";
import { useSortingWaves } from "@/hooks/useSortingWave";
import type { SortingWave } from "@/types/sortingWave";
import {
  useIncompleteVehicles,
  useOutboundList,
  useCreateOutboundOrder,
} from "@/hooks/useOutbound";
import { getApiErrorDetail } from "@/types/apiError";
import { exportOutboundOrderSOApi } from "@/api/masan";
import { syncWaveAssignmentApi } from "@/api/outboundTask";
import {
  useOutboundTasksByWave,
  useSendOutboundTaskCommands,
  outboundTasksByWaveQueryKey,
} from "@/hooks/useOutboundTask";
import SortingWaveStationBoard from "@/components/outbound/SortingWaveStationBoard";
import SortingWaveOverviewPicker from "@/components/outbound/SortingWaveOverviewPicker";
import OperatorOutboundOrderBrowser from "@/components/outbound/OperatorOutboundOrderBrowser";
import type { OutboundSelectedProductLine } from "@/components/outbound/OperatorOutboundVehicleCards";
import { useLocationsByZone } from "@/hooks/useWarehouseLocation";
import {
  buildOutboundGoodsLegend,
  buildOutboundOperatorMetrics,
  buildOutboundRobotRows,
  buildSortingSlotLegend,
} from "@/utils/operatorHeaderMetrics";
import { toDisplayInteger } from "@/utils/number";
import {
  buildQuickPalletDetailGroups,
  pickQuickExportProduct,
} from "@/utils/quickPalletOutbound";

const EMPTY_SORTING_WAVES: SortingWave[] = [];

export default function OperatorOutboundPage() {
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);
  const { setShellHeaderCollapsed } = useOperatorShell();
  const { data: zonesData } = useZone();
  const zones = zonesData ?? [];
  const warehouseName =
    zones.find((z) => z.id === selectedWarehouseId)?.name ?? "Kho được gán";

  useEffect(() => {
    setShellHeaderCollapsed(true);
    return () => setShellHeaderCollapsed(false);
  }, [setShellHeaderCollapsed]);

  const { data: sortingWavesData, isLoading: wavesLoading } = useSortingWaves(
    selectedWarehouseId ?? 0,
  );
  const sortingWaves = sortingWavesData ?? EMPTY_SORTING_WAVES;
  const waveIdsKey = useMemo(
    () => sortingWaves.map((wave) => wave.id).join(","),
    [sortingWaves],
  );
  const [focusedWaveId, setFocusedWaveId] = useState<number | null>(null);
  const inDetailView = focusedWaveId != null;
  const [selectedWaveId, setSelectedWaveId] = useState<number | null>(null);

  useEffect(() => {
    if (sortingWaves.length === 0) {
      setFocusedWaveId(null);
      setSelectedWaveId(null);
      return;
    }
    setSelectedWaveId((prev) => {
      if (prev != null && sortingWaves.some((w) => w.id === prev)) return prev;
      return sortingWaves[0].id;
    });
    setFocusedWaveId((prev) => {
      if (prev != null && sortingWaves.some((w) => w.id === prev)) return prev;
      return null;
    });
  }, [waveIdsKey, sortingWaves]);

  const zoneId = selectedWarehouseId ?? 0;
  const queryClient = useQueryClient();

  const { data: products = [] } = useProduct(zoneId);
  const createOutboundOrderMutation = useCreateOutboundOrder();

  const [quickPalletExporting, setQuickPalletExporting] = useState<
    1 | 2 | null
  >(null);
  const [isExportingSO, setIsExportingSO] = useState(false);

  const handleExportMasanSO = async () => {
    if (!selectedOrderId) return;
    setIsExportingSO(true);
    try {
      await exportOutboundOrderSOApi(selectedOrderId);
      message.success("Đã xuất SO thành công");
    } catch (err: unknown) {
      message.error(getApiErrorDetail(err, "Không thể xuất SO"));
    } finally {
      setIsExportingSO(false);
    }
  };

  const handleQuickPalletExport = async (palletCount: 1 | 2) => {
    if (zoneId <= 0) {
      message.warning("Vui lòng chọn kho trước");
      return;
    }
    const product = pickQuickExportProduct(products);
    if (!product) {
      message.warning("Chưa có sản phẩm trong kho để tạo đơn demo");
      return;
    }

    setQuickPalletExporting(palletCount);
    try {
      const detail_groups = buildQuickPalletDetailGroups(
        product.id,
        palletCount,
      );
      await createOutboundOrderMutation.mutateAsync({
        outboundType: "auto",
        data: {
          warehouse_id: zoneId,
          order_code: `DEMO-${Date.now()}`,
          line_items: [],
          details: { detail_groups },
        }
      });
      const plate = detail_groups[0]?.vehicle_number ?? "";
      let syncHint = "";
      try {
        const sync = await syncWaveAssignmentApi(zoneId);
        if (selectedWaveId) {
          queryClient.invalidateQueries({
            queryKey: outboundTasksByWaveQueryKey(selectedWaveId),
          });
        }
        if (sync.tasks_created > 0) {
          syncHint = ` · ${sync.tasks_created} lệnh lấy kho`;
        }
      } catch {
        // Đơn đã tạo; sync wave có thể chạy sau qua worker
      }
      message.success(
        `Đã tạo đơn xuất ${palletCount} pallet (${plate})${syncHint}`,
      );
    } catch (err: unknown) {
      message.error(
        getApiErrorDetail(err, `Không thể tạo đơn xuất ${palletCount} pallet`),
      );
    } finally {
      setQuickPalletExporting(null);
    }
  };

  const {
    data: incompleteVehiclesData,
    isLoading: vehiclesLoading,
    isError: vehiclesError,
  } = useIncompleteVehicles(zoneId);
  const incompleteVehicles = incompleteVehiclesData?.vehicles ?? [];
  const { data: outboundOrders = [], isLoading: outboundOrdersLoading, isError: outboundOrdersError } =
    useOutboundList(zoneId);
  const { data: zoneLocations = [] } = useLocationsByZone(zoneId);
  const { data: waveTasks = [] } = useOutboundTasksByWave(focusedWaveId ?? 0);
  const sendTaskCommandsMutation = useSendOutboundTaskCommands(
    focusedWaveId ?? 0,
    zoneId,
  );
  const pendingTaskIds = useMemo(
    () =>
      waveTasks
        .filter((task) => task.status === "pending" && (task.node_id ?? 0) > 0)
        .map((task) => task.id),
    [waveTasks],
  );

  const [clock, setClock] = useState(() => new Date());
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedVehicleNumber, setSelectedVehicleNumber] = useState<
    string | null
  >(null);
  const [selectedProductLines, setSelectedProductLines] = useState<
    OutboundSelectedProductLine[]
  >([]);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    setSelectedVehicleNumber(null);
    setSelectedProductLines([]);
  }, [zoneId]);

  const handleCallRobot = () => {
    if (!focusedWaveId) {
      message.warning("Vui lòng chọn vị trí chia chọn trước khi gọi robot.");
      return;
    }
    if (pendingTaskIds.length === 0) {
      message.warning("Không có task chờ gửi robot trong wave hiện tại.");
      return;
    }

    Modal.confirm({
      title: "Xác nhận gọi robot xuất",
      width: OPERATOR_DESKTOP.modal.default,
      content: (
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          <p>
            Gửi lệnh xuống robot cho <strong>{pendingTaskIds.length}</strong>{" "}
            task của wave hiện tại.
          </p>
          <p>Chỉ gửi các task đã có node đích được cấu hình.</p>
        </div>
      ),
      okText: "Gửi lệnh",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          const result = await sendTaskCommandsMutation.mutateAsync({
            task_ids: pendingTaskIds,
          });
          message.success(`Đã gửi ${result.sent_count} lệnh xuống robot xuất.`);
        } catch (err: unknown) {
          message.error(
            getApiErrorDetail(err, "Không thể gửi lệnh robot xuất"),
          );
        }
      },
    });
  };

  useEffect(() => {
    setFocusedWaveId(null);
    setSelectedOrderId(null);
    setSelectedVehicleNumber(null);
    setSelectedProductLines([]);
  }, [zoneId]);

  const handleEnterWaveDetail = (waveId: number) => {
    setFocusedWaveId(waveId);
    setSelectedWaveId(waveId);
    setSelectedOrderId(null);
    setSelectedVehicleNumber(null);
    setSelectedProductLines([]);
  };

  const handleBackToOverview = () => {
    setFocusedWaveId(null);
    setSelectedOrderId(null);
    setSelectedVehicleNumber(null);
    setSelectedProductLines([]);
  };

  const selectedWaveName =
    sortingWaves.find((wave) => wave.id === focusedWaveId)?.name ??
    sortingWaves[0]?.name ??
    null;
  const headerMetrics = useMemo(
    () =>
      buildOutboundOperatorMetrics({
        orderCode: "EX-20260730-01",
        orderStatus: "sorting",
        carrierName: "Masan Logistics",
        bufferSlots: buildSortingSlotLegend(zoneLocations),
        goodsLegend: buildOutboundGoodsLegend(outboundOrders),
        robotRows: buildOutboundRobotRows(
          pendingTaskIds.length,
          selectedWaveName,
        ),
        compact: true,
      }),
    [outboundOrders, pendingTaskIds.length, selectedWaveName, zoneLocations],
  );

  const clockLabel = clock.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <OperatorPageHeader
        title="Đơn xuất và chia chọn"
        warehouseName={warehouseName}
        clockLabel={clockLabel}
        collapsible
        collapseShellHeader
        defaultCollapsed
        largeMetrics
        metrics={headerMetrics}
      />

      {!inDetailView ? (
        <SortingWaveOverviewPicker
          zoneId={12}
          waves={sortingWaves}
          loading={wavesLoading}
          onSelectWave={handleEnterWaveDetail}
          className="min-h-0 flex-1"
        />
      ) : (
        <SortingWaveStationBoard
          zoneId={zoneId}
          fillHeight
          className="min-h-0 flex-1"
          selectedWaveId={focusedWaveId}
          onSelectedWaveIdChange={setSelectedWaveId}
          hideWaveTabs
          onBack={handleBackToOverview}
          mapToolbarTitle={
            <h3 className="text-3xl font-black text-brand-dark">
              Bản đồ chia chọn & cửa xuất
            </h3>
          }
          mapToolbar={
            <>
              <div className="flex w-full flex-wrap justify-between items-center gap-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    icon={<ExportOutlined />}
                    onClick={() => void handleQuickPalletExport(1)}
                    loading={quickPalletExporting === 1}
                    disabled={
                      zoneId <= 0 ||
                      products.length === 0 ||
                      quickPalletExporting != null
                    }
                    className="!h-10 !px-4 !text-base"
                  >
                    Xuất 1 pallet
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<ExportOutlined />}
                    onClick={() => void handleQuickPalletExport(2)}
                    loading={quickPalletExporting === 2}
                    disabled={
                      zoneId <= 0 ||
                      products.length === 0 ||
                      quickPalletExporting != null
                    }
                    className="!h-10 !px-4 !text-base"
                  >
                    Xuất 2 pallet
                  </Button>
                </div>
                <Button
                  variant="secondary"
                  icon={<FileExcelOutlined />}
                  onClick={() => void handleExportMasanSO()}
                  loading={isExportingSO}
                  disabled={!selectedOrderId}
                  className="!h-10 !px-4 !text-base"
                >
                  Xuất SO
                </Button>
              </div>
            </>
          }
          emptyHint={
            <p className="text-sm text-slate-500">
              Không có board chia chọn để hiển thị. Liên hệ admin cấu hình tại{" "}
              <span className="font-semibold text-brand-dark">
                Quản lý chia chọn
              </span>
              .
            </p>
          }
          sideSlot={
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stripe-hairline px-4 py-3">
                <h3 className="text-3xl font-black text-brand-dark">
                  {selectedOrderId
                    ? selectedVehicleNumber
                      ? "Sản phẩm theo xe"
                      : "Xe chờ xuất"
                    : "Lệnh xuất"}
                </h3>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80">
                <OperatorOutboundOrderBrowser
                  zoneId={zoneId}
                  orders={outboundOrders}
                  vehicles={incompleteVehicles}
                  loading={vehiclesLoading || outboundOrdersLoading}
                  error={vehiclesError || outboundOrdersError}
                  selectedOrderId={selectedOrderId}
                  onSelectedOrderIdChange={setSelectedOrderId}
                  selectedVehicleNumber={selectedVehicleNumber}
                  onSelectVehicle={(plate) => {
                    setSelectedVehicleNumber(plate);
                    if (!plate) setSelectedProductLines([]);
                  }}
                  onSelectedProductsChange={setSelectedProductLines}
                />
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-stripe-hairline p-3">
                <Button
                  variant="secondary"
                  icon={<FileExcelOutlined />}
                  loading={isExportingDailyExcel}
                  disabled={zoneId <= 0}
                  onClick={() => void handleExportDailyExcel()}
                  className="!h-11 !w-full justify-center !text-base font-bold"
                >
                  Xuất báo cáo
                </Button>
                <Button
                  variant="primary"
                  icon={<RobotOutlined />}
                  disabled={pendingTaskIds.length === 0 || !focusedWaveId}
                  loading={sendTaskCommandsMutation.isPending}
                  onClick={handleCallRobot}
                  className="!h-10 !w-full justify-center !text-sm disabled:!bg-brand-primary/45 disabled:!text-white disabled:!opacity-100"
                >
                  Gọi robot xuất
                  {pendingTaskIds.length > 0
                    ? ` (${pendingTaskIds.length})`
                    : ""}
                </Button>
              </div>
              {selectedVehicleNumber && selectedProductLines.length > 0 ? (
                <p className="shrink-0 border-t border-stripe-hairline bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  Đã chọn{" "}
                  <span className="font-semibold text-brand-dark">
                    {selectedProductLines.length}
                  </span>{" "}
                  loại hàng · SL{" "}
                  <span className="font-semibold text-brand-dark">
                    {toDisplayInteger(
                      selectedProductLines.reduce(
                        (sum, row) => sum + (Number(row.total_quantity) || 0),
                        0,
                      ),
                    )}
                  </span>
                </p>
              ) : null}
            </div>
          }
        />
      )}

    </div>
  );
}
