import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import {
  DeleteOutlined,
  EyeOutlined,
  FileExcelOutlined,
  PlayCircleOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import WarehouseViewModal from "@/components/inbound/WarehouseViewModal";
import { Button, Modal, cn, message } from "@/components/ui";
import { OPERATOR_DESKTOP } from "@/constants/operatorDesktopSizes";
import { getApiErrorDetail } from "@/types/apiError";
import {
  clearMasanOutboundStationCacheApi,
  exportOutboundOrderReportApi,
  exportOutboundOrdersReportBulkApi,
  exportOutboundOrderSOApi,
} from "@/api/masan";
import {
  useOutboundTasksByWave,
  useSendOutboundTaskCommands,
} from "@/hooks/useOutboundTask";
import MasanVtLocationPickerModal from "@/components/outbound/MasanVtLocationPickerModal";
import SortingItemsNeededModal from "@/components/outbound/SortingItemsNeededModal";
import OperatorZoneCrossNavButton from "@/components/outbound/OperatorZoneCrossNavButton";
import SortingWaveStationBoard from "@/components/outbound/SortingWaveStationBoard";
import OperatorOutboundOrderBrowser, {
  type OutboundListFilterExportContext,
} from "@/components/outbound/OperatorOutboundOrderBrowser";
import OperatorOutboundLackedPanel from "@/components/outbound/OperatorOutboundLackedPanel";
import { useOperatorBoardOrders } from "@/hooks/useOutbound";
import type { OutboundSelectedProductLine } from "@/components/outbound/OperatorOutboundVehicleCards";
import { toDisplayInteger } from "@/utils/number";
import { useAppStore } from "@/store/useAppStore";
import {
  isOutboundDetailZoneId,
  outboundCcBucketZoneCodeFor,
  outboundClickableZoneIdsFor,
  outboundMapZoneIdsFor,
  outboundVtSortingZoneCodeFor,
} from "@/constants/outboundMapZones";
import { useMasanCcLocations } from "@/hooks/useMasanCcLocations";
import { masanSortingZoneCcLocationsQueryKey } from "@/hooks/useMasanSortingZoneCcLocations";
import { masanSortingZonePendingStockQueryKey } from "@/hooks/useMasanSortingZonePendingStock";
import { useMasanVtLocations } from "@/hooks/useMasanVtLocations";
import { useMasanVtSortingDispatch } from "@/hooks/useMasanVtSortingDispatch";
import type { MasanVtLocationPick } from "@/components/outbound/MasanVtLocationPickerModal";
import { useQueryClient } from "@tanstack/react-query";
import { RobotStatusPanel } from "@/components/layout/OperatorStatusMetricPanels";
import { useRobotData } from "@/hooks/useRobotData";
import { buildRobotStatusRows } from "@/utils/robotStatus";

export default function OperatorOutboundDetailPage() {
  const { zoneId: zoneIdStr } = useParams<{ zoneId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);

  const zoneId = Number(zoneIdStr);

  if (isNaN(zoneId) || !isOutboundDetailZoneId(zoneId)) {
    return <Navigate to="/export" replace />;
  }

  const warehouseId = selectedWarehouseId ?? 0;

  const robotData = useRobotData();
  const robotRows = buildRobotStatusRows(robotData.data, {
    isLoading: robotData.isLoading,
    isError: robotData.isError,
  });

  const [sideExportTab, setSideExportTab] = useState<"session" | "lacked">(
    "session",
  );
  const [isExportingSO, setIsExportingSO] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [listFilterExportContext, setListFilterExportContext] =
    useState<OutboundListFilterExportContext>({
      visibleOrderIds: [],
      hasSkuFilter: false,
      hasDateFilter: false,
      skuFilterLoading: false,
    });

  const handleListFilterExportContext = useCallback(
    (ctx: OutboundListFilterExportContext) => {
      setListFilterExportContext(ctx);
    },
    [],
  );

  const hasActiveOutboundFilters =
    listFilterExportContext.hasDateFilter ||
    listFilterExportContext.hasSkuFilter;
  const [warehouseViewOpen, setWarehouseViewOpen] = useState(false);
  const [vtPickerOpen, setVtPickerOpen] = useState(false);
  const [dispatchVt, setDispatchVt] = useState<MasanVtLocationPick | null>(
    null,
  );
  const [sortingItemsModalOpen, setSortingItemsModalOpen] = useState(false);
  const [isClearingStation, setIsClearingStation] = useState(false);

  const {
    locations: vtLocations,
    vtZoneIds,
    isLoading: vtLocationsLoading,
    failedZoneIds: vtLocationFailedZoneIds,
  } = useMasanVtLocations(zoneId);
  const ccBucketZoneCode = outboundCcBucketZoneCodeFor(zoneId) ?? "";
  const vtSortingZoneCode = outboundVtSortingZoneCodeFor(zoneId) ?? "";
  const {
    locationIds: ccLocationIds,
    ccZoneIds,
    isLoading: ccLocationsLoading,
  } = useMasanCcLocations(zoneId);
  const runVtSortingDispatch = useMasanVtSortingDispatch(zoneId, warehouseId);

  const ordersQuery = useOperatorBoardOrders(warehouseId);
  const boardOrders = ordersQuery.data?.items ?? [];
  const sessionOrderCount = boardOrders.length;

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedVehicleNumber, setSelectedVehicleNumber] = useState<
    string | null
  >(null);
  const [selectedProductLines, setSelectedProductLines] = useState<
    OutboundSelectedProductLine[]
  >([]);

  const exportSoOrderId = useMemo(
    () => selectedOrderId ?? boardOrders[0]?.id ?? null,
    [selectedOrderId, boardOrders],
  );

  useEffect(() => {
    setSelectedOrderId(null);
    setSelectedVehicleNumber(null);
    setSelectedProductLines([]);
  }, [zoneId]);

  const { data: waveTasks = [] } = useOutboundTasksByWave(zoneId);
  const sendTaskCommandsMutation = useSendOutboundTaskCommands(zoneId, zoneId);

  const pendingTaskIds = useMemo(
    () =>
      waveTasks
        .filter((task) => task.status === "pending" && (task.node_id ?? 0) > 0)
        .map((task) => task.id),
    [waveTasks],
  );

  const handleExportMasanSO = async () => {
    if (exportSoOrderId == null) {
      message.warning("Không có đơn xuất nào để xuất SO");
      return;
    }
    setIsExportingSO(true);
    try {
      message.loading({ content: "Đang xuất SO...", key: "masan-outbound-so" });
      await exportOutboundOrderSOApi(exportSoOrderId);
      const orderCode =
        boardOrders.find((o) => o.id === exportSoOrderId)?.order_code ??
        String(exportSoOrderId);
      message.success({
        content: `Đã tải file SO (${orderCode})`,
        key: "masan-outbound-so",
      });
    } catch (err: unknown) {
      message.error({
        content: getApiErrorDetail(err, "Không thể xuất SO"),
        key: "masan-outbound-so",
      });
    } finally {
      setIsExportingSO(false);
    }
  };

  const handleVtPickerSelect = useCallback((pick: MasanVtLocationPick) => {
    setDispatchVt(pick);
    setSortingItemsModalOpen(true);
  }, []);

  const closeDispatchFlow = useCallback(() => {
    setSortingItemsModalOpen(false);
    setDispatchVt(null);
  }, []);

  const invalidateMasanMapCaches = useCallback(() => {
    if (warehouseId <= 0 || !ccBucketZoneCode) return;
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
    void queryClient.invalidateQueries({ queryKey: ["warehouseMap"] });
    void queryClient.invalidateQueries({ queryKey: ["zone_map_status"] });
    void queryClient.invalidateQueries({
      queryKey: ["outbound_operator_board_orders"],
    });
  }, [ccBucketZoneCode, queryClient, warehouseId]);

  const handleClearStation = useCallback(() => {
    if (warehouseId <= 0) {
      message.warning("Chọn kho trước khi xóa cache station");
      return;
    }
    if (ccLocationsLoading) {
      message.info("Đang tải danh sách ô CC…");
      return;
    }
    if (ccLocationIds.length === 0) {
      message.warning(
        ccZoneIds.length > 0
          ? `Không có ô CC trên map zone ${ccZoneIds.join(", ")}`
          : "Khu chia chọn không hợp lệ",
      );
      return;
    }

    Modal.confirm({
      title: "Xóa cache station xuất",
      width: OPERATOR_DESKTOP.modal.default,
      okText: "Xóa cache",
      okButtonProps: { danger: true },
      cancelText: "Hủy",
      content: (
        <div className="mt-2 space-y-2 text-sm text-slate-600">
          <p>
            Xóa cache gán hàng / pending tại{" "}
            <strong>{ccLocationIds.length}</strong> ô CC
            {ccBucketZoneCode ? (
              <>
                {" "}
                (<span className="font-mono">{ccBucketZoneCode}</span>)
              </>
            ) : null}
            .
          </p>
        </div>
      ),
      onOk: async () => {
        setIsClearingStation(true);
        try {
          const result = await clearMasanOutboundStationCacheApi({
            warehouse_id: warehouseId,
            cc_location_ids: ccLocationIds,
          });
          const total =
            result.assigned_cc_location +
            result.assigned_cc_details +
            result.stock_ready +
            result.orphan_details;
          message.success(
            total > 0
              ? `Đã xóa cache station (${total} mục)`
              : "Không còn cache station cho các ô CC này",
          );
          invalidateMasanMapCaches();
        } catch (err: unknown) {
          message.error(
            getApiErrorDetail(err, "Không xóa được cache station"),
          );
          throw err;
        } finally {
          setIsClearingStation(false);
        }
      },
    });
  }, [
    ccBucketZoneCode,
    ccLocationIds,
    ccLocationsLoading,
    ccZoneIds,
    invalidateMasanMapCaches,
    warehouseId,
  ]);

  const handleCallRobot = () => {
    if (pendingTaskIds.length === 0) {
      message.warning("Không có task chờ gửi robot trong khu vực hiện tại.");
      return;
    }

    Modal.confirm({
      title: "Xác nhận gọi robot xuất",
      width: OPERATOR_DESKTOP.modal.default,
      content: (
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          <p>
            Gửi lệnh xuống robot cho <strong>{pendingTaskIds.length}</strong>{" "}
            task của khu vực hiện tại.
          </p>
          <p>Chỉ gửi các task đã có node đích được cấu hình.</p>
        </div>
      ),
      okText: "Gửi lệnh",
      cancelText: "Hủy",
      onOk: () => {
        console.log(
          `[CallRobot] Cần gọi API gửi ${pendingTaskIds.length} task xuống robot. Danh sách task:`,
          pendingTaskIds,
        );
        message.success(
          `Đã log danh sách ${pendingTaskIds.length} task ra console (chờ API Backend)`,
        );
      },
    });
  };

  const handleExportReport = async () => {
    if (warehouseId <= 0) {
      message.warning("Vui lòng chọn kho trước khi xuất");
      return;
    }

    setIsExportingReport(true);
    try {
      message.loading({
        content: "Đang xuất Excel...",
        key: "masan-outbound-export",
      });

      if (selectedOrderId != null) {
        await exportOutboundOrderReportApi(selectedOrderId);
        const orderCode =
          boardOrders.find((o) => o.id === selectedOrderId)?.order_code ??
          String(selectedOrderId);
        message.success({
          content: `Đã tải báo cáo xuất Masan (${orderCode})`,
          key: "masan-outbound-export",
        });
        return;
      }

      const orderIds = hasActiveOutboundFilters
        ? listFilterExportContext.visibleOrderIds
        : listFilterExportContext.visibleOrderIds.length > 0
          ? listFilterExportContext.visibleOrderIds
          : boardOrders.map((o) => o.id);

      if (orderIds.length === 0) {
        message.warning({
          content: "Không có đơn xuất nào để xuất báo cáo",
          key: "masan-outbound-export",
        });
        return;
      }

      if (orderIds.length === 1) {
        await exportOutboundOrderReportApi(orderIds[0]!);
        const orderCode =
          boardOrders.find((o) => o.id === orderIds[0])?.order_code ??
          String(orderIds[0]);
        message.success({
          content: `Đã tải báo cáo xuất Masan (${orderCode})`,
          key: "masan-outbound-export",
        });
        return;
      }

      await exportOutboundOrdersReportBulkApi(orderIds);
      message.success({
        content: `Đã tải báo cáo xuất Masan (${orderIds.length} đơn)`,
        key: "masan-outbound-export",
      });
    } catch (err: unknown) {
      message.error({
        content: getApiErrorDetail(err, "Không thể xuất báo cáo Excel"),
        key: "masan-outbound-export",
      });
    } finally {
      setIsExportingReport(false);
    }
  };

  const exportReportDisabled =
    isExportingReport ||
    (selectedOrderId == null &&
      (hasActiveOutboundFilters
        ? listFilterExportContext.visibleOrderIds.length === 0 ||
          listFilterExportContext.skuFilterLoading
        : boardOrders.length === 0 &&
          listFilterExportContext.visibleOrderIds.length === 0));

  const exportReportDisabledTitle =
    selectedOrderId != null
      ? undefined
      : listFilterExportContext.skuFilterLoading
        ? "Đang lọc theo mã hàng..."
        : hasActiveOutboundFilters &&
            listFilterExportContext.visibleOrderIds.length === 0
          ? "Không có đơn khớp bộ lọc"
          : boardOrders.length === 0 &&
              listFilterExportContext.visibleOrderIds.length === 0
            ? "Không có đơn xuất trong phiên"
            : undefined;

  const handleBackToOverview = () => {
    navigate("/export");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-slate-50">
      <SortingWaveStationBoard
        zoneId={zoneId}
        mapZoneIds={outboundMapZoneIdsFor(zoneId)}
        warehouseId={selectedWarehouseId}
        clickableZoneIds={outboundClickableZoneIdsFor(zoneId)}
        fillHeight
        className="min-h-0 flex-1"
        selectedWaveId={zoneId}
        onSelectedWaveIdChange={() => {}}
        hideWaveTabs
        onBack={handleBackToOverview}
        mapToolbarTitle={
          <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-2">
            <h3 className="text-3xl font-black text-brand-dark">
              Vị trí chia chọn
            </h3>
            <div
              role="status"
              aria-live="polite"
              aria-label="Trạng thái robot"
            >
              <RobotStatusPanel rows={robotRows} compact inline />
            </div>
          </div>
        }
        mapToolbar={
          <>
            <Button
              variant="primary"
              icon={<PlayCircleOutlined />}
              onClick={() => setVtPickerOpen(true)}
              disabled={warehouseId <= 0 || !ccBucketZoneCode}
              className="!h-10 !px-4 !text-base"
            >
              Gọi lệnh
            </Button>
            <Button
              variant="secondary"
              icon={<DeleteOutlined />}
              loading={isClearingStation}
              disabled={
                warehouseId <= 0 ||
                !ccBucketZoneCode ||
                ccLocationsLoading ||
                ccLocationIds.length === 0
              }
              onClick={handleClearStation}
              className="!h-10 !px-4 !text-base"
            >
              Clear station
            </Button>
            <OperatorZoneCrossNavButton target="monitor" displayZoneId={zoneId} />
            <Button
              variant="secondary"
              icon={<EyeOutlined />}
              onClick={() => setWarehouseViewOpen(true)}
              disabled={warehouseId <= 0}
              className="!h-10 !px-4 !text-base"
            >
              Xem kho
            </Button>
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
            <div className="flex shrink-0 items-stretch gap-0 overflow-x-auto border-b border-stripe-hairline bg-panel-soft">
              {(
                [
                  {
                    key: "session" as const,
                    label: "Phiên",
                    count: sessionOrderCount,
                  },
                  {
                    key: "lacked" as const,
                    label: "Hàng thiếu",
                    count: null as number | null,
                  },
                ] as const
              ).map((tab) => {
                const active = sideExportTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSideExportTab(tab.key)}
                    className={cn(
                      "relative flex min-h-12 min-w-[140px] flex-1 items-center justify-center gap-2 px-4 py-2.5 font-bold transition-all",
                      active
                        ? "z-10 -mb-px border border-stripe-hairline border-b-white bg-white text-brand-primary shadow-[0_1px_0_0_#fff]"
                        : "border border-transparent text-stripe-ink-mute hover:bg-white/50 hover:text-brand-dark",
                    )}
                  >
                    <span className="truncate text-2xl">{tab.label}</span>
                    {tab.key === "session" && tab.count != null ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums",
                          active
                            ? "bg-brand-primary/15 text-brand-primary"
                            : "bg-slate-200/80 text-slate-500",
                        )}
                      >
                        {tab.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {sideExportTab === "session" ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stripe-hairline px-4 py-2">
                  <h3 className="text-xl font-black text-brand-dark">
                    {selectedOrderId
                      ? selectedVehicleNumber
                        ? "Sản phẩm theo xe"
                        : "Xe chờ xuất"
                      : "Danh sách đơn"}
                  </h3>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80">
                  <OperatorOutboundOrderBrowser
                    warehouseId={warehouseId}
                    selectedOrderId={selectedOrderId}
                    onSelectedOrderIdChange={setSelectedOrderId}
                    selectedVehicleNumber={selectedVehicleNumber}
                    onSelectVehicle={(plate) => {
                      setSelectedVehicleNumber(plate);
                      if (!plate) setSelectedProductLines([]);
                    }}
                    onSelectedProductsChange={setSelectedProductLines}
                    onListFilterExportContext={handleListFilterExportContext}
                  />
                </div>
                <div className="shrink-0 space-y-2 border-t border-stripe-hairline p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      icon={<FileExcelOutlined />}
                      loading={isExportingReport}
                      disabled={warehouseId <= 0 || exportReportDisabled}
                      title={exportReportDisabledTitle}
                      onClick={() => void handleExportReport()}
                      className="!h-11 !w-full justify-center !text-base font-bold"
                    >
                      Xuất báo cáo
                    </Button>
                    <Button
                      variant="secondary"
                      icon={<FileExcelOutlined />}
                      loading={isExportingSO}
                      disabled={warehouseId <= 0 || exportSoOrderId == null}
                      onClick={() => void handleExportMasanSO()}
                      className="!h-11 !w-full justify-center !text-base font-bold"
                    >
                      Xuất SO
                    </Button>
                  </div>
                  <Button
                    variant="primary"
                    icon={<RobotOutlined />}
                    disabled={pendingTaskIds.length === 0}
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
                          (sum, row) =>
                            sum + (Number(row.total_quantity) || 0),
                          0,
                        ),
                      )}
                    </span>
                  </p>
                ) : null}
              </>
            ) : (
              <OperatorOutboundLackedPanel
                warehouseId={warehouseId}
                enabled={sideExportTab === "lacked"}
              />
            )}
          </div>
        }
      />
      <WarehouseViewModal
        open={warehouseViewOpen}
        warehouseId={warehouseId}
        onClose={() => setWarehouseViewOpen(false)}
      />
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
      />
      {warehouseId > 0 && ccBucketZoneCode && dispatchVt ? (
        <SortingItemsNeededModal
          open={sortingItemsModalOpen}
          onClose={closeDispatchFlow}
          warehouseId={warehouseId}
          ccBucketZoneCode={ccBucketZoneCode}
          sortingZoneCode={vtSortingZoneCode}
          title={`Chọn mã hàng — ${dispatchVt.locationName}`}
          subtitle={`Vị trí VT: ${dispatchVt.locationCode}`}
          onConfirmExport={async (picked) => {
            await runVtSortingDispatch(picked, dispatchVt.locationId);
          }}
        />
      ) : null}
    </div>
  );
}
