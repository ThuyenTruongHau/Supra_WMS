import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Table, Button, message, Modal, Space, Select, cn } from "@/components/ui";
import { Progress, Checkbox } from "antd";
import OutboundStatusTag from "@/components/shared/OutboundStatusTag";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  useGetOutboundOrderById,
  useGetOutboundOrderDetails,
  useGetOutboundLackedDetails,
  useGetOutboundRobotTasks,
  useDeleteOutboundOrder,
  useCalculateOutboundOrder,
  useExecuteOutboundRobotTask,
} from "@/hooks/useOutbound";
import { useAppStore } from "@/store/useAppStore";
import type {
  LackedDetail,
  OutboundOrderAllocation,
  OutboundOrderDetail,
  OutboundRobotTask,
} from "@/types/outbound";
import type { ColumnsType } from "antd/es/table";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";
import { useUser } from "@/hooks/useAuth";
import { useOutboundBufferLocations } from "@/hooks/useWarehouseMap";
import dayjs from "dayjs";
import CreateOutboundModal, {
  type OutboundItemDraft,
} from "./components/CreateOutboundModal";
import { detailsToEntries } from "@/utils/keyValueDetails";
import { computeDetailProgress } from "@/utils/detailProgress";
import { formatOutboundCalculateError } from "@/utils/outboundErrors";

const TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-base [&_.ant-table-tbody_td]:!text-base [&_.ant-table-thead_th]:!py-3 [&_.ant-table-tbody_td]:!py-3 [&_.ant-table-row]:hover:bg-slate-50/50";

const OUTBOUND_DETAIL_TABS = [
  { key: "list" as const, label: "Danh sách" },
  { key: "allocation" as const, label: "Phân bổ" },
];

function apiError(err: unknown): string {
  const ax = err as AxiosError<ApiErrorResponse>;
  const detail = ax?.response?.data?.detail;
  return typeof detail === "string" ? detail : "Có lỗi xảy ra";
}

const DETAIL_LINE_FIELD_LABELS: Record<string, string> = {
  sku: "Part_number",
  item_name: "Tên sản phẩm",
  lot_number: "Số lô",
  expiry_date: "Hạn sử dụng",
};

const ORDER_FIELD_LABELS: Record<string, string> = {
  source: "Nguồn",
  reference: "Tham chiếu",
  customer: "Khách hàng",
  note: "Ghi chú",
};

