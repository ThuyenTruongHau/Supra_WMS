import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import { DatePicker, InputNumber, Tag } from "antd";
import { AxiosError } from "axios";
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  UserOutlined,
  UnorderedListOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CarOutlined,
} from "@ant-design/icons";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  message,
  cn,
} from "@/components/ui";
import { DetailView } from "@/components/ui/DetailView";
import type { DetailFieldSchema } from "@/components/ui/DetailView";
import {
  useOutboundOrderDetail,
  useUpdateOutboundOrder,
  useDeleteOutboundOrder,
  useSuggestOutboundAllocations,
  useConfirmOutboundAllocations,
  useOutboundRobotTasks,
} from "@/hooks/useOutbound";
import { SkuSearchSelect } from "@/components/shared/SkuSearchSelect";
import { useAppStore } from "@/store/useAppStore";
import { useZone } from "@/hooks/useZone";
import type {
  OutboundDetail,
  OutboundOrderDetail as OutboundOrderDetailType,
  OutboundOrderUpdateInput,
  OutboundShipment,
  OutboundWorkflowAllocation,
  OutboundShortage,
  OutboundWorkflowOut,
  RobotTaskTracking,
} from "@/types/outbound";
import type { ApiErrorResponse } from "@/types/apiError";
import dayjs from "dayjs";

type ListViewTab = "by_customer" | "by_vehicle" | "by_order";

type VehicleShipmentGroup = {
  key: string;
  vehicle_number: string | null;
  trip: string | null;
  carrier_name: string | null;
  shipments: OutboundShipment[];
};

function groupShipmentsByVehicle(
  shipments: OutboundShipment[],
): VehicleShipmentGroup[] {
  const groups = new Map<string, VehicleShipmentGroup>();

  for (const shipment of shipments) {
    const vehicle = shipment.vehicle_number?.trim() || null;
    const key = vehicle ?? "__unassigned__";
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        vehicle_number: vehicle,
        trip: shipment.trip?.trim() || null,
        carrier_name: shipment.carrier_name?.trim() || null,
        shipments: [shipment],
      });
      continue;
    }

    if (!existing.trip && shipment.trip?.trim()) {
      existing.trip = shipment.trip.trim();
    }
    if (!existing.carrier_name && shipment.carrier_name?.trim()) {
      existing.carrier_name = shipment.carrier_name.trim();
    }
    existing.shipments.push(shipment);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.key === "__unassigned__") return 1;
    if (b.key === "__unassigned__") return -1;
    return (a.vehicle_number ?? "").localeCompare(
      b.vehicle_number ?? "",
      "vi",
    );
  });
}

const SUGGESTABLE_STATUSES = new Set(["draft", "allocation_suggested"]);

const CONFIRMABLE_STATUSES = new Set([
  "allocation_suggested",
  "awaiting_bypass",
]);

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: "default",
  dispatched: "processing",
  accepted: "processing",
  running: "blue",
  succeeded: "green",
  failed: "red",
  cancel_requested: "orange",
  cancelled: "default",
  manual_intervention: "warning",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ",
  dispatched: "Đã gửi",
  accepted: "Đã nhận",
  running: "Đang chạy",
  succeeded: "Thành công",
  failed: "Thất bại",
  cancel_requested: "Yêu cầu hủy",
  cancelled: "Đã hủy",
  manual_intervention: "Can thiệp thủ công",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  PICK_FROM_LOCATION: "Lấy hàng",
  RETURN_TO_LOCATION: "Trả về",
  CROSS_DOCK_TRANSFER: "Cross-dock",
  PUTAWAY_REMAINDER: "Cất phần dư",
};

