import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import {
  EyeOutlined,
  FileExcelOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import WarehouseViewModal from "@/components/inbound/WarehouseViewModal";
import { Button, Modal, cn, message } from "@/components/ui";
import { OPERATOR_DESKTOP } from "@/constants/operatorDesktopSizes";
import { getApiErrorDetail } from "@/types/apiError";
import {
  exportOutboundOrderSOApi,
  masanSortingOutboundDispatchApi,
} from "@/api/masan";
import {
  useOutboundTasksByWave,
  useSendOutboundTaskCommands,
  outboundTasksByWaveQueryKey,
} from "@/hooks/useOutboundTask";
import SortingWaveStationBoard from "@/components/outbound/SortingWaveStationBoard";
import OperatorOutboundOrderBrowser from "@/components/outbound/OperatorOutboundOrderBrowser";
import OperatorOutboundLackedPanel from "@/components/outbound/OperatorOutboundLackedPanel";
import {
  operatorRecentLackedQueryKey,
  useOperatorBoardOrders,
} from "@/hooks/useOutbound";
import type { OutboundSelectedProductLine } from "@/components/outbound/OperatorOutboundVehicleCards";
import type { MasanSortingItemNeededRow } from "@/types/masan";
import { toDisplayInteger } from "@/utils/number";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import {
  isOutboundDetailZoneId,
  outboundClickableZoneIdsFor,
  outboundMapZoneIdsFor,
} from "@/constants/outboundMapZones";
import { masanSortingItemsNeededQueryKey } from "@/hooks/useMasanSortingItemsNeeded";
import { masanSortingZoneCcLocationsQueryKey } from "@/hooks/useMasanSortingZoneCcLocations";

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

  const [sideExportTab, setSideExportTab] = useState<"session" | "lacked">(
    "session",
  );
  const [isExportingSO, setIsExportingSO] = useState(false);
  const [isExportingDailyExcel, setIsExportingDailyExcel] = useState(false);
  const [warehouseViewOpen, setWarehouseViewOpen] = useState(false);

  const ordersQuery = useOperatorBoardOrders(warehouseId);
  const sessionOrderCount = ordersQuery.data?.items.length ?? 0;

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedVehicleNumber, setSelectedVehicleNumber] = useState<
    string | null
  >(null);
  const [selectedProductLines, setSelectedProductLines] = useState<
    OutboundSelectedProductLine[]
  >([]);

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

  const handleVtSortingExportConfirm = useCallback(
    async (
      picked: MasanSortingItemNeededRow[],
      context: {
        warehouseId: number;
        ccBucketZoneCode: string;
        toLocationId: number;
      },
    ) => {
      const row = picked[0];
      if (!row) return;

      let result;
      try {
        result = await masanSortingOutboundDispatchApi({
          warehouse_id: context.warehouseId,
          zone: context.ccBucketZoneCode,
          item_id: row.item_id,
          to_location_id: context.toLocationId,
        });
      } catch (err: unknown) {
        message.error(getApiErrorDetail(err, "Không gửi được lệnh xuất"));
        throw err;
      }

      if (result.lacked.length > 0) {
        message.warning(
          `Đã gửi lệnh xuất ${row.sku}; còn thiếu ${result.lacked.length} dòng sau calculate`,
        );
      } else {
        message.success(`Đã gửi lệnh xuất mã ${row.sku}`);
      }

      void queryClient.invalidateQueries({
        queryKey: masanSortingItemsNeededQueryKey(
          context.warehouseId,
          context.ccBucketZoneCode,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: masanSortingZoneCcLocationsQueryKey(
          context.warehouseId,
          context.ccBucketZoneCode,
        ),
      });
      void queryClient.invalidateQueries({ queryKey: ["warehouseMap"] });
      void queryClient.invalidateQueries({
        queryKey: outboundTasksByWaveQueryKey(zoneId),
      });
      void queryClient.invalidateQueries({ queryKey: ["outboundOrders"] });
      void queryClient.invalidateQueries({
        queryKey: ["outbound_operator_board_orders"],
      });
      void queryClient.invalidateQueries({
        queryKey: operatorRecentLackedQueryKey(context.warehouseId),
      });
    },
    [queryClient, zoneId],
  );

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

  const handleExportDailyExcel = async () => {
    setIsExportingDailyExcel(true);
    await new Promise((r) => setTimeout(r, 1000));
    setIsExportingDailyExcel(false);
    message.success("Xuất báo cáo thành công (giả lập)");
  };

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
        onVtSortingExportConfirm={handleVtSortingExportConfirm}
        fillHeight
        className="min-h-0 flex-1"
        selectedWaveId={zoneId}
        onSelectedWaveIdChange={() => {}}
        hideWaveTabs
        onBack={handleBackToOverview}
        mapToolbarTitle={
          <h3 className="text-3xl font-black text-brand-dark">
            Bản đồ chia chọn & cửa xuất
          </h3>
        }
        mapToolbar={
          <div className="flex w-full flex-wrap justify-end items-center gap-4">
            <Button
              variant="secondary"
              icon={<EyeOutlined />}
              onClick={() => setWarehouseViewOpen(true)}
              disabled={warehouseId <= 0}
              className="!h-10 !px-4 !text-base"
            >
              Xem kho
            </Button>
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
                  />
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-stripe-hairline p-3">
                  <Button
                    variant="secondary"
                    icon={<FileExcelOutlined />}
                    loading={isExportingDailyExcel}
                    disabled={warehouseId <= 0}
                    onClick={() => void handleExportDailyExcel()}
                    className="!h-11 !w-full justify-center !text-base font-bold"
                  >
                    Xuất báo cáo
                  </Button>
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
    </div>
  );
}