function formatOrderDetailKey(key: string): string {
  return ORDER_FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

function formatDetailLineKey(key: string): string {
  return DETAIL_LINE_FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

function getDetailEntries(details: Record<string, unknown> | undefined) {
  return Object.entries(details ?? {}).filter(
    ([, value]) =>
      value !== null &&
      value !== undefined &&
      value !== "" &&
      typeof value !== "object",
  );
}

const TASK_TYPE_LABEL: Record<OutboundRobotTask["task_type"], string> = {
  outbound: "XUẤT",
  return: "TRẢ",
};

function getRobotTaskDisplayStatus(record: OutboundRobotTask): string {
  if (record.task_type !== "return") return record.status;
  if (record.status && record.status !== "initialize") return record.status;
  return record.allocations[0]?.status || record.status;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function displayLocationName(
  name: string | null | undefined,
  code: string | null | undefined,
  id: number | null | undefined,
): string {
  if (name) return name;
  if (code) return code;
  if (id) return `#${id}`;
  return "—";
}

function hasAllocationLocation(
  id: number | null | undefined,
  name: string | null | undefined,
  code: string | null | undefined,
): boolean {
  return Boolean(id || name || code);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

function DetailsEntriesPanel({
  entries,
  formatKey,
  title = "Thông tin bổ sung",
  emptyText = "Không có dữ liệu bổ sung",
}: {
  entries: [string, unknown][];
  formatKey: (key: string) => string;
  title?: string;
  emptyText?: string;
}) {
  if (entries.length === 0) {
    return (
      <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-400 italic">
        {emptyText}
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs text-slate-500">{formatKey(key)}</dt>
            <dd className="mt-0.5 break-all text-sm font-medium text-slate-800">
              {displayValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function toEditItems(details: OutboundOrderDetail[]): OutboundItemDraft[] {
  return details.map((detail) => ({
    key: `detail-${detail.id}`,
    detail_id: detail.id,
    sku: detail.sku ?? undefined,
    item_id: detail.item_id,
    item_name: detail.item_name ?? undefined,
    quantity: detail.quantity,
    unit_id: detail.unit_id ?? undefined,
    detailEntries: detailsToEntries(detail.details),
  }));
}

export default function OutboundDetailPage() {
  const { orderId: orderIdParam } = useParams<{ orderId: string }>();
  const orderId = orderIdParam ? Number(orderIdParam) : undefined;
  const navigate = useNavigate();
  const outboundType = useAppStore((s) => s.outboundType);
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"list" | "allocation">("list");
  const [selectedDetailIds, setSelectedDetailIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [selectedLackedIds, setSelectedLackedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [taskLocationDraft, setTaskLocationDraft] = useState<
    Record<string, { startLocationId?: number; endLocationId?: number }>
  >({});
  const [executingTaskOrderId, setExecutingTaskOrderId] = useState<
    string | null
  >(null);

  const {
    data: order,
    isLoading: isOrderLoading,
    refetch: refetchOrder,
  } = useGetOutboundOrderById(orderId);
  const {
    data: details = [],
    isLoading: isDetailsLoading,
    refetch: refetchDetails,
  } = useGetOutboundOrderDetails(orderId);
  const { data: lackedDetails = [], isLoading: isLackedLoading, refetch: refetchLacked } =
    useGetOutboundLackedDetails(orderId);
  const {
    data: robotTasks = [],
    isLoading: isRobotTasksLoading,
    refetch: refetchRobotTasks,
  } = useGetOutboundRobotTasks(orderId, activeTab === "allocation");
  const deleteMutation = useDeleteOutboundOrder();
  const calculateMutation = useCalculateOutboundOrder();
  const executeRobotTaskMutation = useExecuteOutboundRobotTask();
  const { data: users = [] } = useUser();

  const warehouseId = order?.warehouse_id ?? selectedWarehouseId ?? 0;
  const { data: outboundBufferLocationsData, isLoading: outboundBufferLocationsLoading } =
    useOutboundBufferLocations(warehouseId, activeTab === "allocation");

  const outboundBufferLocationOptions = useMemo(
    () =>
      (outboundBufferLocationsData?.items ?? []).map((loc) => ({
        value: loc.id,
        label: loc.location_name || loc.location_code,
      })),
    [outboundBufferLocationsData],
  );

  const outboundBufferLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const loc of outboundBufferLocationsData?.items ?? []) {
      map.set(loc.id, loc.location_name || loc.location_code);
    }
    return map;
  }, [outboundBufferLocationsData]);

  const getTaskLocationSelectOptions = useCallback(
    (
      locationId: number | null | undefined,
      locationName: string | null | undefined,
      locationCode: string | null | undefined,
    ) => {
      if (
        locationId &&
        !outboundBufferLocationOptions.some((opt) => opt.value === locationId)
      ) {
        return [
          {
            value: locationId,
            label:
              locationName ||
              locationCode ||
              outboundBufferLabelById.get(locationId) ||
              `#${locationId}`,
          },
          ...outboundBufferLocationOptions,
        ];
      }
      return outboundBufferLocationOptions;
    },
    [outboundBufferLabelById, outboundBufferLocationOptions],
  );

  const userNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const user of users) map.set(user.id, user.username);
    return map;
  }, [users]);

  const orderExtraDetails = useMemo(
    () => getDetailEntries(order?.details),
    [order],
  );

  const editInitialItems = useMemo(() => toEditItems(details), [details]);

  const selectableDetails = useMemo(
    () => details.filter((d) => d.status === "initialize"),
    [details],
  );

  const selectedCount = selectedDetailIds.size;
  const allSelectableSelected =
    selectableDetails.length > 0 &&
    selectableDetails.every((d) => selectedDetailIds.has(d.id));
  const someSelectableSelected =
    selectableDetails.some((d) => selectedDetailIds.has(d.id)) &&
    !allSelectableSelected;

  const selectedLackedCount = selectedLackedIds.size;
  const allLackedSelected =
    lackedDetails.length > 0 &&
    lackedDetails.every((l) => selectedLackedIds.has(l.id));
  const someLackedSelected =
    lackedDetails.some((l) => selectedLackedIds.has(l.id)) &&
    !allLackedSelected;

  useEffect(() => {
    setSelectedDetailIds(new Set());
    setSelectedLackedIds(new Set());
    setTaskLocationDraft({});
    setActiveTab("list");
  }, [orderId]);

  const getTaskLocationIds = useCallback(
    (record: OutboundRobotTask) => {
      const first = record.allocations[0];
      const draft = taskLocationDraft[record.order_id] ?? {};
      const startFromAllocation = hasAllocationLocation(
        first?.from_location_id,
        first?.from_location_name,
        first?.from_location_code,
      );
      const endFromAllocation = hasAllocationLocation(
        first?.to_location_id,
        first?.to_location_name,
        first?.to_location_code,
      );
      return {
        startId: startFromAllocation
          ? first?.from_location_id ?? undefined
          : draft.startLocationId,
        endId: endFromAllocation
          ? first?.to_location_id ?? undefined
          : draft.endLocationId,
        needsStartPick: !startFromAllocation,
        needsEndPick: !endFromAllocation,
      };
    },
    [taskLocationDraft],
  );

  const handleTaskLocationChange = useCallback(
    (
      taskOrderId: string,
      field: "startLocationId" | "endLocationId",
      value: number,
    ) => {
      setTaskLocationDraft((prev) => ({
        ...prev,
        [taskOrderId]: { ...prev[taskOrderId], [field]: value },
      }));
    },
    [],
  );

  const renderTaskLocationCell = useCallback(
    (
      record: OutboundRobotTask,
      kind: "start" | "end",
    ) => {
      const first = record.allocations[0];
      const editable = record.status === "initialize";
      const draft = taskLocationDraft[record.order_id] ?? {};

      const allocationId =
        kind === "start" ? first?.from_location_id : first?.to_location_id;
      const allocationName =
        kind === "start" ? first?.from_location_name : first?.to_location_name;
      const allocationCode =
        kind === "start" ? first?.from_location_code : first?.to_location_code;
      const draftId =
        kind === "start" ? draft.startLocationId : draft.endLocationId;
      const hasLocation = hasAllocationLocation(
        allocationId,
        allocationName,
        allocationCode,
      );

      if (hasLocation) {
        return displayLocationName(
          allocationName,
          allocationCode,
          allocationId,
        );
      }

      if (!editable) return "—";

      return (
        <Select
          className="w-full"
          showSearch
          optionFilterProp="label"
          placeholder={
            kind === "start" ? "Chọn vị trí đầu..." : "Chọn vị trí cuối..."
          }
          value={draftId ?? undefined}
          options={getTaskLocationSelectOptions(
            draftId,
            draftId ? outboundBufferLabelById.get(draftId) : undefined,
            undefined,
          )}
          loading={outboundBufferLocationsLoading}
          onChange={(val) =>
            handleTaskLocationChange(
              record.order_id,
              kind === "start" ? "startLocationId" : "endLocationId",
              Number(val),
            )
          }
        />
      );
    },
    [
      getTaskLocationSelectOptions,
      handleTaskLocationChange,
      outboundBufferLabelById,
      outboundBufferLocationsLoading,
      taskLocationDraft,
    ],
  );

  const handleExecuteRobotTask = async (record: OutboundRobotTask) => {
    const { startId, endId, needsStartPick, needsEndPick } =
      getTaskLocationIds(record);
    if ((needsStartPick && !startId) || (needsEndPick && !endId)) return;
    if (!orderId) return;
    if (record.allocations.length === 0) {
      message.error("Task không có allocation để thực thi");
      return;
    }

    try {
      setExecutingTaskOrderId(record.order_id);
      message.loading({ content: "Đang gửi lệnh...", key: "execute" });
      await executeRobotTaskMutation.mutateAsync({
        orderId,
        body: {
          order_id: record.order_id,
          from_location_id: startId!,
          to_location_id: endId!,
          allocations: record.allocations.map((allocation) => ({
            allocation_id: allocation.id,
          })),
        },
        detailType: outboundType,
      });
      message.success({ content: "Đã thực thi task", key: "execute" });
    } catch (err) {
      message.error({ content: apiError(err), key: "execute" });
    } finally {
      setExecutingTaskOrderId(null);
    }
  };

  const toggleDetailSelection = useCallback(
    (detailId: number, checked: boolean) => {
      setSelectedDetailIds((prev) => {
        const next = new Set(prev);
        if (checked) next.add(detailId);
        else next.delete(detailId);
        return next;
      });
    },
    [],
  );

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedDetailIds(new Set(selectableDetails.map((d) => d.id)));
      } else {
        setSelectedDetailIds(new Set());
      }
    },
    [selectableDetails],
  );

  const toggleLackedSelection = useCallback(
    (detailId: number, checked: boolean) => {
      setSelectedLackedIds((prev) => {
        const next = new Set(prev);
        if (checked) next.add(detailId);
        else next.delete(detailId);
        return next;
      });
    },
    [],
  );

  const handleSelectAllLacked = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedLackedIds(new Set(lackedDetails.map((l) => l.id)));
      } else {
        setSelectedLackedIds(new Set());
      }
    },
    [lackedDetails],
  );

  const runCalculate = async (
    lineItems: {
      id: number;
      item_id: number;
      quantity: number;
      unit_id: number;
      detail_type: string;
      details?: Record<string, unknown>;
    }[],
    onSuccessClearSelection: () => void,
  ) => {
    if (!orderId || !order) return;

    const warehouseId = order.warehouse_id || selectedWarehouseId;
    if (!warehouseId) {
      message.error("Thiếu thông tin kho");
      return;
    }

    try {
      message.loading({ content: "Đang phân bổ...", key: "calculate" });
      const result = await calculateMutation.mutateAsync({
        body: {
          warehouse_id: warehouseId,
          outbound_order_id: orderId,
          line_items: lineItems,
        },
      });
      onSuccessClearSelection();
      void refetchOrder();
      void refetchDetails();
      void refetchLacked();
      void refetchRobotTasks();
      setActiveTab("allocation");

      if (result.is_fully_allocated) {
        message.success({
          content: "Phân bổ thành công toàn bộ dòng đã chọn",
          key: "calculate",
        });
      } else {
        message.warning({
          content: `Phân bổ một phần, còn thiếu ${result.lacked.length} dòng`,
          key: "calculate",
        });
      }
    } catch (err) {
      message.error({
        content: formatOutboundCalculateError(err, [...details, ...lackedDetails]),
        key: "calculate",
      });
      throw err;
    }
  };

  const handleConfirmOutbound = () => {
    if (selectedCount === 0) {
      message.warning("Vui lòng chọn ít nhất một dòng hàng để xác nhận xuất");
      return;
    }
    if (!orderId || !order) return;

    const warehouseId = order.warehouse_id || selectedWarehouseId;
    if (!warehouseId) {
      message.error("Thiếu thông tin kho");
      return;
    }

    const selectedDetails = details.filter((d) => selectedDetailIds.has(d.id));
    const missingUnit = selectedDetails.find((d) => !d.unit_id);
    if (missingUnit) {
      message.error(`Dòng #${missingUnit.id} thiếu đơn vị`);
      return;
    }

    Modal.confirm({
      title: "Xác nhận xuất",
      content: `Bạn có chắc muốn phân bổ ${selectedCount} dòng đã chọn?`,
      okText: "Xác nhận",
      cancelText: "Hủy",
      onOk: async () => {
        await runCalculate(
          selectedDetails.map((d) => ({
            id: d.id,
            item_id: d.item_id,
            quantity: d.quantity,
            unit_id: d.unit_id!,
            detail_type: d.detail_type || outboundType,
            details: d.details,
          })),
          () => setSelectedDetailIds(new Set()),
        );
      },
    });
  };

  const handleConfirmLackedReallocate = () => {
    if (selectedLackedCount === 0) {
      message.warning("Vui lòng chọn ít nhất một dòng thiếu để phân bổ lại");
      return;
    }

    const selectedLacked = lackedDetails.filter((l) =>
      selectedLackedIds.has(l.id),
    );

    Modal.confirm({
      title: "Phân bổ lại phần thiếu",
      content: `Bạn có chắc muốn phân bổ lại ${selectedLackedCount} dòng thiếu đã chọn?`,
      okText: "Xác nhận",
      cancelText: "Hủy",
      onOk: async () => {
        await runCalculate(
          selectedLacked.map((l) => ({
            id: l.id,
            item_id: l.item_id,
            quantity: l.quantity,
            unit_id: l.unit_id,
            detail_type: l.detail_type || outboundType,
            details: l.details,
          })),
          () => setSelectedLackedIds(new Set()),
        );
      },
    });
  };

  const { completedCount, totalCount, progressPercent, allInitialize, statusCounts } =
    useMemo(() => computeDetailProgress(details), [details]);

  const isLoading = isOrderLoading || isDetailsLoading || isLackedLoading;

  const handleDelete = () => {
    if (!order?.order_code) return;
    Modal.confirmDelete({
      content: `Bạn có chắc chắn muốn xóa đơn xuất "${order.order_code}"?`,
      onOk: () =>
        new Promise<void>((resolve, reject) => {
          deleteMutation.mutate(order.order_code, {
            onSuccess: () => {
              message.success("Xóa đơn xuất thành công!");
              navigate("/export");
              resolve();
            },
            onError: (err) => {
              message.error(apiError(err));
              reject();
            },
          });
        }),
    });
  };

  const baseDetailColumns: ColumnsType<OutboundOrderDetail> = [
    {
      title: "STT",
      key: "index",
      width: 70,
      render: (_, __, index) => (
        <span className="font-semibold">{index + 1}</span>
      ),
    },
    {
      title: "Part_number",
      key: "sku",
      render: (_, record) =>
        record.sku ? (
          <span className="font-medium">{record.sku}</span>
        ) : (
          `#${record.item_id}`
        ),
    },
    {
      title: "Tên sản phẩm",
      key: "item_name",
      ellipsis: true,
      render: (_, record) => displayValue(record.item_name),
    },
    {
      title: "Số lượng",
      key: "quantity",
      width: 110,
      render: (_, record) => (
        <span className="font-semibold">{record.quantity}</span>
      ),
    },
    {
      title: "Đơn vị",
      key: "unit",
      width: 120,
      render: (_, record) => record.unit,
    },
  ];

  const updatedAtColumn: ColumnsType<OutboundOrderDetail>[number] = {
    title: "Cập nhật",
    dataIndex: "updated_at",
    key: "updated_at",
    width: 160,
    render: (value: string | null) => formatDateTime(value),
  };

  const statusColumn: ColumnsType<OutboundOrderDetail>[number] = {
    title: "Trạng thái",
    dataIndex: "status",
    key: "status",
    width: 150,
    render: (status: string) => <OutboundStatusTag status={status} size="sm" />,
  };

  const allocationColumns: ColumnsType<OutboundOrderAllocation> = [
    {
      title: "Vị trí lấy",
      key: "from_location",
      width: 140,
      render: (_, record) =>
        displayLocationName(
          record.from_location_name,
          record.from_location_code,
          record.from_location_id,
        ),
    },
    {
      title: "Part_number",
      key: "sku",
      render: (_, record) =>
        record.sku ? (
          <span className="font-medium">{record.sku}</span>
        ) : (
          `#${record.item_id}`
        ),
    },
    {
      title: "Số lô",
      key: "lot_number",
      width: 120,
      render: (_, record) => displayValue(record.lot_number),
    },
    {
      title: "Số lượng",
      key: "quantity",
      width: 110,
      render: (_, record) => (
        <span className="font-semibold">{record.quantity}</span>
      ),
    },
    {
      title: "Cập nhật",
      dataIndex: "updated_at",
      key: "updated_at",
      width: 160,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => <OutboundStatusTag status={status} size="sm" />,
    },
  ];

  const detailColumns: ColumnsType<OutboundOrderDetail> = [
    {
      title: (
        <Checkbox
          checked={allSelectableSelected}
          indeterminate={someSelectableSelected}
          disabled={selectableDetails.length === 0}
          onChange={(e) => handleSelectAll(e.target.checked)}
        />
      ),
      key: "select",
      width: 48,
      align: "center",
      render: (_, record) => (
        <Checkbox
          checked={selectedDetailIds.has(record.id)}
          disabled={record.status !== "initialize"}
          onChange={(e) => toggleDetailSelection(record.id, e.target.checked)}
        />
      ),
    },
    ...baseDetailColumns,
    updatedAtColumn,
    statusColumn,
  ];

  const robotTaskColumns: ColumnsType<OutboundRobotTask> = [
    {
      title: "Loại",
      key: "task_type",
      width: 90,
      render: (_, record) => (
        <span className="font-semibold">
          {TASK_TYPE_LABEL[record.task_type] ?? record.task_type}
        </span>
      ),
    },
    {
      title: "Mã lệnh",
      dataIndex: "order_id",
      key: "order_id",
      render: (orderId: string) => (
        <span className="font-medium">{orderId}</span>
      ),
    },
    {
      title: "Số lượng",
      key: "quantity",
      width: 110,
      render: (_, record) => (
        <span className="font-semibold">{record.quantity}</span>
      ),
    },
    {
      title: "Vị trí đầu",
      key: "start_location",
      width: 220,
      render: (_, record) => renderTaskLocationCell(record, "start"),
    },
    {
      title: "Vị trí cuối",
      key: "end_location",
      width: 220,
      render: (_, record) => renderTaskLocationCell(record, "end"),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (_, record) => {
        const displayStatus = getRobotTaskDisplayStatus(record);
        if (displayStatus === "initialize") {
          const { startId, endId, needsStartPick, needsEndPick } =
            getTaskLocationIds(record);
          const missingStart = needsStartPick && !startId;
          const missingEnd = needsEndPick && !endId;

          return (
            <Button
              variant="primary"
              icon={<PlayCircleOutlined />}
              loading={executingTaskOrderId === record.order_id}
              disabled={missingStart || missingEnd}
              title={
                missingStart || missingEnd
                  ? "Chọn vị trí còn thiếu trước khi thực thi"
                  : undefined
              }
              onClick={() => void handleExecuteRobotTask(record)}
            >
              Execute
            </Button>
          );
        }
        return <OutboundStatusTag status={displayStatus} size="sm" />;
      },
    },
  ];

  const robotTaskAllocationColumns: ColumnsType<OutboundOrderAllocation> = [
    {
      title: "Part_number",
      key: "sku",
      render: (_, record) =>
        record.sku ? (
          <span className="font-medium">{record.sku}</span>
        ) : (
          `#${record.item_id}`
        ),
    },
    {
      title: "Số lô",
      key: "lot_number",
      width: 120,
      render: (_, record) => displayValue(record.lot_number),
    },
    {
      title: "Số lượng",
      key: "quantity",
      width: 110,
      render: (_, record) => (
        <span className="font-semibold">{record.quantity}</span>
      ),
    },
  ];

  const renderRobotTaskExpandedRow = (record: OutboundRobotTask) => (
    <div className="mx-2 my-1 rounded-lg bg-slate-50/60 px-3 py-2">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Chi tiết phân bổ
      </div>
      {record.allocations.length > 0 ? (
        <Table
          columns={robotTaskAllocationColumns}
          dataSource={record.allocations}
          pagination={false}
          rowKey="id"
          size="small"
        />
      ) : (
        <p className="text-sm text-slate-400 italic">Chưa có phân bổ</p>
      )}
    </div>
  );

  const renderExpandedRow = (record: OutboundOrderDetail) => (
    <div className="mx-2 my-1 space-y-2 rounded-lg bg-slate-50/60 px-3 py-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Phân bổ xuất
      </div>
        {record.allocations.length > 0 ? (
          <Table
            columns={allocationColumns}
            dataSource={record.allocations}
            pagination={false}
            rowKey="id"
            size="small"
          />
        ) : (
          <p className="text-sm text-slate-400 italic">Chưa có phân bổ</p>
        )}
        <DetailsEntriesPanel
          entries={getDetailEntries(record.details)}
          formatKey={formatDetailLineKey}
          title="Chi tiết dòng"
          emptyText="Không có dữ liệu bổ sung"
      />
    </div>
  );

  const lackedColumns: ColumnsType<LackedDetail> = [
    {
      title: (
        <Checkbox
          checked={allLackedSelected}
          indeterminate={someLackedSelected}
          disabled={lackedDetails.length === 0}
          onChange={(e) => handleSelectAllLacked(e.target.checked)}
        />
      ),
      key: "select",
      width: 48,
      align: "center",
      render: (_, record) => (
        <Checkbox
          checked={selectedLackedIds.has(record.id)}
          onChange={(e) => toggleLackedSelection(record.id, e.target.checked)}
        />
      ),
    },
    {
      title: "Mã dòng",
      dataIndex: "id",
      key: "id",
      width: 90,
      render: (id: number) => <span className="font-medium">#{id}</span>,
    },
    {
      title: "Part_number",
      key: "sku",
      render: (_, record) =>
        record.sku ? (
          <span className="font-medium">{record.sku}</span>
        ) : (
          `#${record.item_id}`
        ),
    },
    {
      title: "Tên sản phẩm",
      key: "item_name",
      ellipsis: true,
      render: (_, record) => displayValue(record.item_name),
    },
    {
      title: "Yêu cầu",
      dataIndex: "requested_quantity",
      key: "requested_quantity",
      width: 100,
    },
    {
      title: "Còn thiếu",
      dataIndex: "quantity",
      key: "quantity",
      width: 100,
      render: (qty: number) => (
        <span className="font-semibold text-amber-700">{qty}</span>
      ),
    },
    {
      title: "Đơn vị",
      key: "unit",
      width: 100,
      render: (_, record) => displayValue(record.unit),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-500 font-medium">
        Đang tải chi tiết đơn xuất...
      </div>
    );
  }

  if (!order || !orderId) {
    return (
      <div className="flex flex-col justify-center items-center h-64 text-slate-500 font-medium gap-4">
        <div>Không tìm thấy đơn xuất hợp lệ!</div>
        <Button onClick={() => navigate("/export")}>Quay lại danh sách</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Button
            variant="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/export")}
          />
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-800">
              Đơn xuất kho:{" "}
              <span className="text-brand-primary">{order.order_code}</span>
            </h2>
            <div className="text-slate-400 text-sm mt-1">
              Tiến độ {progressPercent}% · {completedCount}/{totalCount} dòng
              hoàn thành
            </div>
          </div>
        </div>
        <Space className="shrink-0">
          <Button
            variant="edit"
            icon={<EditOutlined />}
            disabled={!allInitialize}
            title={
              !allInitialize
                ? "Chỉ đơn ở trạng thái khởi tạo mới được chỉnh sửa"
                : undefined
            }
            onClick={() => setIsEditOpen(true)}
          >
            Chỉnh sửa
          </Button>
          <Button
            variant="dangerText"
            icon={<DeleteOutlined />}
            disabled={!allInitialize || details.length === 0}
            loading={deleteMutation.isPending}
            title={
              !allInitialize
                ? "Chỉ đơn ở trạng thái khởi tạo mới được xóa"
                : undefined
            }
            onClick={handleDelete}
          >
            Xóa
          </Button>
        </Space>
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-0">
          <div className="lg:border-r lg:border-slate-200 lg:pr-6">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Thông tin đơn xuất
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Người tạo</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-800">
                  {userNameById.get(order.created_by_id) ??
                    `#${order.created_by_id}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Trạng thái</dt>
                <dd className="mt-1">
                  <OutboundStatusTag status={order.status} size="sm" />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Loại xuất</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-800">
                  {displayValue(outboundType)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Ngày cập nhật</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-800">
                  {formatDateTime(order.updated_at)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Ghi chú</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-800 whitespace-pre-wrap">
                  {displayValue(order.note)}
                </dd>
              </div>
            </dl>
            <DetailsEntriesPanel
              entries={orderExtraDetails}
              formatKey={formatOrderDetailKey}
              title="Thông tin bổ sung"
              emptyText="Không có thông tin bổ sung"
            />
          </div>

          <div className="flex items-center justify-between gap-6 lg:pl-6">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Tiến độ chi tiết
              </div>
              <ul className="space-y-0.5 text-xs text-slate-500">
                <li>
                  Còn {statusCounts.initialize} lệnh khởi tạo (initialize)
                </li>
                <li>
                  Có {statusCounts.reserved} lệnh đã được giữ chỗ (reserved)
                </li>
                <li>
                  Đang xuất {statusCounts.in_progress} lệnh (in_progress)
                </li>
                <li>
                  Hoàn thành {statusCounts.completed} lệnh (completed)
                </li>
              </ul>
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg border border-stripe-hairline bg-slate-50 p-3">
              <Progress
                type="circle"
                percent={progressPercent}
                size={70}
                strokeColor="var(--color-brand-primary)"
              />
              <div className="mt-2 text-xs font-bold text-slate-500">
                {progressPercent}%
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="overflow-hidden rounded-xl border border-gray-100/50 shadow-sm">
        <div className="flex items-stretch gap-0 border-b border-stripe-hairline bg-[#eef2f6]">
          {OUTBOUND_DETAIL_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative min-h-11 min-w-[160px] px-6 py-3 text-sm font-semibold transition-all",
                  isActive
                    ? "z-10 -mb-px border border-stripe-hairline border-b-white bg-white text-brand-primary shadow-[0_1px_0_0_#fff]"
                    : "mb-0 border border-transparent bg-transparent text-stripe-ink-mute hover:bg-white/40 hover:text-brand-dark",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <Card className="!rounded-none border-0 shadow-none overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
            <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
              {activeTab === "list" ? "Danh sách hàng xuất" : "Lệnh phân bổ"}
            </h3>
            {activeTab === "list" && (
              <Space className="shrink-0">
                {progressPercent === 100 && totalCount > 0 && (
                  <OutboundStatusTag
                    status="completed"
                    size="sm"
                    className="px-2 py-0.5 text-xs font-semibold tracking-normal"
                  />
                )}
                <Button
                  variant="primary"
                  icon={<CheckCircleOutlined />}
                  disabled={selectedCount === 0}
                  loading={calculateMutation.isPending}
                  onClick={handleConfirmOutbound}
                >
                  Xác nhận xuất
                  {selectedCount > 0 ? ` (${selectedCount})` : ""}
                </Button>
              </Space>
            )}
          </div>
          <div className="p-5">
            {activeTab === "list" ? (
              <Table
                columns={detailColumns}
                dataSource={details}
                pagination={false}
                rowKey="id"
                size="middle"
                className={TABLE_CLASS}
                expandable={{
                  expandIconColumnIndex: 1,
                  expandedRowRender: renderExpandedRow,
                  rowExpandable: () => true,
                }}
              />
            ) : isRobotTasksLoading ? (
              <div className="py-12 text-center text-slate-500">
                Đang tải lệnh phân bổ...
              </div>
            ) : robotTasks.length === 0 ? (
              <div className="py-12 text-center text-slate-400 italic">
                Chưa hàng nào được phân bổ
              </div>
            ) : (
              <Table
                columns={robotTaskColumns}
                dataSource={robotTasks}
                pagination={false}
                rowKey="order_id"
                size="middle"
                className={TABLE_CLASS}
                rowClassName={(record) =>
                  record.task_type === "return"
                    ? "bg-red-50"
                    : "bg-brand-primary/10"
                }
                expandable={{
                  expandIconColumnIndex: 1,
                  expandedRowRender: renderRobotTaskExpandedRow,
                  rowExpandable: (record) => record.allocations.length > 0,
                }}
              />
            )}
          </div>
        </Card>
      </div>

      {activeTab === "list" && lackedDetails.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-amber-100 bg-amber-50/60 px-5 py-4">
            <h3 className="text-base font-semibold text-amber-900">
              Hàng đã phân bổ nhưng thiếu ({lackedDetails.length})
            </h3>
            <Button
              variant="primary"
              icon={<CheckCircleOutlined />}
              disabled={selectedLackedCount === 0}
              loading={calculateMutation.isPending}
              onClick={handleConfirmLackedReallocate}
            >
              Phân bổ lại
              {selectedLackedCount > 0 ? ` (${selectedLackedCount})` : ""}
            </Button>
          </div>
          <div className="p-5">
            <Table
              columns={lackedColumns}
              dataSource={lackedDetails}
              pagination={false}
              rowKey="id"
              size="middle"
              className={TABLE_CLASS}
            />
          </div>
        </Card>
      )}

      <CreateOutboundModal
        open={isEditOpen}
        mode="edit"
        editOrderId={orderId}
        editOrderCode={order.order_code}
        initialNote={order.note ?? ""}
        initialDetails={order.details}
        initialItems={editInitialItems}
        onCancel={() => setIsEditOpen(false)}
        onSuccess={() => {
          setIsEditOpen(false);
          void refetchOrder();
          void refetchDetails();
        }}
      />
    </div>
  );
}
