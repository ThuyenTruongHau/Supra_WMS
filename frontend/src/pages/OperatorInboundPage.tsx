import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { ColumnsType } from "antd/es/table";
import {
  ContainerOutlined,
  ExportOutlined,
  FileExcelOutlined,
  RobotOutlined,
  ScanOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Modal,
  Select,
  Space,
  Table,
  cn,
  message,
} from "@/components/ui";
import {
  OPERATOR_DESKTOP,
  OPERATOR_MAP_TUNING,
  operatorDesktopClass,
  operatorDesktopTableWidths,
} from "@/constants/operatorDesktopSizes";
import AssignInboundBufferModal from "@/components/inbound/AssignInboundBufferModal";
import UnassignInboundBufferModal from "@/components/inbound/UnassignInboundBufferModal";
import InboundBufferMapCanvas, {
  type BufferCellClickPayload,
} from "@/components/inbound/InboundBufferMapCanvas";
import OperatorInboundOrderBrowser from "@/components/inbound/OperatorInboundOrderBrowser";
import DirectOutboundFromInboundBoard from "@/components/inbound/DirectOutboundFromInboundBoard";
import InboundLocationInfoModal from "@/components/inbound/InboundLocationInfoModal";
import QrAssignInboundModal from "@/components/inbound/QrAssignInboundModal";
import OperatorPageHeader from "@/components/layout/OperatorPageHeader";
import { useAppStore } from "@/store/useAppStore";
import { useZone } from "@/hooks/useZone";
import { useProduct } from "@/hooks/useProduct";
import {
  getInboundBufferAssignmentApi,
  getInboundDailyReportApi,
  getInboundDetailReportApi,
} from "@/api/inbound";
import {
  formatEmptyLocationLabel,
  getAllLocationsByZoneApi,
  listEmptyLocationsApi,
} from "@/api/warehouseLocation";
import {
  useCreateInbound,
  useInboundAssignedDetails,
  useInboundList,
  useInboundOperatorBoardSummary,
  useOldestIncompleteInbound,
  useSendInboundCommands,
} from "@/hooks/useInbound";
import { useLocationByCodeMap } from "@/hooks/useWarehouseLocation";
import type {
  InboundAssignedDetail,
  InboundBufferAssignment,
  InboundDetailInput,
} from "@/types/inbound";
import { getApiErrorDetail } from "@/types/apiError";
import {
  parseInboundExcelFile,
  type ImportError,
  type ImportPreviewRow,
} from "@/utils/inboundExcelImport";
import { applyImportLocationSuggestions } from "@/utils/inboundLocationPreview";
import type { EmptyLocation } from "@/types/warehouseLocation";
import { SOURCE_TABS, type SourceTabKey } from "@/data/mockOperatorInbound";
import { toDisplayInteger } from "@/utils/number";
import {
  buildInboundOperatorMetrics,
  buildInboundRobotRows,
  mapInboundGoodsLegend,
} from "@/utils/operatorHeaderMetrics";

type SideListTab = "orders" | "commands";

type ImportPreviewTableRow = ImportPreviewRow & { rowIndex: number };

function formatAssignedSkuLot(row: InboundAssignedDetail): string {
  const sku = row.product_sku?.trim() || "—";
  const lot = row.lot_number?.trim();
  return lot ? `${sku} / ${lot}` : sku;
}

const ASSIGNED_STATUS_LABEL: Record<string, string> = {
  partial: "Đã gán",
  pending: "Chưa gán",
  completed: "Hoàn tất",
};

