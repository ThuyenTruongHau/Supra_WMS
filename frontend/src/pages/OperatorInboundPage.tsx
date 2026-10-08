import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { ColumnsType } from "antd/es/table";
import {
  ContainerOutlined,
  ExportOutlined,
  EyeOutlined,
  ClearOutlined,
  FileExcelOutlined,
  RobotOutlined,
  ScanOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Modal,
  Space,
  Table,
  cn,
  message,
} from "@/components/ui";
import { Select, Spin } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import {
  OPERATOR_DESKTOP,
  OPERATOR_INBOUND_MAP_TUNING,
  operatorDesktopClass,
  operatorDesktopTableWidths,
} from "@/constants/operatorDesktopSizes";
import AssignInboundBufferModal from "@/components/inbound/AssignInboundBufferModal";
import UnassignInboundBufferModal from "@/components/inbound/UnassignInboundBufferModal";
import OperatorMapCanvas, {
  type BufferCellClickPayload,
} from "@/components/warehouse/OperatorMapCanvas";
import OperatorInboundOrderBrowser from "@/components/inbound/OperatorInboundOrderBrowser";
import DirectOutboundFromInboundBoard from "@/components/inbound/DirectOutboundFromInboundBoard";
import InboundLocationInfoModal from "@/components/inbound/InboundLocationInfoModal";
import WarehouseViewModal from "@/components/inbound/WarehouseViewModal";
import AssignedRobotCallButton from "@/components/inbound/AssignedRobotCallButton";
import { RobotStatusPanel } from "@/components/layout/OperatorStatusMetricPanels";
import { useRobotData } from "@/hooks/useRobotData";
import { buildRobotStatusRows, type InboundRobot } from "@/utils/robotStatus";
import { clearMasanInboundZoneApi, exportInboundOrderMasanApi } from "@/api/masan";
import { useCallerMasanInbound } from "@/hooks/useMasanInbound";
import {
  useInboundBufferLocations,
  useStorageAreaLocations,
  useZonesMapStatus,
} from "@/hooks/useWarehouseMap";

import { useAppStore } from "@/store/useAppStore";

import {
  getInboundBufferAssignmentApi,
  getInboundDailyReportApi,
  parseMasanInboundExcelApi,
  suggestMasanAllocationApi,
  createMasanInboundOrderApi,
} from "@/api/inboundOperator";
import {
  useInboundAssignedDetails,
  useInboundList,
  useOldestIncompleteInbound,
} from "@/hooks/useInbound";
import { useLocationByCodeMap } from "@/hooks/useWarehouseLocation";
import type {
  InboundAssignedDetail,
  InboundBufferAssignment,
  MasanCreatePayload,
} from "@/types/inbound";
import { getApiErrorDetail } from "@/types/apiError";
import { SOURCE_TABS, type SourceTabKey } from "@/data/mockOperatorInbound";
import { toDisplayInteger } from "@/utils/number";
import {
  MAP_TAP_DOUBLE_WINDOW_MS,
  columnCodesEqual,
  mapTapSelectionKey,
} from "@/utils/mapTapGesture";

type SideListTab = "orders" | "commands";

/** Dòng preview import Masan trên operator (có field UI, strip trước khi POST). */
type MasanOperatorPreviewLine = MasanCreatePayload["line_items"][number] & {
  _preview_sku?: string;
  _preview_vehicle?: string;
  _preview_quantity?: number;
  _preview_from_location_name?: string;
  _preview_to_location_name?: string;
  /** Vị trí gợi ý ban đầu — luôn hiện trong dropdown đích dù ô đã có hàng. */
  _suggested_to_location_id?: number;
};

const INBOUND_MAP_ZONE_IDS = [2, 12];

const EMPTY_ASSIGNED_DETAILS: InboundAssignedDetail[] = [];

function isIncompleteInboundOrderStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase().replace(/-/g, "_");
  return normalized === "initialize" || normalized === "in_progress";
}

const SOURCE_TAB_META: Record<
  SourceTabKey,
  { icon: typeof ContainerOutlined; activeBadge: string }
> = {
  cont: {
    icon: ContainerOutlined,
    activeBadge: "bg-brand-primary/15 text-brand-primary",
  },
  direct: {
    icon: ExportOutlined,
    activeBadge: "bg-warning-100 text-warning-700",
  },
};

export default function OperatorInboundPage() {
  const warehouseId = useAppStore((s) => s.selectedWarehouseId);

  return <OperatorInboundPageContent warehouseId={warehouseId} />;
}