function errorDetail(err: unknown, fallback: string) {
  if (err instanceof AxiosError) {
    const detail = (err.response?.data as ApiErrorResponse | undefined)?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "default",
  allocation_suggested: "processing",
  awaiting_bypass: "warning",
  confirmed: "blue",
  picking: "orange",
  partially_completed: "gold",
  completed: "green",
  cancelled: "red",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Nháp",
  allocation_suggested: "Đã gợi ý phân bổ",
  awaiting_bypass: "Chờ bypass",
  confirmed: "Đã xác nhận",
  picking: "Đang lấy hàng",
  partially_completed: "Hoàn thành một phần",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

function formatDate(date?: string | null) {
  if (!date) return "—";
  return dayjs(date).format("DD/MM/YYYY");
}

function formatDateTime(date?: string | null) {
  if (!date) return "—";
  return dayjs(date).format("DD/MM/YYYY HH:mm");
}

const detailColumns: ColumnsType<OutboundDetail> = [
  {
    title: "SKU",
    key: "sku",
    render: (_, record) => (
      <span className="font-semibold text-brand-primary">
        {record.item.sku}
      </span>
    ),
  },
  {
    title: "Tên sản phẩm",
    key: "name",
    render: (_, record) => (
      <span className="text-brand-dark">{record.item.name}</span>
    ),
  },
  {
    title: "Mã sản phẩm",
    key: "product_code",
    render: (_, record) => record.item.product_code,
  },
  {
    title: "Số lượng yêu cầu",
    key: "quantity",
    align: "right",
    render: (_, record) => (
      <span className="font-semibold text-brand-dark">
        {Number(record.requested_quantity).toLocaleString("vi-VN")}{" "}
        {record.requested_unit}
      </span>
    ),
  },
  {
    title: "Chiến lược lấy hàng",
    dataIndex: "allocation_strategy",
    key: "allocation_strategy",
    render: (v: string) => <Tag color="blue">{v}</Tag>,
  },
  {
    title: "Ghi chú",
    dataIndex: "notes",
    key: "notes",
    render: (v: string | null) => v || <span className="text-gray-400">—</span>,
  },
];

const robotTaskColumns: ColumnsType<RobotTaskTracking> = [
  {
    title: "ID lệnh",
    key: "task_id",
    width: 90,
    render: (_, row) => (
      <span className="font-semibold text-brand-primary">{row.task.id}</span>
    ),
  },
  {
    title: "Khách hàng",
    dataIndex: "customer_name",
    key: "customer_name",
    render: (name: string) => (
      <span className="font-medium text-brand-dark">{name}</span>
    ),
  },
  {
    title: "Loại lệnh",
    key: "task_type",
    render: (_, row) =>
      TASK_TYPE_LABELS[row.task.task_type] ?? row.task.task_type,
  },
  {
    title: "Vị trí nguồn",
    key: "location_code",
    render: (_, row) => row.task.location_code,
  },
  {
    title: "Điểm đến",
    key: "destination",
    render: (_, row) =>
      row.task.end_point_code ||
      row.task.destination_location_code || (
        <span className="text-gray-400">—</span>
      ),
  },
  {
    title: "Số lượng",
    key: "quantity",
    align: "right",
    render: (_, row) => Number(row.task.quantity).toLocaleString("vi-VN"),
  },
  {
    title: "Trạng thái",
    key: "status",
    render: (_, row) => (
      <Tag color={TASK_STATUS_COLORS[row.task.status] ?? "default"}>
        {TASK_STATUS_LABELS[row.task.status] ?? row.task.status}
      </Tag>
    ),
  },
  {
    title: "Tạo lúc",
    key: "created_at",
    render: (_, row) => formatDateTime(row.task.created_at),
  },
  {
    title: "Lỗi",
    key: "failure",
    render: (_, row) =>
      row.task.failure_message || <span className="text-gray-400">—</span>,
  },
];

const suggestionColumns: ColumnsType<OutboundWorkflowAllocation> = [
  {
    title: "Khách hàng",
    dataIndex: "customer_name",
    key: "customer_name",
    render: (name: string) => (
      <span className="font-medium text-brand-dark">{name}</span>
    ),
  },
  {
    title: "SKU",
    key: "sku",
    render: (_, row) => (
      <span className="font-semibold text-brand-primary">{row.item.sku}</span>
    ),
  },
  {
    title: "Sản phẩm",
    key: "name",
    render: (_, row) => row.item.name,
  },
  {
    title: "Vị trí",
    key: "location",
    render: (_, row) => row.source_location.location_code,
  },
  {
    title: "Lot",
    key: "lot",
    render: (_, row) =>
      row.item_stock.lot_number || <span className="text-gray-400">—</span>,
  },
  {
    title: "HSD",
    key: "expiry",
    render: (_, row) => formatDate(row.item_stock.expiry_date),
  },
  {
    title: "SL gợi ý",
    key: "planned",
    align: "right",
    render: (_, row) => (
      <span className="font-semibold text-brand-dark">
        {Number(row.planned_ship_quantity).toLocaleString("vi-VN")}{" "}
        {row.item.base_unit}
      </span>
    ),
  },
  {
    title: "Chiến lược",
    dataIndex: "strategy_used",
    key: "strategy_used",
    render: (v: string) => <Tag color="blue">{v}</Tag>,
  },
  {
    title: "Trạng thái",
    dataIndex: "status",
    key: "status",
    render: (v: string) => <Tag>{v}</Tag>,
  },
];

const shortageColumns: ColumnsType<OutboundShortage> = [
  {
    title: "Khách hàng",
    dataIndex: "customer_name",
    key: "customer_name",
  },
  {
    title: "SKU",
    key: "sku",
    render: (_, row) => row.item.sku,
  },
  {
    title: "Sản phẩm",
    key: "name",
    render: (_, row) => row.item.name,
  },
  {
    title: "Yêu cầu",
    key: "requested",
    align: "right",
    render: (_, row) => Number(row.requested_quantity).toLocaleString("vi-VN"),
  },
  {
    title: "Đã gợi ý",
    key: "allocated",
    align: "right",
    render: (_, row) => Number(row.allocated_quantity).toLocaleString("vi-VN"),
  },
  {
    title: "Thiếu",
    key: "shortage",
    align: "right",
    render: (_, row) => (
      <span className="font-semibold text-red-600">
        {Number(row.shortage_quantity).toLocaleString("vi-VN")}
      </span>
    ),
  },
];

export default function OutboundDetailPage() {
  const { orderCode } = useParams<{ orderCode: string }>();
  const navigate = useNavigate();
  const { selectedWarehouseId } = useAppStore();
  const { data: zones = [] } = useZone();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [listViewTab, setListViewTab] = useState<ListViewTab>("by_customer");
  const [suggestPreview, setSuggestPreview] =
    useState<OutboundWorkflowOut | null>(null);
  const suggestOnceRef = useRef<string | null>(null);

  const { data: order, isLoading, isError } = useOutboundOrderDetail(orderCode);
  const deleteMutation = useDeleteOutboundOrder();
  const suggestMutation = useSuggestOutboundAllocations();
  const confirmMutation = useConfirmOutboundAllocations();

  const {
    data: robotTasksData,
    isLoading: isRobotTasksLoading,
    isFetching: isRobotTasksFetching,
  } = useOutboundRobotTasks(orderCode, {
    enabled: listViewTab === "by_order" && !!orderCode,
  });

  const warehouseName =
    zones.find((z) => z.id === selectedWarehouseId)?.name ?? "Chưa chọn kho";

  const hasRobotTasks = (robotTasksData?.total_tasks ?? 0) > 0;

  useEffect(() => {
    if (listViewTab !== "by_order") {
      suggestOnceRef.current = null;
      setSuggestPreview(null);
      return;
    }
    if (!orderCode || !order || !robotTasksData) return;
    if (hasRobotTasks) {
      setSuggestPreview(null);
      return;
    }
    if (!SUGGESTABLE_STATUSES.has(order.status)) return;

    const runKey = `${orderCode}:suggest`;
    if (suggestOnceRef.current === runKey) return;
    suggestOnceRef.current = runKey;

    let cancelled = false;
    const run = async () => {
      try {
        const workflow = await suggestMutation.mutateAsync(orderCode);
        if (cancelled) return;
        setSuggestPreview(workflow);
        const shortageCount = workflow.shortages?.length ?? 0;
        if (shortageCount > 0) {
          message.warning(
            `Đã gợi ý phân bổ nhưng còn ${shortageCount} dòng thiếu hàng (FEFO). Kiểm tra trước khi Confirm.`,
          );
        } else {
          message.success(
            `Đã gợi ý ${workflow.allocations.length} phân bổ. Vui lòng bấm Confirm để tạo lệnh.`,
          );
        }
      } catch (err) {
        if (cancelled) return;
        setSuggestPreview(null);
        message.error(errorDetail(err, "Không thể gợi ý phân bổ"));
      }
    };
    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    listViewTab,
    orderCode,
    order?.status,
    robotTasksData?.total_tasks,
    hasRobotTasks,
  ]);

  const handleManualConfirm = async () => {
    if (!orderCode) return;
    try {
      await confirmMutation.mutateAsync(orderCode);
      setSuggestPreview(null);
      message.success("Đã xác nhận phân bổ — lệnh robot đã được tạo");
    } catch (err) {
      message.error(errorDetail(err, "Không thể xác nhận phân bổ"));
    }
  };

  const vehicleGroups = useMemo(
    () => groupShipmentsByVehicle(order?.shipments ?? []),
    [order?.shipments],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-500 font-medium">
        Đang tải chi tiết đơn xuất...
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="space-y-4">
        <Button
          variant="secondary"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/export")}
        >
          Quay lại
        </Button>
        <Card>
          <p className="text-gray-500">
            Không tìm thấy đơn xuất với mã &quot;{orderCode}&quot;.
          </p>
        </Card>
      </div>
    );
  }

  const isDraft = order.status === "draft";
  const canManualConfirm =
    !hasRobotTasks && CONFIRMABLE_STATUSES.has(order.status);
  const isWorkflowBusy =
    suggestMutation.isPending ||
    confirmMutation.isPending ||
    (listViewTab === "by_order" &&
      (isRobotTasksLoading || isRobotTasksFetching));
  const totalCustomers = order.shipments.length;
  const totalItems = order.shipments.reduce(
    (sum, s) => sum + s.details.length,
    0,
  );
  const totalQuantity = order.shipments.reduce(
    (sum, s) =>
      sum + s.details.reduce((q, d) => q + Number(d.requested_quantity), 0),
    0,
  );

  const orderDetailFields: DetailFieldSchema<OutboundOrderDetailType>[] = [
    {
      key: "requested_date",
      label: "Ngày yêu cầu",
      render: (o) => formatDate(o.requested_date),
    },
    {
      key: "creator",
      label: "Người tạo",
      render: (o) => o.creator.username,
    },
    {
      key: "customers",
      label: "Số khách hàng",
      render: () => totalCustomers,
    },
    {
      key: "totals",
      label: "Tổng SP / SL",
      render: () =>
        `${totalItems} SP / ${totalQuantity.toLocaleString("vi-VN")}`,
    },
    {
      key: "created_at",
      label: "Ngày tạo",
      render: (o) => formatDateTime(o.created_at),
    },
    {
      key: "updated_at",
      label: "Ngày cập nhật",
      render: (o) => formatDateTime(o.updated_at),
    },
    {
      key: "notes",
      label: "Ghi chú",
      render: (o) => o.notes || "—",
    },
  ];

  const handleDelete = () => {
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
            onError: (err: any) => {
              message.error(
                err.response?.data?.detail ?? "Không thể xóa đơn xuất",
              );
              reject();
            },
          });
        }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/export")}
          >
            Quay lại
          </Button>
          <h2 className="text-2xl font-bold text-brand-dark">
            Chi tiết đơn xuất
          </h2>
        </div>
        <span className="text-sm text-gray-400">{warehouseName}</span>
      </div>

      <Card className="rounded-xl">
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <p className="text-lg font-semibold text-brand-primary">
                {order.order_code}
              </p>
              <Tag color={STATUS_COLORS[order.status] ?? "default"}>
                {STATUS_LABELS[order.status] ?? order.status}
              </Tag>
            </div>
          </div>
          <Space className="shrink-0">
            <Button
              variant="edit"
              icon={<EditOutlined />}
              onClick={() => setIsEditOpen(true)}
              disabled={!isDraft}
              title={
                !isDraft
                  ? "Chỉ đơn ở trạng thái Nháp mới được chỉnh sửa"
                  : undefined
              }
            >
              Chỉnh sửa
            </Button>
            <Button
              variant="dangerText"
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              loading={deleteMutation.isPending}
              disabled={!isDraft || deleteMutation.isPending}
              className="hover:bg-red-50 rounded-lg"
              title={
                !isDraft ? "Chỉ đơn ở trạng thái Nháp mới được xóa" : undefined
              }
            >
              Xóa
            </Button>
          </Space>
        </div>

        <DetailView data={order} fields={orderDetailFields} className="px-5" />

        <div className="border-b border-gray-100 px-5 py-4 space-y-4">
          <h3 className="text-base font-semibold text-brand-dark">
            Danh sách khách hàng &amp; sản phẩm
          </h3>
          <div className="flex flex-wrap gap-2">
            {(
              [
                {
                  key: "by_customer" as const,
                  label: "Theo khách hàng",
                  icon: UserOutlined,
                },
                {
                  key: "by_vehicle" as const,
                  label: "Theo xe",
                  icon: CarOutlined,
                },
                {
                  key: "by_order" as const,
                  label: "Theo lệnh",
                  icon: FileTextOutlined,
                },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = listViewTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setListViewTab(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                      : "border-gray-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <Icon className="text-base" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {listViewTab === "by_customer" ? (
          <div className="divide-y divide-gray-100">
            {order.shipments.map((shipment, idx) => (
              <div key={shipment.id} className="px-5 py-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <UserOutlined className="text-brand-primary" />
                  <span className="font-semibold text-brand-dark">
                    Khách hàng #{idx + 1}: {shipment.customer_name}
                  </span>
                  {shipment.requested_date && (
                    <span className="text-sm text-gray-400">
                      — Ngày yêu cầu: {formatDate(shipment.requested_date)}
                    </span>
                  )}
                </div>
                <div className="mb-3 grid grid-cols-1 gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-slate-400">Số xe</div>
                    <div className="font-medium text-brand-dark">
                      {shipment.vehicle_number || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Trip</div>
                    <div className="font-medium text-brand-dark">
                      {shipment.trip || "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Nhà vận tải</div>
                    <div className="font-medium text-brand-dark">
                      {shipment.carrier_name || "—"}
                    </div>
                  </div>
                </div>
                {shipment.notes && (
                  <p className="mb-3 text-sm text-gray-500">
                    Ghi chú: {shipment.notes}
                  </p>
                )}
                <Table<OutboundDetail>
                  columns={detailColumns}
                  dataSource={shipment.details}
                  rowKey="id"
                  pagination={false}
                  className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
                />
              </div>
            ))}
          </div>
        ) : listViewTab === "by_vehicle" ? (
          <div className="divide-y divide-gray-100">
            {vehicleGroups.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-slate-400">
                Chưa có shipment trong đơn xuất.
              </p>
            ) : (
              vehicleGroups.map((group, groupIdx) => (
                <div key={group.key} className="px-5 py-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <CarOutlined className="text-brand-primary" />
                    <span className="font-semibold text-brand-dark">
                      Xe #{groupIdx + 1}:{" "}
                      {group.vehicle_number || "Chưa gán số xe"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {group.shipments.length} khách
                    </span>
                  </div>
                  <div className="mb-4 grid grid-cols-1 gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm sm:grid-cols-3">
                    <div>
                      <div className="text-xs text-slate-400">Số xe</div>
                      <div className="font-medium text-brand-dark">
                        {group.vehicle_number || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Trip</div>
                      <div className="font-medium text-brand-dark">
                        {group.trip || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Nhà vận tải</div>
                      <div className="font-medium text-brand-dark">
                        {group.carrier_name || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 border-l-2 border-brand-primary/20 pl-4">
                    {group.shipments.map((shipment, customerIdx) => (
                      <div key={shipment.id}>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <UserOutlined className="text-slate-400" />
                          <span className="font-medium text-brand-dark">
                            Khách #{customerIdx + 1}: {shipment.customer_name}
                          </span>
                          {shipment.requested_date && (
                            <span className="text-sm text-gray-400">
                              — Ngày yêu cầu:{" "}
                              {formatDate(shipment.requested_date)}
                            </span>
                          )}
                        </div>
                        {shipment.notes && (
                          <p className="mb-2 text-sm text-gray-500">
                            Ghi chú: {shipment.notes}
                          </p>
                        )}
                        <Table<OutboundDetail>
                          columns={detailColumns}
                          dataSource={shipment.details}
                          rowKey="id"
                          pagination={false}
                          size="small"
                          className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="px-5 py-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <UnorderedListOutlined />
                <span>
                  Lệnh robot cho đơn xuất{" "}
                  <span className="font-semibold text-brand-dark">
                    {order.order_code}
                  </span>
                </span>
                {robotTasksData && hasRobotTasks && (
                  <span className="text-xs text-slate-400">
                    ({robotTasksData.total_tasks} lệnh ·{" "}
                    {robotTasksData.pending_tasks} chờ ·{" "}
                    {robotTasksData.succeeded_tasks} OK ·{" "}
                    {robotTasksData.failed_tasks} lỗi)
                  </span>
                )}
                {(isRobotTasksLoading || suggestMutation.isPending) && (
                  <span className="text-xs text-slate-400">Đang tải…</span>
                )}
              </div>
              {canManualConfirm && (
                <Button
                  variant="primary"
                  icon={<CheckCircleOutlined />}
                  loading={isWorkflowBusy}
                  disabled={isWorkflowBusy}
                  onClick={() => void handleManualConfirm()}
                >
                  Confirm
                </Button>
              )}
            </div>

            {isRobotTasksLoading && !robotTasksData ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Đang tải danh sách lệnh…
              </p>
            ) : hasRobotTasks ? (
              <Table<RobotTaskTracking>
                columns={robotTaskColumns}
                dataSource={robotTasksData!.tasks}
                rowKey={(row) => row.task.id}
                pagination={false}
                className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
              />
            ) : suggestMutation.isPending ? (
              <p className="py-8 text-center text-sm text-slate-400">
                Đang gợi ý phân bổ…
              </p>
            ) : suggestPreview ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                  <span>
                    Yêu cầu:{" "}
                    <strong className="text-brand-dark">
                      {Number(suggestPreview.requested_quantity).toLocaleString(
                        "vi-VN",
                      )}
                    </strong>
                  </span>
                  <span>
                    Gợi ý xuất:{" "}
                    <strong className="text-brand-dark">
                      {Number(
                        suggestPreview.planned_ship_quantity,
                      ).toLocaleString("vi-VN")}
                    </strong>
                  </span>
                  <span>
                    Phân bổ:{" "}
                    <strong className="text-brand-dark">
                      {suggestPreview.allocations.length}
                    </strong>
                  </span>
                </div>

                <Table<OutboundWorkflowAllocation>
                  columns={suggestionColumns}
                  dataSource={suggestPreview.allocations}
                  rowKey="id"
                  pagination={false}
                  className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
                />

                {suggestPreview.shortages.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-amber-700">
                      Thiếu hàng FEFO ({suggestPreview.shortages.length}) — cần
                      bypass trước khi Confirm
                    </p>
                    <Table<OutboundShortage>
                      columns={shortageColumns}
                      dataSource={suggestPreview.shortages}
                      rowKey="outbound_order_detail_id"
                      pagination={false}
                      size="small"
                      className="[&_.ant-table-thead_th]:!bg-amber-50 [&_.ant-table-thead_th]:!text-amber-800"
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                {canManualConfirm
                  ? "Chưa có lệnh robot. Bấm Confirm để xác nhận phân bổ và tạo lệnh."
                  : "Chưa có lệnh robot cho đơn xuất này."}
              </p>
            )}
          </div>
        )}
      </Card>

      <EditOutboundOrderModal
        open={isEditOpen}
        order={order}
        onClose={() => setIsEditOpen(false)}
      />
    </div>
  );
}

type EditModalProps = {
  open: boolean;
  order: OutboundOrderDetailType;
  onClose: () => void;
};

function EditOutboundOrderModal({ open, order, onClose }: EditModalProps) {
  const [form] = Form.useForm();
  const updateMutation = useUpdateOutboundOrder();
  const { selectedWarehouseId } = useAppStore();

  const handleAfterOpen = (opened: boolean) => {
    if (!opened) return;
    form.setFieldsValue({
      requested_date: order.requested_date
        ? dayjs(order.requested_date)
        : undefined,
      notes: order.notes ?? undefined,
      shipments: order.shipments.map((s) => ({
        id: s.id,
        customer_name: s.customer_name,
        vehicle_number: s.vehicle_number ?? undefined,
        trip: s.trip ?? undefined,
        carrier_name: s.carrier_name ?? undefined,
        requested_date: s.requested_date ? dayjs(s.requested_date) : undefined,
        notes: s.notes ?? undefined,
        details: s.details.map((d) => ({
          id: d.id,
          sku: d.item.sku,
          requested_quantity: Number(d.requested_quantity),
          notes: d.notes ?? undefined,
        })),
      })),
    });
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();

    if (!selectedWarehouseId) {
      message.error("Vui lòng chọn kho trước khi cập nhật đơn xuất");
      return;
    }

    const payload: OutboundOrderUpdateInput = {
      zone_id: selectedWarehouseId,
      requested_date: values.requested_date?.format("YYYY-MM-DD") ?? null,
      notes: values.notes || null,
      shipments: values.shipments.map((s: any) => ({
        id: s.id,
        customer_name: s.customer_name.trim(),
        vehicle_number: s.vehicle_number?.trim() || null,
        trip: s.trip?.trim() || null,
        carrier_name: s.carrier_name?.trim() || null,
        requested_date: s.requested_date?.format("YYYY-MM-DD") ?? null,
        notes: s.notes || null,
        details: s.details.map((d: any) => ({
          id: d.id,
          sku: d.sku?.trim() || undefined,
          requested_quantity: d.requested_quantity,
          notes: d.notes || null,
        })),
      })),
    };

    updateMutation.mutate(
      { orderCode: order.order_code, data: payload },
      {
        onSuccess: () => {
          message.success("Cập nhật đơn xuất thành công!");
          onClose();
        },
        onError: (err: any) => {
          message.error(
            err.response?.data?.detail ?? "Không thể cập nhật đơn xuất",
          );
        },
      },
    );
  };

  return (
    <Modal
      title={
        <div className="flex items-center justify-between gap-4 pr-8">
          <span className="text-brand-dark font-semibold">
            Chỉnh sửa đơn xuất
          </span>
          <span className="text-sm font-medium text-brand-primary">
            {order.order_code}
          </span>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={900}
      centered
      destroyOnHidden
      afterOpenChange={handleAfterOpen}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="primary"
            loading={updateMutation.isPending}
            onClick={handleSubmit}
          >
            Lưu thay đổi
          </Button>
        </div>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="requested_date"
          label="Ngày yêu cầu"
          rules={[{ required: true, message: "Chọn ngày" }]}
        >
          <DatePicker className="w-full" format="DD/MM/YYYY" />
        </Form.Item>
        <Form.Item name="notes" label="Ghi chú đơn">
          <Input.TextArea rows={2} placeholder="Ghi chú (tuỳ chọn)" />
        </Form.Item>

        <Form.List name="shipments">
          {(shipmentFields, { add: addShipment, remove: removeShipment }) => (
            <>
              {shipmentFields.map((shipmentField) => (
                <div key={shipmentField.key} className="mb-6">
                  <Card
                    as="antd"
                    size="small"
                    title={`Khách hàng #${shipmentField.name + 1}`}
                    extra={
                      shipmentFields.length > 1 ? (
                        <Button
                          variant="dangerText"
                          icon={<DeleteOutlined />}
                          onClick={() => removeShipment(shipmentField.name)}
                        >
                          Xóa khách
                        </Button>
                      ) : null
                    }
                  >
                    {/* ẩn id, không hiển thị cho người dùng */}
                    <Form.Item name={[shipmentField.name, "id"]} hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item
                      name={[shipmentField.name, "customer_name"]}
                      label="Tên khách hàng"
                      rules={[{ required: true, message: "Nhập tên khách" }]}
                    >
                      <Input placeholder="VD: Công ty A" />
                    </Form.Item>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <Form.Item
                        name={[shipmentField.name, "vehicle_number"]}
                        label="Số xe"
                      >
                        <Input placeholder="VD: 51C-123.45" />
                      </Form.Item>
                      <Form.Item name={[shipmentField.name, "trip"]} label="Trip">
                        <Input placeholder="VD: Trip 01" />
                      </Form.Item>
                      <Form.Item
                        name={[shipmentField.name, "carrier_name"]}
                        label="Nhà vận tải"
                      >
                        <Input placeholder="VD: Công ty vận tải XYZ" />
                      </Form.Item>
                    </div>
                    <Form.Item
                      name={[shipmentField.name, "requested_date"]}
                      label="Ngày yêu cầu (shipment)"
                    >
                      <DatePicker className="w-full" format="DD/MM/YYYY" />
                    </Form.Item>
                    <Form.Item
                      name={[shipmentField.name, "notes"]}
                      label="Ghi chú khách"
                    >
                      <Input.TextArea rows={1} />
                    </Form.Item>

                    <Form.List name={[shipmentField.name, "details"]}>
                      {(
                        detailFields,
                        { add: addDetail, remove: removeDetail },
                      ) => (
                        <>
                          {detailFields.map((detailField) => (
                            <div
                              key={detailField.key}
                              className="mb-2 w-full grid grid-cols-12 gap-3 items-start"
                            >
                              <Form.Item name={[detailField.name, "id"]} hidden>
                                <Input />
                              </Form.Item>
                              <Form.Item
                                name={[detailField.name, "sku"]}
                                label="SKU"
                                rules={[
                                  { required: true, message: "Chọn SKU" },
                                ]}
                                className="col-span-4 !mb-0 min-w-0"
                              >
                                <SkuSearchSelect
                                  warehouseId={selectedWarehouseId || 0}
                                />
                              </Form.Item>
                              <Form.Item
                                name={[detailField.name, "requested_quantity"]}
                                label="Số lượng"
                                rules={[{ required: true, message: "Nhập SL" }]}
                                className="col-span-3 !mb-0"
                              >
                                <InputNumber
                                  min={0.001}
                                  className="!w-full !h-11 [&_.ant-input-number-input]:!h-11"
                                />
                              </Form.Item>
                              <Form.Item
                                name={[detailField.name, "notes"]}
                                label="Ghi chú"
                                className="col-span-4 !mb-0"
                              >
                                <Input placeholder="Ghi chú dòng" />
                              </Form.Item>
                              <div className="col-span-1 flex items-end pb-1">
                                {detailFields.length > 1 && (
                                  <Button
                                    variant="dangerText"
                                    icon={<DeleteOutlined />}
                                    onClick={() =>
                                      removeDetail(detailField.name)
                                    }
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                          <Button
                            variant="secondary"
                            icon={<PlusOutlined />}
                            onClick={() => addDetail({ requested_quantity: 1 })}
                            block
                          >
                            Thêm sản phẩm
                          </Button>
                        </>
                      )}
                    </Form.List>
                  </Card>
                </div>
              ))}
              <Button
                variant="primary"
                icon={<PlusOutlined />}
                onClick={() =>
                  addShipment({
                    customer_name: "",
                    vehicle_number: undefined,
                    trip: undefined,
                    carrier_name: undefined,
                    requested_date: dayjs(),
                    notes: undefined,
                    details: [{ requested_quantity: 1 }],
                  })
                }
                block
              >
                Thêm khách hàng
              </Button>
            </>
          )}
        </Form.List>
      </Form>
    </Modal>
  );
}