const EMPTY_ASSIGNED_DETAILS: InboundAssignedDetail[] = [];

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
  const zoneId = useAppStore((s) => s.selectedWarehouseId);
  const { data: zones } = useZone();
  const warehouseName =
    zones?.find((z) => z.id === zoneId)?.name ?? "Kho được gán";

  const { data, isLoading, isError, error } =
    useOldestIncompleteInbound(zoneId);
  const isNotFound = error?.response?.status === 404;
  const orderId = data?.order?.id ?? 0;
  const { data: assignedPayload, isLoading: assignedLoading } =
    useInboundAssignedDetails(orderId, orderId > 0);
  const assignedDetails = assignedPayload?.details ?? EMPTY_ASSIGNED_DETAILS;
  const { data: boardSummary } = useInboundOperatorBoardSummary(
    orderId,
    orderId > 0,
  );
  const {
    data: inboundOrders = [],
    isLoading: inboundOrdersLoading,
    isError: inboundOrdersError,
  } = useInboundList(zoneId);
  const { locationByCode } = useLocationByCodeMap(zoneId);
  const { data: products = [] } = useProduct(zoneId);
  const createMutation = useCreateInbound();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapSingleClickTimerRef = useRef<number | null>(null);

  const [sourceTab, setSourceTab] = useState<SourceTabKey>("cont");
  const [sideListTab, setSideListTab] = useState<SideListTab>("orders");
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [clock, setClock] = useState(() => new Date());
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
  const [locationInfoOpen, setLocationInfoOpen] = useState(false);
  const [infoLocationId, setInfoLocationId] = useState<number | null>(null);

  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<
    ImportPreviewRow[]
  >([]);
  const [importWarnings, setImportWarnings] = useState<ImportError[]>([]);
  const [importDetails, setImportDetails] = useState<InboundDetailInput[]>([]);
  const [locationAssignments, setLocationAssignments] = useState<number[]>([]);
  const [locationOptionsByRow, setLocationOptionsByRow] = useState<
    Record<number, EmptyLocation[]>
  >({});
  const [locationLookup, setLocationLookup] = useState<
    Record<number, EmptyLocation>
  >({});
  const [isLoadingLocationSuggest, setIsLoadingLocationSuggest] =
    useState(false);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [isExportingDailyExcel, setIsExportingDailyExcel] = useState(false);
  const [isExportingDetailReport, setIsExportingDetailReport] = useState(false);

  const sendCommandsMutation = useSendInboundCommands();

  const resetImportState = () => {
    setImportPreviewRows([]);
    setImportWarnings([]);
    setImportDetails([]);
    setLocationAssignments([]);
    setLocationOptionsByRow({});
    setLocationLookup({});
  };

  const closeImportPreview = () => {
    setIsImportPreviewOpen(false);
    resetImportState();
  };

  const loadLocationOptionsForRow = async (rowIndex: number) => {
    const excludeLocationIds = locationAssignments.filter(
      (locationId, index) => index !== rowIndex && locationId > 0,
    );

    try {
      const response = await listEmptyLocationsApi({
        zoneId,
        excludeLocationIds,
      });

      const currentId = locationAssignments[rowIndex];
      const merged = [...response.locations];
      const currentLocation = currentId ? locationLookup[currentId] : undefined;
      if (currentLocation && !merged.some((loc) => loc.id === currentId)) {
        merged.unshift(currentLocation);
      }

      setLocationLookup((prev) => {
        const next = { ...prev };
        for (const location of merged) {
          next[location.id] = location;
        }
        return next;
      });
      setLocationOptionsByRow((prev) => ({ ...prev, [rowIndex]: merged }));
    } catch (err: unknown) {
      message.error(
        getApiErrorDetail(err, "Không thể tải danh sách vị trí trống"),
      );
    }
  };

  const handleLocationChange = (rowIndex: number, locationId: number) => {
    setLocationAssignments((prev) => {
      const next = [...prev];
      next[rowIndex] = locationId;
      return next;
    });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (zoneId <= 0) {
      message.error("Vui lòng chọn kho trước khi import");
      return;
    }

    setIsParsingExcel(true);
    resetImportState();

    try {
      const locations = await getAllLocationsByZoneApi(zoneId);
      const result = await parseInboundExcelFile(file, products, locations);

      if (result.errors.length > 0) {
        Modal.error({
          title: "Không thể import file Excel",
          width: OPERATOR_DESKTOP.modal.sm,
          content: (
            <ul
              className={`mt-2 ${operatorDesktopClass.listMax64} list-disc space-y-1 overflow-y-auto pl-5 text-sm`}
            >
              {result.errors.map((err, index) => (
                <li key={`${err.excelRowNumber ?? "global"}-${index}`}>
                  {err.excelRowNumber
                    ? `Dòng ${err.excelRowNumber}: ${err.message}`
                    : err.message}
                </li>
              ))}
            </ul>
          ),
        });
        return;
      }

      setImportDetails(result.details);
      setImportPreviewRows(result.previewRows);
      setImportWarnings(result.warnings);

      setIsLoadingLocationSuggest(true);
      try {
        const { lookup, optionsByRow, assignments } =
          await applyImportLocationSuggestions(
            zoneId,
            result.details,
            locations,
          );

        setLocationLookup(lookup);
        setLocationAssignments(assignments);
        setLocationOptionsByRow(optionsByRow);
        setIsImportPreviewOpen(true);
      } catch (err: unknown) {
        message.error(
          getApiErrorDetail(err, "Không thể gợi ý vị trí cất hàng"),
        );
      } finally {
        setIsLoadingLocationSuggest(false);
      }
    } catch {
      message.error("Không thể đọc file Excel");
    } finally {
      setIsParsingExcel(false);
    }
  };

  const handleConfirmImport = async () => {
    if (importDetails.length === 0) {
      message.error("Không có dòng dữ liệu để tạo đơn");
      return;
    }

    if (locationAssignments.length !== importDetails.length) {
      message.error("Chưa gán đủ vị trí cất cho các dòng");
      return;
    }

    if (locationAssignments.some((locationId) => !locationId)) {
      message.error("Vui lòng chọn vị trí cất cho tất cả dòng");
      return;
    }

    if (new Set(locationAssignments).size !== locationAssignments.length) {
      message.error("Vị trí cất không được trùng nhau giữa các dòng");
      return;
    }

    const details = importDetails.map((detail, index) => ({
      ...detail,
      assigned_location_id: locationAssignments[index],
    }));

    try {
      await createMutation.mutateAsync({
        zone_id: zoneId,
        details,
      });
      message.success("Import đơn nhập thành công!");
      setIsImportPreviewOpen(false);
      resetImportState();
    } catch (err: unknown) {
      message.error(
        getApiErrorDetail(err, "Không thể tạo đơn nhập từ file Excel"),
      );
    }
  };

  const handleExportDailyExcel = async () => {
    if (zoneId <= 0) {
      message.warning("Vui lòng chọn kho trước khi xuất");
      return;
    }

    setIsExportingDailyExcel(true);
    try {
      const report = await getInboundDailyReportApi(zoneId);
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
    if (!orderId) {
      message.warning("Không có đơn nhập đang xử lý để xuất báo cáo");
      return;
    }

    setIsExportingDetailReport(true);
    try {
      const report = await getInboundDetailReportApi(orderId);
      const { downloadInboundDetailReportExcel } =
        await import("@/utils/inboundDetailExport");
      downloadInboundDetailReportExcel(report);
      message.success("Đã xuất báo cáo Excel");
    } catch (err: unknown) {
      message.error(getApiErrorDetail(err, "Không thể xuất báo cáo Excel"));
    } finally {
      setIsExportingDetailReport(false);
    }
  };

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(
    () => () => {
      if (mapSingleClickTimerRef.current != null) {
        window.clearTimeout(mapSingleClickTimerRef.current);
      }
    },
    [],
  );

  const metrics = useMemo(() => {
    if (!data) return null;
    return buildInboundOperatorMetrics({
      orderCode: data.order.order_code,
      orderStatus: data.order.status,
      carrierName: data.supplier_name,
      bufferSlots: boardSummary?.buffer_slots ?? {
        occupied_count: Math.max(
          data.empty_locators_total - data.empty_locators_count,
          0,
        ),
        empty_count: data.empty_locators_count,
        total: data.empty_locators_total,
      },
      goodsLegend: mapInboundGoodsLegend(boardSummary?.goods_status),
      robotRows: buildInboundRobotRows(assignedDetails),
      compact: true,
    });
  }, [assignedDetails, boardSummary, data]);

  useEffect(() => {
    const nextIds = assignedDetails.map((d) => d.detail_id);
    setSelectedIds((prev) => {
      if (
        nextIds.length === prev.length &&
        nextIds.every((id, index) => id === prev[index])
      ) {
        return prev;
      }
      return nextIds;
    });
  }, [assignedDetails]);

  const handleManualBufferDoubleClick = async (
    payload: BufferCellClickPayload,
  ) => {
    if (!data?.order?.id) {
      message.warning("Không có đơn nhập đang xử lý trong kho này.");
      return;
    }
    const location = locationByCode[payload.locationCode];
    if (!location) {
      message.error(
        `Không tìm thấy warehouse location cho mã ${payload.locationCode}`,
      );
      return;
    }
    setSelectedBufferCode(payload.locationCode);
    setSelectedBufferLocationId(location.id);

    try {
      const assignment = await getInboundBufferAssignmentApi(location.id);
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
    const location = locationByCode[payload.locationCode];
    if (!location) {
      message.error(
        `Không tìm thấy warehouse location cho mã ${payload.locationCode}`,
      );
      return;
    }
    setInfoLocationId(location.id);
    setLocationInfoOpen(true);
  };

  const handleBufferCellClick = (payload: BufferCellClickPayload) => {
    if (mapSingleClickTimerRef.current != null) {
      window.clearTimeout(mapSingleClickTimerRef.current);
    }
    // Chờ ngắn để phân biệt click đơn với double-click.
    mapSingleClickTimerRef.current = window.setTimeout(() => {
      mapSingleClickTimerRef.current = null;
      openLocationInfo(payload);
    }, 230);
  };

  const handleBufferCellDoubleClick = (payload: BufferCellClickPayload) => {
    if (mapSingleClickTimerRef.current != null) {
      window.clearTimeout(mapSingleClickTimerRef.current);
      mapSingleClickTimerRef.current = null;
    }

    if (mode === "manual") {
      setSelectedAutoColumnCodes([]);
      void handleManualBufferDoubleClick(payload);
      return;
    }

    const columnCodes = payload.columnLocationCodes?.length
      ? payload.columnLocationCodes
      : [payload.locationCode];
    setSelectedAutoColumnCodes(columnCodes);
    setSelectedBufferCode(null);
    setSelectedBufferLocationId(null);

    const normalize = (value: string | null | undefined) =>
      (value || "").trim().toUpperCase();
    const selectedLocationKeys = new Set<string>();
    for (const code of columnCodes) {
      selectedLocationKeys.add(normalize(code));
      const location = locationByCode[code];
      if (location) {
        selectedLocationKeys.add(normalize(location.location_code));
        selectedLocationKeys.add(normalize(location.bin));
      }
    }
    selectedLocationKeys.delete("");

    const matchingDetailIds = assignedDetails
      .filter((detail) =>
        [
          detail.location_code,
          detail.location_bin,
          detail.pickup_node_code,
        ].some((value) => selectedLocationKeys.has(normalize(value))),
      )
      .map((detail) => detail.detail_id);
    setSelectedIds(matchingDetailIds);

    if (matchingDetailIds.length > 0) {
      message.success(
        `Đã chọn cột ${columnCodes.length} ô · ${matchingDetailIds.length} lệnh tương ứng`,
      );
    } else {
      message.warning(
        `Đã chọn cột ${columnCodes.length} ô nhưng chưa có lệnh tương ứng`,
      );
    }
  };

  const handleMapBackgroundClick = () => {
    if (mapSingleClickTimerRef.current != null) {
      window.clearTimeout(mapSingleClickTimerRef.current);
      mapSingleClickTimerRef.current = null;
    }
    setSelectedAutoColumnCodes([]);
    setSelectedIds(assignedDetails.map((detail) => detail.detail_id));
    setSelectedBufferCode(null);
    setSelectedBufferLocationId(null);
  };

  const clearBufferSelection = () => {
    setAssignModalOpen(false);
    setUnassignModalOpen(false);
    setBufferAssignment(null);
    setSelectedBufferCode(null);
    setSelectedBufferLocationId(null);
  };

  const handleCallRobot = () => {
    if (!orderId) {
      message.warning("Không có đơn nhập đang xử lý trong kho này.");
      return;
    }
    if (selectedIds.length === 0) {
      message.warning("Vui lòng chọn ít nhất 1 lệnh đã gán để gửi.");
      return;
    }

    const count = selectedIds.length;
    const detailIds = [...selectedIds];

    Modal.confirm({
      title: "Xác nhận gọi robot nhập",
      width: OPERATOR_DESKTOP.modal.default,
      content: (
        <div className="mt-2 space-y-1 text-sm text-slate-600">
          <p>
            Gửi lệnh xuống robot cho <strong>{count}</strong> dòng đã chọn.
          </p>
          <p>Hệ thống dùng điểm lấy / điểm trả đã gán trên từng lệnh.</p>
        </div>
      ),
      okText: "Gửi lệnh",
      cancelText: "Hủy",
      onOk: () =>
        sendCommandsMutation.mutateAsync(
          {
            orderId,
            data: { detail_ids: detailIds },
          },
          {
            onSuccess: (order) => {
              setSelectedIds([]);
              if (order.status === "completed") {
                message.success(
                  `Đã gửi ${count} lệnh. Đơn nhập đã hoàn thành.`,
                );
              } else {
                message.success(`Đã gửi ${count} lệnh xuống robot.`);
              }
            },
            onError: (err) => {
              const detail = err.response?.data?.detail;
              message.error(
                typeof detail === "string"
                  ? detail
                  : "Không thể gửi lệnh robot",
              );
            },
          },
        ),
    });
  };

  const assignedTw = operatorDesktopTableWidths.inboundAssignedDetails;
  const detailColumns: ColumnsType<InboundAssignedDetail> = [
    {
      title: "Biển số",
      dataIndex: "vehicle_number",
      ellipsis: true,
      render: (value: string | null) => (
        <span className="font-mono text-base font-semibold text-brand-dark">
          {value?.trim() || "—"}
        </span>
      ),
    },
    {
      title: "Vị trí",
      key: "location",
      width: 100,
      render: (_: unknown, record) => (
        <span className="font-mono text-base font-bold text-brand-dark">
          {record.location_bin?.trim() ||
            record.location_code?.trim() ||
            record.pickup_node_code?.trim() ||
            "—"}
        </span>
      ),
    },
    {
      title: "Mã hàng/LOT",
      key: "skuLot",
      ellipsis: true,
      render: (_: unknown, record) => (
        <span className="text-base font-medium text-brand-dark">
          {formatAssignedSkuLot(record)}
        </span>
      ),
    },
    {
      title: "SL",
      dataIndex: "expected_quantity",
      width: assignedTw.qty,
      align: "right",
      render: (qty: number) => (
        <span className="text-base font-semibold tabular-nums text-success-600">
          {toDisplayInteger(qty)}
        </span>
      ),
    },
    {
      title: "TT",
      dataIndex: "status",
      width: assignedTw.status,
      render: (status: string) => (
        <span className="inline-flex whitespace-nowrap rounded-full bg-warning-100 px-2 py-0.5 text-xs font-semibold text-warning-700">
          {ASSIGNED_STATUS_LABEL[status] ?? status}
        </span>
      ),
    },
  ];

  const importTw = operatorDesktopTableWidths.inboundImportPreview;
  const locationPreviewColumns: ColumnsType<ImportPreviewTableRow> = useMemo(
    () => [
      {
        title: "Dòng Excel",
        dataIndex: "excelRowNumber",
        width: importTw.excelRow,
      },
      {
        title: "Mã Item",
        dataIndex: "sku",
        width: importTw.sku,
      },
      {
        title: "Tên Item",
        dataIndex: "productName",
        width: importTw.productName,
        render: (name: string, record) => (
          <div
            className={`min-w-[180px] max-w-[320px] whitespace-normal break-words text-sm leading-snug ${record.nameMismatch ? "text-warning-700" : ""
              }`}
          >
            {name}
          </div>
        ),
      },
      {
        title: "LOT",
        dataIndex: "lotNumber",
        width: importTw.lot,
        render: (lot: string) => lot || "—",
      },
      {
        title: "Tổng SL",
        dataIndex: "totalQuantity",
        width: importTw.totalQty,
        align: "right",
      },
      {
        title: "SL/pallet",
        dataIndex: "expectedQuantity",
        width: importTw.expectedQty,
        align: "right",
      },
      {
        title: "Pallet",
        dataIndex: "palletQuantity",
        width: importTw.pallet,
        align: "right",
      },
      {
        title: "Vị trí cất (R-C-B)",
        key: "assigned_location",
        width: importTw.location,
        render: (_: unknown, record: ImportPreviewTableRow) => (
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Chọn vị trí"
            value={locationAssignments[record.rowIndex] || undefined}
            options={(locationOptionsByRow[record.rowIndex] ?? []).map(
              (location) => ({
                value: location.id,
                label: formatEmptyLocationLabel(location),
              }),
            )}
            onDropdownVisibleChange={(open) => {
              if (open) {
                void loadLocationOptionsForRow(record.rowIndex);
              }
            }}
            onChange={(value) =>
              handleLocationChange(record.rowIndex, Number(value))
            }
            className="!w-full"
          />
        ),
      },
    ],
    [locationAssignments, locationOptionsByRow],
  );

  const clockLabel = clock.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">


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
            <div className="flex rounded-full border border-stripe-hairline bg-panel-soft p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("auto");
                  setSelectedAutoColumnCodes([]);
                  setSelectedIds(
                    assignedDetails.map((detail) => detail.detail_id),
                  );
                  clearBufferSelection();
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
                  setMode("manual");
                  setSelectedAutoColumnCodes([]);
                  setSelectedIds(
                    assignedDetails.map((detail) => detail.detail_id),
                  );
                  clearBufferSelection();
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
              zoneId={zoneId}
              onImportClick={handleImportClick}
              importLoading={isParsingExcel}
              importDisabled={zoneId <= 0}
            />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch xl:grid-cols-5">
            <div className="flex min-h-0 flex-col overflow-hidden xl:col-span-3">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stripe-hairline px-4 py-2">
                <h3 className="text-4xl font-black text-brand-dark">
                  Sơ đồ nhập hàng
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    icon={<ScanOutlined />}
                    onClick={() => setQrModalOpen(true)}
                    disabled={zoneId <= 0 || !orderId}
                    className="!h-10 !px-4 !text-base !bg-cyan-600 hover:!bg-cyan-700 !border-cyan-600 hover:!border-cyan-700"
                  >
                    Quét QR gán ô
                  </Button>
                  <Button
                    variant="primary"
                    icon={<UploadOutlined />}
                    onClick={handleImportClick}
                    loading={isParsingExcel}
                    disabled={zoneId <= 0}
                    className="!h-10 !px-4 !text-base"
                  >
                    Nhập dữ liệu đơn
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<FileExcelOutlined />}
                    onClick={() => void handleExportDailyExcel()}
                    loading={isExportingDailyExcel}
                    disabled={zoneId <= 0}
                    className="!h-10 !px-4 !text-base"
                  >
                    Xuất Excel nhập hàng
                  </Button>
                </div>
              </div>
              <div
                className={`relative flex ${operatorDesktopClass.boardFill} flex-col bg-industrial-pattern p-3 sm:p-4`}
              >
                <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-panel">
                  <InboundBufferMapCanvas
                    zoneId={zoneId}
                    className="!h-full"
                    tuning={OPERATOR_MAP_TUNING}
                    selectedLocationCode={
                      mode === "manual" ? selectedBufferCode : null
                    }
                    selectedLocationCodes={
                      mode === "auto" ? selectedAutoColumnCodes : undefined
                    }
                    onBufferCellClick={handleBufferCellClick}
                    onBufferCellDoubleClick={handleBufferCellDoubleClick}
                    onCanvasBackgroundClick={handleMapBackgroundClick}
                  />
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden border-t border-stripe-hairline xl:col-span-2 xl:border-l xl:border-t-0">
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

              <div className="min-h-0 flex-1 overflow-hidden bg-panel">
                {sideListTab === "orders" ? (
                  <OperatorInboundOrderBrowser
                    key={zoneId}
                    orders={inboundOrders}
                    loading={inboundOrdersLoading}
                    error={inboundOrdersError}
                  />
                ) : (
                  <Table<InboundAssignedDetail>
                    rowKey="detail_id"
                    size="middle"
                    pagination={false}
                    loading={assignedLoading}
                    columns={detailColumns}
                    dataSource={assignedDetails}
                    tableLayout="fixed"
                    locale={{
                      emptyText: orderId
                        ? "Chưa có lệnh nào được gán buffer"
                        : "Không có đơn nhập đang xử lý",
                    }}
                    rowSelection={{
                      selectedRowKeys: selectedIds,
                      onChange: (keys) => setSelectedIds(keys as number[]),
                      columnWidth: 40,
                    }}
                    className="h-full min-w-0"
                  />
                )}
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-stripe-hairline p-3">
                <Button
                  variant="secondary"
                  icon={<FileExcelOutlined />}
                  loading={isExportingDetailReport}
                  disabled={!orderId}
                  onClick={() => void handleExportDetailReport()}
                  className="!h-10 !w-full justify-center !text-sm disabled:!border-stripe-hairline disabled:!bg-white disabled:!text-slate-400 disabled:!opacity-100"
                >
                  Xuất báo cáo
                </Button>
                <Button
                  variant="primary"
                  icon={<RobotOutlined />}
                  disabled={selectedIds.length === 0 || !orderId}
                  loading={sendCommandsMutation.isPending}
                  onClick={handleCallRobot}
                  className="!h-10 !w-full justify-center !text-sm disabled:!bg-brand-primary/45 disabled:!text-white disabled:!opacity-100"
                >
                  Gọi robot nhập
                  {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <InboundLocationInfoModal
        open={locationInfoOpen}
        zoneId={zoneId}
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

      <QrAssignInboundModal
        open={qrModalOpen}
        orderId={orderId}
        assignedDetails={assignedDetails}
        locationByCode={locationByCode}
        onClose={() => setQrModalOpen(false)}
      />

      <Modal
        open={isImportPreviewOpen}
        onCancel={closeImportPreview}
        width={OPERATOR_DESKTOP.modal.importInbound.width}
        style={{
          top: OPERATOR_DESKTOP.modal.importInbound.top,
          maxWidth: OPERATOR_DESKTOP.modal.importInbound.maxWidth,
        }}
        styles={{
          body: {
            maxHeight: OPERATOR_DESKTOP.modal.importInbound.bodyMaxHeight,
            overflow: "auto",
          },
        }}
        destroyOnHidden
        title={
          <span className="text-brand-dark font-semibold">
            Xem trước import Excel
          </span>
        }
        footer={
          <Space>
            <Button variant="secondary" onClick={closeImportPreview}>
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={createMutation.isPending || isLoadingLocationSuggest}
              disabled={isLoadingLocationSuggest}
              onClick={() => void handleConfirmImport()}
            >
              {`Xác nhận import (${importPreviewRows.length} dòng)`}
            </Button>
          </Space>
        }
      >
        {importWarnings.length > 0 && (
          <div className="mb-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800">
            <p className="font-semibold">Cảnh báo</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {importWarnings.map((warning, index) => (
                <li key={`${warning.excelRowNumber ?? "warn"}-${index}`}>
                  {warning.excelRowNumber
                    ? `Dòng ${warning.excelRowNumber}: ${warning.message}`
                    : warning.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mb-3 text-sm text-gray-500">
          Sẽ tạo 1 đơn nhập trạng thái <strong>Khởi tạo</strong> với{" "}
          {importPreviewRows.length} dòng chi tiết. Hệ thống đã gợi ý vị trí cất
          trống theo thứ tự hàng 1 → hàng N; bạn có thể đổi từng vị trí trước
          khi xác nhận.
        </p>

        <Table<ImportPreviewTableRow>
          rowKey={(record) => String(record.rowIndex)}
          dataSource={importPreviewRows.map((row, rowIndex) => ({
            ...row,
            rowIndex,
          }))}
          loading={isLoadingLocationSuggest}
          pagination={false}
          scroll={{ x: 1100 }}
          className="[&_.ant-table-tbody_td]:align-top"
          size="small"
          columns={locationPreviewColumns}
        />
      </Modal>
    </div>
  );
}