function OperatorInboundPageContent({ warehouseId }: { warehouseId: number }) {

  const { data } = useOldestIncompleteInbound(warehouseId);
  const { data: inboundOrders = [],
    isLoading: inboundOrdersLoading,
    isError: inboundOrdersError,
  } = useInboundList(warehouseId);
  const incompleteOrderIds = useMemo(
    () =>
      inboundOrders
        .filter((order) => isIncompleteInboundOrderStatus(order.status))
        .map((order) => order.id),
    [inboundOrders],
  );
  const { locationByCode } = useLocationByCodeMap(warehouseId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapLastTapRef = useRef<{ key: string; time: number } | null>(null);

  const [sourceTab, setSourceTab] = useState<SourceTabKey>("cont");
  const [warehouseViewOpen, setWarehouseViewOpen] = useState(false);
  const robotData = useRobotData(sourceTab === "cont");
  const robotRows = buildRobotStatusRows(robotData.data, {
    isLoading: robotData.isLoading,
    isError: robotData.isError,
  });
  const [sideListTab, setSideListTab] = useState<SideListTab>("orders");
  const { data: assignedPayload, isLoading: assignedLoading } =
    useInboundAssignedDetails(
      incompleteOrderIds,
      sideListTab === "commands" && incompleteOrderIds.length > 0,
    );
  const assignedDetails = assignedPayload?.details ?? EMPTY_ASSIGNED_DETAILS;
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [unassignModalOpen, setUnassignModalOpen] = useState(false);
  const [bufferAssignment, setBufferAssignment] =
    useState<InboundBufferAssignment | null>(null);
  const [selectedBufferCode, setSelectedBufferCode] = useState<string | null>(
    null,
  );
  const [selectedBufferLocationId, setSelectedBufferLocationId] = useState<
    number | null
  >(null);
  const [selectedAutoColumnCodes, setSelectedAutoColumnCodes] = useState<
    string[]
  >([]);
  const selectedAutoColumnCodesRef = useRef(selectedAutoColumnCodes);
  selectedAutoColumnCodesRef.current = selectedAutoColumnCodes;
  const selectedBufferCodeRef = useRef(selectedBufferCode);
  selectedBufferCodeRef.current = selectedBufferCode;
  const [locationInfoOpen, setLocationInfoOpen] = useState(false);
  const [infoLocationId, setInfoLocationId] = useState<number | null>(null);

  const [isMasanImporting, setIsMasanImporting] = useState(false);
  const [isMasanPreviewOpen, setIsMasanPreviewOpen] = useState(false);
  const [masanDraftPayload, setMasanDraftPayload] = useState<MasanCreatePayload | null>(null);
  const [masanPreviewData, setMasanPreviewData] = useState<
    MasanOperatorPreviewLine[]
  >([]);

  const [isExportingDailyExcel, setIsExportingDailyExcel] = useState(false);
  const [isExportingDetailReport, setIsExportingDetailReport] = useState(false);
  const [isClearingStation, setIsClearingStation] = useState(false);
  const [focusedInboundOrderId, setFocusedInboundOrderId] = useState<
    number | null
  >(null);

  const callerMutation = useCallerMasanInbound();
  const queryClient = useQueryClient();
  const { data: bufferLocationsData, isLoading: bufferLocationsLoading } =
    useInboundBufferLocations(warehouseId, isMasanPreviewOpen);
  const { data: storageLocationsData, isLoading: storageLocationsLoading } =
    useStorageAreaLocations(warehouseId, isMasanPreviewOpen);
  const inboundMapStatus = useZonesMapStatus(INBOUND_MAP_ZONE_IDS);
  const inboundLocationIdByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const cell of inboundMapStatus.items) {
      map.set(cell.location_code, cell.id);
    }
    return map;
  }, [inboundMapStatus.items]);
  const callerLocationIds = useMemo(() => {
    if (mode === "manual") {
      return selectedBufferLocationId != null ? [selectedBufferLocationId] : [];
    }
    const codes =
      selectedAutoColumnCodes.length > 0
        ? selectedAutoColumnCodes
        : [...inboundLocationIdByCode.keys()];
    const ids = codes
      .map((code) => inboundLocationIdByCode.get(code))
      .filter((id): id is number => id != null);
    return [...new Set(ids)];
  }, [
    mode,
    selectedBufferLocationId,
    inboundLocationIdByCode,
    selectedAutoColumnCodes,
  ]);

  /** Sơ đồ operator vẽ zone 2+3; tra cứu id theo status map đó, không theo warehouseId. */
  const resolveInboundMapLocationId = (locationCode: string): number | null => {
    const fromInboundMap = inboundLocationIdByCode.get(locationCode);
    if (fromInboundMap != null) return fromInboundMap;
    return locationByCode[locationCode]?.id ?? null;
  };

  const resetImportState = () => {
    setMasanDraftPayload(null);
    setMasanPreviewData([]);
  };

  const closeImportPreview = () => {
    setIsMasanPreviewOpen(false);
    resetImportState();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (warehouseId <= 0) {
      message.error("Vui lòng chọn kho trước khi import");
      return;
    }

    setIsMasanImporting(true);
    resetImportState();

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('warehouse_id', warehouseId.toString());
      console.log("cont test", warehouseId)
      formData.append('inbound_type', 'auto');

      const parseResult = await parseMasanInboundExcelApi(formData);

      const errors = parseResult.preview_rows.filter((r: any) => r.error !== null);
      if (errors.length > 0) {
        Modal.error({
          title: "Lỗi file Excel",
          width: OPERATOR_DESKTOP.modal.sm,
          destroyOnHidden: true,
          content: (
            <ul className={`mt-2 ${operatorDesktopClass.listMax64} list-disc space-y-1 overflow-y-auto pl-5 text-sm`}>
              {errors.map((err: any, index: number) => (
                <li key={index}>
                  Dòng {err.row_no}: {err.error}
                </li>
              ))}
            </ul>
          ),
        });
        return;
      }

      if (!parseResult.suggest_allocation || parseResult.suggest_allocation.line_items.length === 0) {
        message.error("Không có dòng dữ liệu hợp lệ để tạo đơn.");
        return;
      }

      const suggestResult = await suggestMasanAllocationApi(parseResult.suggest_allocation);

      const orderCode = `IN-${dayjs().format("YYYYMMDD-HHmmss")}`;
      const createPayload: MasanCreatePayload = {
        order_code: orderCode,
        note: "Import Masan",
        warehouse_id: warehouseId,
        details: {
          source: "masan_import",
          total_rows: parseResult.total_rows,
          valid_rows: parseResult.valid_rows,
          invalid_rows: parseResult.invalid_rows
        },
        line_items: parseResult.suggest_allocation.line_items.map((line, i) => {
          const suggestedLine = suggestResult.line_items[i];
          const fromId = line.details.from_location_id as number | undefined;
          return {
            from_location_id: fromId ?? 0,
            to_location_id: suggestedLine.target_location_id,
            details: line.details,
            allocations: suggestedLine.line_items,
            _preview_sku: line.details.sku,
            _preview_vehicle: line.details.vehicle_no,
            _preview_quantity: suggestedLine.line_items.reduce(
              (sum, item) => sum + item.quantity,
              0,
            ),
            _preview_to_location_name: suggestedLine.target_location_name,
            _suggested_to_location_id: suggestedLine.target_location_id,
            _preview_from_location_name:
              typeof line.details.from_location_name === "string"
                ? line.details.from_location_name
                : undefined,
          };
        }),
      };

      setMasanDraftPayload(createPayload);
      setMasanPreviewData(createPayload.line_items);
      setIsMasanPreviewOpen(true);
    } catch (err: unknown) {
      message.error(getApiErrorDetail(err, "Không thể đọc hoặc phân bổ vị trí từ file Excel"));
    } finally {
      setIsMasanImporting(false);
    }
  };

  const bufferLocationOptions = useMemo(
    () =>
      (bufferLocationsData?.items ?? []).map((loc) => ({
        value: loc.id,
        label: `${loc.location_code}${loc.location_name ? ` — ${loc.location_name}` : ""}`,
      })),
    [bufferLocationsData],
  );

  const storageLocationOptions = useMemo(() => {
    const suggestedIds = new Set(
      masanPreviewData
        .map((row) => row._suggested_to_location_id ?? row.to_location_id)
        .filter((id): id is number => id != null && id > 0),
    );
    return (storageLocationsData?.items ?? [])
      .filter(
        (loc) =>
          loc.status === "empty" ||
          loc.status == null ||
          suggestedIds.has(loc.id),
      )
      .map((loc) => ({
        value: loc.id,
        label: `${loc.location_code}${loc.location_name ? ` — ${loc.location_name}` : ""}${
          loc.status === "has_stock" ? " (có hàng)" : ""
        }`,
      }));
  }, [storageLocationsData, masanPreviewData]);

  const updateMasanPreviewLine = useCallback(
    (index: number, patch: Partial<MasanOperatorPreviewLine>) => {
      setMasanPreviewData((prev) =>
        prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
      );
      setMasanDraftPayload((prev) => {
        if (!prev) return prev;
        const line_items = prev.line_items.map((row, i) =>
          i === index ? { ...row, ...patch } : row,
        ) as MasanCreatePayload["line_items"];
        return { ...prev, line_items };
      });
    },
    [],
  );

  const masanImportPreviewColumns: ColumnsType<MasanOperatorPreviewLine> =
    useMemo(
      () => [
        {
          title: "SKU",
          dataIndex: "_preview_sku",
          key: "sku",
          width: 120,
        },
        {
          title: "Số xe",
          dataIndex: "_preview_vehicle",
          key: "vehicle",
          width: 100,
        },
        {
          title: "Điểm cấp",
          key: "from_location",
          width: 220,
          render: (_: unknown, record, index) => (
            <Select
              className="w-full min-w-[200px]"
              showSearch
              optionFilterProp="label"
              placeholder="Chọn điểm cấp..."
              value={record.from_location_id > 0 ? record.from_location_id : undefined}
              options={bufferLocationOptions}
              loading={bufferLocationsLoading}
              onChange={(val) => {
                const loc = bufferLocationsData?.items.find(
                  (item) => item.id === Number(val),
                );
                updateMasanPreviewLine(index, {
                  from_location_id: Number(val),
                  _preview_from_location_name:
                    loc?.location_name || loc?.location_code,
                });
              }}
            />
          ),
        },
        {
          title: "Điểm đích (kho cất)",
          key: "to_location",
          width: 240,
          render: (_: unknown, record, index) => (
            <Select
              className="w-full min-w-[220px]"
              showSearch
              optionFilterProp="label"
              placeholder="Chọn vị trí cất..."
              value={record.to_location_id > 0 ? record.to_location_id : undefined}
              options={storageLocationOptions}
              loading={storageLocationsLoading}
              onChange={(val) => {
                const loc = storageLocationsData?.items.find(
                  (item) => item.id === Number(val),
                );
                updateMasanPreviewLine(index, {
                  to_location_id: Number(val),
                  _preview_to_location_name:
                    loc?.location_name || loc?.location_code,
                });
              }}
            />
          ),
        },
        {
          title: "Số lượng",
          dataIndex: "_preview_quantity",
          key: "qty",
          width: 88,
          align: "right",
          render: (qty: number | undefined) =>
            qty != null ? toDisplayInteger(qty) : "—",
        },
      ],
      [
        bufferLocationOptions,
        bufferLocationsData?.items,
        bufferLocationsLoading,
        storageLocationOptions,
        storageLocationsData?.items,
        storageLocationsLoading,
        updateMasanPreviewLine,
      ],
    );

  const handleConfirmImport = async () => {
    if (!masanDraftPayload) return;

    const invalidLine = masanDraftPayload.line_items.findIndex(
      (line) => !line.from_location_id || !line.to_location_id,
    );
    if (invalidLine >= 0) {
      message.warning(
        `Dòng ${invalidLine + 1}: vui lòng chọn đủ điểm cấp và điểm đích.`,
      );
      return;
    }

    const apiPayload: MasanCreatePayload = {
      ...masanDraftPayload,
      line_items: masanDraftPayload.line_items.map(
        ({ from_location_id, to_location_id, details, allocations }) => ({
          from_location_id,
          to_location_id,
          details,
          allocations,
        }),
      ),
    };

    setIsMasanImporting(true);
    try {
      await createMasanInboundOrderApi(apiPayload, "auto");
      message.success("Import đơn nhập Masan thành công!");
      setIsMasanPreviewOpen(false);
      resetImportState();
      queryClient.invalidateQueries({ queryKey: ["inbound-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inbound", "oldest-incomplete"] });
    } catch (err: unknown) {
      message.error(getApiErrorDetail(err, "Không thể tạo đơn nhập từ file Excel"));
    } finally {
      setIsMasanImporting(false);
    }
  };

  const handleClearStation = () => {
    if (warehouseId <= 0) {
      message.warning("Vui lòng chọn kho trước khi clear station");
      return;
    }
    Modal.confirm({
      title: "Clear station (zone inbound)",
      content:
        "Tắt toàn bộ tồn active tại các zone inbound (buffer nhập) để bắt đầu phiên mới. Thao tác không xóa đơn nhập. Tiếp tục?",
      okText: "Clear",
      cancelText: "Hủy",
      okButtonProps: { danger: true },
      onOk: async () => {
        setIsClearingStation(true);
        try {
          const res = await clearMasanInboundZoneApi({ warehouse_id: warehouseId });
          message.success(
            res.deactivated_count > 0
              ? `Đã clear station (${res.zones.join(", ")}): ${res.deactivated_count} dòng tồn`
              : "Không còn tồn active nào trong zone inbound",
          );
          void queryClient.invalidateQueries({ queryKey: ["warehouseMap"] });
        } catch (err: unknown) {
          message.error(getApiErrorDetail(err, "Không clear được station"));
          throw err;
        } finally {
          setIsClearingStation(false);
        }
      },
    });
  };

  const handleExportDailyExcel = async () => {
    if (warehouseId <= 0) {
      message.warning("Vui lòng chọn kho trước khi xuất");
      return;
    }

    setIsExportingDailyExcel(true);
    try {
      const report = await getInboundDailyReportApi(warehouseId);
      if (report.lines.length === 0) {
        message.warning("Không có đơn nhập nào được tạo hôm nay để xuất");
        return;
      }
      const { downloadInboundDailyReportExcel } =
        await import("@/utils/inboundDetailExport");
      downloadInboundDailyReportExcel(report);
      message.success(
        `Đã xuất báo cáo nhập theo ngày (${report.lines.length} dòng)`,
      );
    } catch (err: unknown) {
      message.error(getApiErrorDetail(err, "Không thể xuất báo cáo Excel"));
    } finally {
      setIsExportingDailyExcel(false);
    }
  };

  const handleExportDetailReport = async () => {
    const exportOrderId =
      focusedInboundOrderId ?? inboundOrders[0]?.id ?? null;
    if (exportOrderId == null) {
      message.warning("Không có đơn nhập nào để xuất báo cáo");
      return;
    }

    setIsExportingDetailReport(true);
    try {
      message.loading({ content: "Đang xuất Excel...", key: "masan-inbound-export" });
      await exportInboundOrderMasanApi(exportOrderId);
      const orderCode =
        inboundOrders.find((o) => o.id === exportOrderId)?.order_code ??
        String(exportOrderId);
      message.success({
        content: `Đã tải báo cáo nhập Masan (${orderCode})`,
        key: "masan-inbound-export",
      });
    } catch (err: unknown) {
      message.error({
        content: getApiErrorDetail(err, "Không thể xuất báo cáo Excel"),
        key: "masan-inbound-export",
      });
    } finally {
      setIsExportingDetailReport(false);
    }
  };

  const openBufferAssignFlow = async (payload: BufferCellClickPayload) => {
    if (!data?.order?.id) {
      message.warning("Không có đơn nhập đang xử lý trong kho này.");
      return;
    }
    const locationId = resolveInboundMapLocationId(payload.locationCode);
    if (locationId == null) {
      message.error(
        `Không tìm thấy warehouse location cho mã ${payload.locationCode}`,
      );
      return;
    }
    setSelectedBufferCode(payload.locationCode);
    setSelectedBufferLocationId(locationId);

    try {
      const assignment = await getInboundBufferAssignmentApi(locationId);
      if (assignment.is_assigned) {
        setBufferAssignment(assignment);
        setUnassignModalOpen(true);
        setAssignModalOpen(false);
        return;
      }
      setBufferAssignment(null);
      setUnassignModalOpen(false);
      setAssignModalOpen(true);
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Không kiểm tra được trạng thái gán ô";
      message.error(detail);
    }
  };

  const openLocationInfo = (payload: BufferCellClickPayload) => {
    const locationId = resolveInboundMapLocationId(payload.locationCode);
    if (locationId == null) {
      message.error(
        `Không tìm thấy warehouse location cho mã ${payload.locationCode}`,
      );
      return;
    }
    setInfoLocationId(locationId);
    setLocationInfoOpen(true);
  };

  const clearMapTapGesture = () => {
    mapLastTapRef.current = null;
  };

  const columnCodesFromPayload = (payload: BufferCellClickPayload) =>
    payload.columnLocationCodes?.length
      ? payload.columnLocationCodes
      : [payload.locationCode];

  const invokeCallerLocations = useCallback(
    (locationIds: number[], robot?: InboundRobot) => {
      if (locationIds.length === 0) return;
      callerMutation.mutate(
        {
          location_ids: locationIds,
          ...(robot ? { assign_robot_id: robot.deviceCode } : {}),
        },
        {
          onSuccess: (result) => {
            if (result.queued > 0) {
              message.success(
                robot
                  ? `Đã tiếp nhận ${result.queued} lệnh cho ${robot.name}.`
                  : `Đã tiếp nhận ${result.queued} lệnh gọi robot.`,
              );
            } else {
              message.warning("Không có dòng nào đang chờ ở ô đã chọn.");
            }
          },
          onError: (err) => {
            message.error(getApiErrorDetail(err, "Không thể gọi robot nhập"));
          },
        },
      );
    },
    [callerMutation],
  );

  const applyAutoColumnSelection = (
    payload: BufferCellClickPayload,
    toggle: boolean,
  ) => {
    const columnCodes = columnCodesFromPayload(payload);

    if (
      toggle &&
      columnCodesEqual(columnCodes, selectedAutoColumnCodesRef.current)
    ) {
      setSelectedAutoColumnCodes([]);
      return;
    }

    setSelectedAutoColumnCodes(columnCodes);
    setSelectedBufferCode(null);
    setSelectedBufferLocationId(null);
  };

  const applyManualCellSelection = (
    payload: BufferCellClickPayload,
    toggle: boolean,
  ) => {
    const code = payload.locationCode;

    if (toggle && selectedBufferCodeRef.current === code) {
      setSelectedBufferCode(null);
      setSelectedBufferLocationId(null);
      return;
    }

    const locationId = resolveInboundMapLocationId(code);
    if (locationId == null) {
      message.error(
        `Không tìm thấy warehouse location cho mã ${code}`,
      );
      return;
    }

    setSelectedAutoColumnCodes([]);
    setSelectedBufferCode(code);
    setSelectedBufferLocationId(locationId);
  };

  /**
   * 1 tap / 2 tap (trong MAP_TAP_DOUBLE_WINDOW_MS) — không dùng sự kiện dblclick.
   * Single xử lý ngay (không delay). Auto: 1 tap = cột · Manual: 1 tap = một ô.
   * 2 tap (cùng key): modal thông tin vị trí (cả hai chế độ).
   */
  const handleBufferCellClick = (payload: BufferCellClickPayload) => {
    const currentMode = modeRef.current;
    const key = mapTapSelectionKey(payload, currentMode);
    const now = Date.now();
    const last = mapLastTapRef.current;

    if (
      last &&
      last.key === key &&
      now - last.time <= MAP_TAP_DOUBLE_WINDOW_MS
    ) {
      mapLastTapRef.current = null;
      openLocationInfo(payload);
      return;
    }

    mapLastTapRef.current = { key, time: now };

    if (currentMode === "manual") {
      applyManualCellSelection(payload, true);
    } else {
      applyAutoColumnSelection(payload, true);
    }
  };

  const handleQrAssignBufferClick = () => {
    if (modeRef.current !== "manual") {
      message.info("Chuyển sang chế độ Thủ công để gán buffer.");
      return;
    }
    const code = selectedBufferCodeRef.current;
    if (!code) {
      message.warning("Chọn một ô trên sơ đồ trước khi gán buffer.");
      return;
    }
    void openBufferAssignFlow({ locationCode: code, x: 0, y: 0 });
  };

  const resetMapModeState = (nextMode: "auto" | "manual") => {
    clearMapTapGesture();
    setLocationInfoOpen(false);
    setInfoLocationId(null);
    setSelectedAutoColumnCodes([]);
    clearBufferSelection();
    setMode(nextMode);
  };

  const clearBufferSelection = () => {
    setAssignModalOpen(false);
    setUnassignModalOpen(false);
    setBufferAssignment(null);
    setSelectedBufferCode(null);
    setSelectedBufferLocationId(null);
  };

  const handleCallRobot = (robot?: InboundRobot) => {
    if (callerMutation.isPending) return;
    if (callerLocationIds.length === 0) {
      message.warning("Không có ô buffer nhập nào để gọi robot.");
      return;
    }

    const locationIds = [...callerLocationIds];
    const scopeLabel =
      mode === "manual"
        ? `ô đã chọn (${locationIds.length})`
        : selectedAutoColumnCodes.length > 0
          ? `cột đã chọn (${locationIds.length} ô)`
          : `tất cả ${locationIds.length} ô buffer nhập`;

    Modal.confirm({
      title: robot ? `Xác nhận gọi ${robot.name}` : "Xác nhận gọi robot nhập",
      width: OPERATOR_DESKTOP.modal.default,
      content: (
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          <p>
            Gọi robot cho <strong>{scopeLabel}</strong>.
          </p>
          {robot && <p>Robot thực hiện: <strong>{robot.name}</strong>.</p>}
          <p>
            Mỗi ô sẽ lấy một dòng nhập đang chờ (Khởi tạo); ô không có
            dòng chờ sẽ được bỏ qua.
          </p>
        </div>
      ),
      okText: "Gọi robot",
      cancelText: "Hủy",
      onOk: () => invokeCallerLocations(locationIds, robot),
    });
  };

  const assignedTw = operatorDesktopTableWidths.inboundAssignedDetails;
  const detailColumns: ColumnsType<InboundAssignedDetail> = [
    {
      title: "Mã hàng",
      dataIndex: "product_sku",
      width: assignedTw.sku,
      ellipsis: true,
      render: (value: string | null) => (
        <span className="font-mono text-base font-semibold text-brand-dark">
          {value?.trim() || "—"}
        </span>
      ),
    },
    {
      title: "Lot",
      dataIndex: "lot_number",
      width: assignedTw.lot,
      ellipsis: true,
      render: (value: string | null) => (
        <span className="font-mono text-base text-brand-dark">
          {value?.trim() || "—"}
        </span>
      ),
    },
    {
      title: "From",
      dataIndex: "from_location",
      ellipsis: true,
      render: (value: string | null) => (
        <span className="font-mono text-base font-bold text-brand-dark">
          {value?.trim() || "—"}
        </span>
      ),
    },
    {
      title: "To",
      dataIndex: "to_location",
      ellipsis: true,
      render: (value: string | null) => (
        <span className="font-mono text-base font-bold text-brand-dark">
          {value?.trim() || "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">


      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-panel shadow-stripe-1">
        <div className="flex shrink-0 flex-nowrap items-stretch justify-between gap-0 overflow-hidden border-b border-stripe-hairline bg-panel-soft">
          <div className="flex min-w-0 flex-1 items-stretch gap-0 overflow-x-auto overflow-y-hidden">
            {SOURCE_TABS.map((tab) => {
              const isActive = sourceTab === tab.key;
              const Icon = SOURCE_TAB_META[tab.key].icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSourceTab(tab.key)}
                  className={cn(
                    "relative flex min-h-12 min-w-[150px] items-center justify-center gap-2 px-4 py-2.5 text-xl font-bold transition-all",
                    isActive
                      ? "z-10 -mb-px border border-stripe-hairline border-b-white bg-white text-brand-primary shadow-[0_1px_0_0_#fff]"
                      : "mb-0 border border-transparent bg-transparent text-stripe-ink-mute hover:bg-white/40 hover:text-brand-dark",
                  )}
                >
                  <Icon
                    className={cn(
                      "text-lg",
                      isActive ? "text-brand-primary" : "text-stripe-ink-mute",
                    )}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex shrink-0 items-center gap-2 px-3 py-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImportFileChange}
            />
            <Button
              variant="secondary"
              icon={<EyeOutlined />}
              onClick={() => setWarehouseViewOpen(true)}
              disabled={warehouseId <= 0}
              className="!h-10 !px-4 !text-base"
            >
              Xem kho
            </Button>
            <div className="flex rounded-full border border-stripe-hairline bg-panel-soft p-1">
              <button
                type="button"
                onClick={() => {
                  if (mode !== "auto") resetMapModeState("auto");
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-base font-bold transition-all",
                  mode === "auto"
                    ? "bg-brand-primary text-white shadow-sm"
                    : "text-stripe-ink-mute hover:text-brand-dark hover:bg-white/50",
                )}
              >
                Tự động
              </button>
              <button
                type="button"
                onClick={() => {
                  if (mode !== "manual") resetMapModeState("manual");
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-base font-bold transition-all",
                  mode === "manual"
                    ? "bg-brand-primary text-white shadow-sm"
                    : "text-stripe-ink-mute hover:text-brand-dark hover:bg-white/50",
                )}
              >
                Thủ công (Manual)
              </button>
            </div>
          </div>
        </div>

        {sourceTab === "direct" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DirectOutboundFromInboundBoard
              zoneId={warehouseId}
              onImportClick={handleImportClick}
              importLoading={isMasanImporting}
              importDisabled={warehouseId <= 0}
            />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch @max-[1279px]:operator-panel-scroll @min-[1280px]:grid-cols-5">
            <div className="flex min-h-0 flex-col overflow-hidden @min-[1280px]:col-span-3">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stripe-hairline px-4 py-2">
                <h3 className="text-4xl font-black text-brand-dark">
                  Sơ đồ nhập hàng
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    icon={<ScanOutlined />}
                    onClick={handleQrAssignBufferClick}
                    disabled={warehouseId <= 0}
                    className="!h-10 !px-4 !text-base !bg-cyan-600 hover:!bg-cyan-700 !border-cyan-600 hover:!border-cyan-700"
                  >
                    Quét QR gán ô
                  </Button>
                  <Button
                    variant="primary"
                    icon={<UploadOutlined />}
                    onClick={handleImportClick}
                    loading={isMasanImporting}
                    disabled={warehouseId <= 0}
                    className="!h-10 !px-4 !text-base"
                  >
                    Nhập phiên nhập
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<FileExcelOutlined />}
                    onClick={() => void handleExportDailyExcel()}
                    loading={isExportingDailyExcel}
                    disabled={warehouseId <= 0}
                    className="!h-10 !px-4 !text-base"
                  >
                    Xuất Excel nhập hàng
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<ClearOutlined />}
                    onClick={handleClearStation}
                    loading={isClearingStation}
                    disabled={warehouseId <= 0}
                    className="!h-10 !px-4 !text-base !border-amber-500 !text-amber-800 hover:!border-amber-600 hover:!text-amber-900"
                  >
                    Clear station
                  </Button>
                </div>
              </div>
              <div
                className="shrink-0 border-b border-stripe-hairline bg-panel-soft px-4 py-2"
                role="status"
                aria-live="polite"
                aria-label="Trạng thái robot nhập kho"
              >
                <RobotStatusPanel rows={robotRows} compact inline />
              </div>
              <div
                className={`relative flex ${operatorDesktopClass.boardFill} flex-col bg-industrial-pattern`}
              >
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-panel">
                  <OperatorMapCanvas
                    zoneId={[2, 12]}
                    showInboundSeparator={true}
                    className="!h-full"
                    tuning={OPERATOR_INBOUND_MAP_TUNING}
                    selectedCodes={
                      mode === "manual" && selectedBufferCode ? [selectedBufferCode] :
                        mode === "auto" ? selectedAutoColumnCodes : undefined
                    }
                    onBufferCellClick={handleBufferCellClick}
                  />
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden border-t border-stripe-hairline @min-[1280px]:col-span-2 @min-[1280px]:border-l @min-[1280px]:border-t-0">
              <div className="flex shrink-0 items-stretch gap-0 overflow-x-auto border-b border-stripe-hairline bg-panel-soft">
                {(
                  [
                    {
                      key: "orders" as const,
                      label: "Lệnh nhập",
                      count: inboundOrders.length,
                    },
                    {
                      key: "commands" as const,
                      label: "Lệnh gọi",
                      count: assignedDetails.length,
                    },
                  ] as const
                ).map((tab) => {
                  const active = sideListTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSideListTab(tab.key)}
                      className={cn(
                        "relative flex min-h-12 min-w-[150px] items-center justify-center gap-2 px-4 py-2.5 font-bold transition-all",
                        active
                          ? "z-10 -mb-px border border-stripe-hairline border-b-white bg-white text-brand-primary shadow-[0_1px_0_0_#fff]"
                          : "border border-transparent text-stripe-ink-mute hover:bg-white/50 hover:text-brand-dark",
                      )}
                    >
                      <span className="truncate text-2xl">{tab.label}</span>
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
                    </button>
                  );
                })}
              </div>

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
                {sideListTab === "orders" ? (
                  <div className="h-full min-h-0 overflow-hidden">
                    <OperatorInboundOrderBrowser
                      key={warehouseId}
                      warehouseId={warehouseId}
                      orders={inboundOrders}
                      loading={inboundOrdersLoading}
                      error={inboundOrdersError}
                      onFocusedOrderIdChange={setFocusedInboundOrderId}
                    />
                  </div>
                ) : (
                  <div className="operator-panel-scroll min-h-0 flex-1 p-2">
                    <Table<InboundAssignedDetail>
                      rowKey="detail_id"
                      size="middle"
                      pagination={false}
                      loading={assignedLoading}
                      columns={detailColumns}
                      dataSource={assignedDetails}
                      tableLayout="fixed"
                      scroll={{ x: "max-content" }}
                      locale={{
                        emptyText:
                          incompleteOrderIds.length > 0
                            ? "Không có dòng nào đang chờ gọi robot"
                            : "Không có đơn nhập chưa hoàn thành",
                      }}
                      className="min-w-0"
                    />
                  </div>
                )}
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-stripe-hairline p-3">
                <Button
                  variant="secondary"
                  icon={<FileExcelOutlined />}
                  loading={isExportingDetailReport}
                  disabled={inboundOrders.length === 0}
                  onClick={() => void handleExportDetailReport()}
                  className="!h-10 !w-full justify-center !text-sm disabled:!border-stripe-hairline disabled:!bg-white disabled:!text-slate-400 disabled:!opacity-100"
                >
                  Xuất báo cáo
                </Button>
                <Button
                  variant="primary"
                  icon={<RobotOutlined />}
                  disabled={callerLocationIds.length === 0 || callerMutation.isPending}
                  loading={callerMutation.isPending}
                  onClick={() => handleCallRobot()}
                  className="!h-10 !w-full justify-center !text-sm disabled:!bg-brand-primary/45 disabled:!text-white disabled:!opacity-100"
                >
                  Gọi robot nhập
                  {mode === "manual" && selectedBufferLocationId
                    ? " (1 ô)"
                    : selectedAutoColumnCodes.length > 0
                      ? ` (cột ${callerLocationIds.length} ô)`
                      : mode === "auto"
                        ? " (tất cả)"
                        : ""}
                </Button>
                <AssignedRobotCallButton
                  disabled={callerLocationIds.length === 0}
                  loading={callerMutation.isPending}
                  onSelect={handleCallRobot}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <WarehouseViewModal
        open={warehouseViewOpen}
        warehouseId={warehouseId}
        onClose={() => setWarehouseViewOpen(false)}
      />

      <InboundLocationInfoModal
        open={locationInfoOpen}
        zoneId={warehouseId}
        locationId={infoLocationId}
        onClose={() => {
          setLocationInfoOpen(false);
          setInfoLocationId(null);
        }}
      />

      {data?.order?.id && selectedBufferLocationId && selectedBufferCode ? (
        <AssignInboundBufferModal
          open={assignModalOpen}
          orderId={data.order.id}
          locationId={selectedBufferLocationId}
          locationCode={selectedBufferCode}
          onClose={clearBufferSelection}
        />
      ) : null}

      <UnassignInboundBufferModal
        open={unassignModalOpen}
        assignment={bufferAssignment}
        onClose={clearBufferSelection}
      />

      <Modal
        open={isMasanPreviewOpen}
        onCancel={closeImportPreview}
        width={OPERATOR_DESKTOP.modal.importInbound.width}
        destroyOnHidden
        title={
          <span className="text-brand-dark font-semibold">
            Xem trước import Masan
          </span>
        }
        footer={
          <Space>
            <Button variant="secondary" onClick={closeImportPreview}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={isMasanImporting}
              disabled={isMasanImporting}
              onClick={() => void handleConfirmImport()}
            >
              {`Xác nhận tạo đơn (${masanPreviewData.length} dòng)`}
            </Button>
          </Space>
        }
      >

        <Table
          rowKey={(_, index) => String(index)}
          dataSource={masanPreviewData}
          pagination={false}
          scroll={{ x: 960, y: 400 }}
          className="[&_.ant-table-tbody_td]:align-top"
          size="small"
          columns={masanImportPreviewColumns}
        />
      </Modal>
      <Spin spinning={isMasanImporting} fullscreen />
    </div>
  );
}
