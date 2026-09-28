import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Navigate } from "react-router-dom";
import {
  ExportOutlined,
  FileExcelOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import { Button, Modal, message } from "@/components/ui";
import { OPERATOR_DESKTOP } from "@/constants/operatorDesktopSizes";
import { useProduct } from "@/hooks/useProduct";
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
import OperatorOutboundOrderBrowser from "@/components/outbound/OperatorOutboundOrderBrowser";
import type { OutboundSelectedProductLine } from "@/components/outbound/OperatorOutboundVehicleCards";
import { toDisplayInteger } from "@/utils/number";
import {
  buildQuickPalletDetailGroups,
  pickQuickExportProduct,
} from "@/utils/quickPalletOutbound";
import { useQueryClient } from "@tanstack/react-query";

export default function OperatorOutboundDetailPage() {
  const { zoneId: zoneIdStr } = useParams<{ zoneId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const zoneId = Number(zoneIdStr);

  // Validate URL param
  if (isNaN(zoneId) || (zoneId !== 12 && zoneId !== 13)) {
    return <Navigate to="/export" replace />;
  }

  const { data: products = [] } = useProduct(zoneId);
  const createOutboundOrderMutation = useCreateOutboundOrder();

  const [quickPalletExporting, setQuickPalletExporting] = useState<
    12 | 13 | null
  >(null);
  const [isExportingSO, setIsExportingSO] = useState(false);
  const [isExportingDailyExcel, setIsExportingDailyExcel] = useState(false);

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

  const {
    data: incompleteVehiclesData,
    isLoading: vehiclesLoading,
    isError: vehiclesError,
  } = useIncompleteVehicles(zoneId);
  const incompleteVehicles = incompleteVehiclesData?.vehicles ?? [];

  const {
    data: outboundOrders = [],
    isLoading: outboundOrdersLoading,
    isError: outboundOrdersError,
  } = useOutboundList(zoneId);

  // Still using the wave API hooks, but mapping them logically to zoneId for now, 
  // as the wave concept is being removed. For now, waveId = zoneId.
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

    // TODO: Tích hợp API tạo đơn demo ở đây
    console.log(
      `[Demo] Gọi API tạo đơn xuất ${palletCount} pallet cho sản phẩm ${product.id}`,
    );
    message.success(`Đã chạy giả lập log tạo đơn xuất ${palletCount} pallet`);
  };

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
        // TODO: Backend chưa có API send-commands
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
    // Giả lập delay
    await new Promise(r => setTimeout(r, 1000));
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
        fillHeight
        className="min-h-0 flex-1"
        selectedWaveId={zoneId}
        onSelectedWaveIdChange={() => { }}
        hideWaveTabs
        onBack={handleBackToOverview}
        mapToolbarTitle={
          <h3 className="text-3xl font-black text-brand-dark">
            Bản đồ chia chọn & cửa xuất (Khu vực {zoneId})
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
    </div>
  );
}
