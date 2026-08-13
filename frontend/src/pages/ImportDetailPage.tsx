import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Table, Button, message, Modal, Space, Select } from "@/components/ui";
import { Progress } from "antd";
import InboundStatusTag from "@/components/shared/InboundStatusTag";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  useGetInboundOrders,
  useGetInboundOrderDetails,
  useUpdateInboundOrder,
  useAcceptInboundTask,
} from "@/hooks/useInboundOrder";
import { useAppStore } from "@/store/useAppStore";
import type {
  InboundOrderAllocation,
  InboundOrderDetail,
} from "@/types/inboundOrder";
import type { ColumnsType } from "antd/es/table";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";
import { useInboundBufferLocations, useFullLocations } from "@/hooks/useWarehouseMap";
import { useUser } from "@/hooks/useAuth";
import dayjs from "dayjs";
import CreateImportModal, {
  type ImportGroupDraft,
} from "./components/CreateImportModal";

const TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-base [&_.ant-table-tbody_td]:!text-base [&_.ant-table-thead_th]:!py-3 [&_.ant-table-tbody_td]:!py-3 [&_.ant-table-row]:hover:bg-slate-50/50";

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
  supplier: "Nhà cung cấp",
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

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
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

function formatLocationLabel(
  locationId: number | null | undefined,
  locationLabelById: Map<number, string>,
): string {
  if (!locationId) return "—";
  return locationLabelById.get(locationId) ?? `#${locationId}`;
}

export default function ImportDetailPage() {
  const { id: orderCode } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const inboundType = useAppStore((s) => s.inboundType);
  const warehouseId = useAppStore((s) => s.selectedWarehouseId) || 0;

  const [isEditOpen, setIsEditOpen] = useState(false);

  const { data: details = [], isLoading, refetch } =
    useGetInboundOrderDetails(orderCode);
  const { data: ordersData, refetch: refetchOrders } = useGetInboundOrders({
    warehouse_id: warehouseId,
    page: 1,
    page_size: 100,
  });
  const orders = ordersData?.items ?? [];
  const updateMutation = useUpdateInboundOrder();
  const acceptMutation = useAcceptInboundTask();
  const { data: users = [] } = useUser();
  const { data: bufferLocationsData, isLoading: bufferLocationsLoading } =
    useInboundBufferLocations(warehouseId);
  const { data: fullLocations } = useFullLocations(warehouseId);

  const bufferLocationOptions = useMemo(
    () =>
      (bufferLocationsData?.items ?? []).map((loc) => ({
        value: loc.id,
        label: `${loc.location_code}${loc.location_name ? ` — ${loc.location_name}` : ""}`,
      })),
    [bufferLocationsData],
  );

  const locationLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const loc of fullLocations?.locations ?? []) {
      map.set(loc.id, loc.location_code);
    }
    for (const loc of bufferLocationsData?.items ?? []) {
      map.set(loc.id, loc.location_code);
    }
    return map;
  }, [fullLocations, bufferLocationsData]);

  const orderMeta = useMemo(
    () => orders.find((o) => o.order_code === orderCode),
    [orders, orderCode],
  );

  const userNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const user of users) map.set(user.id, user.username);
    return map;
  }, [users]);

  const orderExtraDetails = useMemo(
    () => getDetailEntries(orderMeta?.details),
    [orderMeta],
  );

  const editInitialGroups = useMemo((): ImportGroupDraft[] => {
    return details.map((d) => ({
      key: `detail-${d.id}`,
      detail_id: d.id,
      from_location_id: d.from_location_id ?? undefined,
      to_location_id: d.to_location_id ?? undefined,
      to_location_name: d.to_location_name ?? d.to_location_code ?? undefined,
      status: d.status,
      items: (d.allocations ?? []).map((a) => ({
        key: `allocation-${a.id}`,
        allocation_id: a.id,
        sku: a.sku ?? undefined,
        item_id: a.item_id ?? undefined,
        item_name: a.item_name ?? undefined,
        quantity: a.quantity,
        unit_id: a.unit_id,
        lot_number: a.lot_number ?? undefined,
        expiry_date: a.expiry_date ?? undefined,
      })),
    }));
  }, [details]);

  const { completedCount, totalCount, progressPercent, allInitialize } =
    useMemo(() => {
      const total = details.length;
      const completed = details.filter((d) => d.status === "completed").length;
      return {
        totalCount: total,
        completedCount: completed,
        progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
        allInitialize:
          total > 0 && details.every((d) => d.status === "initialize"),
      };
    }, [details]);

  const handleDelete = () => {
    if (!orderCode) return;
    Modal.confirmDelete({
      content: `Bạn có chắc chắn muốn xóa đơn nhập "${orderCode}"?`,
      onOk: () =>
        new Promise<void>((resolve, reject) => {
          updateMutation.mutate(
            {
              orderCode,
              inboundType,
              data: {
                line_items: details.map((d) => ({ id: d.id, delete: true })),
              },
            },
            {
              onSuccess: () => {
                message.success("Xóa đơn nhập thành công!");
                navigate("/import");
                resolve();
              },
              onError: (err) => {
                message.error(apiError(err));
                reject();
              },
            },
          );
        }),
    });
  };

  const handleExecuteTask = async (detailId: number) => {
    try {
      message.loading({ content: "Đang gửi lệnh...", key: "execute" });
      await acceptMutation.mutateAsync(detailId);
      message.success({ content: "Đã thực thi task", key: "execute" });
      void refetch();
    } catch (err) {
      message.error({ content: apiError(err), key: "execute" });
    }
  };

  const handleFromLocationChange = async (
    detail: InboundOrderDetail,
    fromLocationId: number,
  ) => {
    if (!orderCode) return;

    try {
      await updateMutation.mutateAsync({
        orderCode,
        inboundType,
        data: {
          line_items: [
            {
              id: detail.id,
              from_location_id: fromLocationId,
            },
          ],
        },
      });
      message.success("Đã cập nhật điểm cấp");
    } catch (err) {
      message.error(apiError(err));
    }
  };

  const columns: ColumnsType<InboundOrderDetail> = [
    {
      title: "Nhóm",
      key: "group",
      width: 90,
      render: (_, __, index) => (
        <span className="font-semibold">Nhóm {index + 1}</span>
      ),
    },
    {
      title: "Số SKU",
      key: "sku_count",
      width: 90,
      render: (_, record) => (
        <span className="font-semibold">{record.allocations?.length ?? 0}</span>
      ),
    },
    {
      title: "Tổng SL",
      key: "total_quantity",
      width: 110,
      render: (_, record) => (
        <span className="font-semibold">
          {(record.allocations ?? []).reduce((sum, a) => sum + a.quantity, 0)}
        </span>
      ),
    },
    {
      title: "Điểm cấp",
      key: "from_location",
      width: 240,
      render: (_, record) => {
        const editable = record.status === "initialize";
        if (!editable) {
          return (
            record.from_location_code ??
            formatLocationLabel(record.from_location_id, locationLabelById)
          );
        }
        return (
          <Select
            className="w-full"
            showSearch
            optionFilterProp="label"
            placeholder="Chọn điểm cấp..."
            value={record.from_location_id ?? undefined}
            options={bufferLocationOptions}
            loading={bufferLocationsLoading || updateMutation.isPending}
            disabled={updateMutation.isPending}
            onChange={(val) =>
              void handleFromLocationChange(record, Number(val))
            }
          />
        );
      },
    },
    {
      title: "Điểm trả",
      key: "to_location",
      width: 140,
      render: (_, record) =>
        record.to_location_code ??
        formatLocationLabel(record.to_location_id, locationLabelById),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (status: string, record) => {
        if (status === "initialize") {
          const missingFrom = !record.from_location_id;
          return (
            <Button
              variant="primary"
              icon={<PlayCircleOutlined />}
              loading={acceptMutation.isPending}
              disabled={missingFrom}
              title={
                missingFrom
                  ? "Chọn điểm cấp trước khi thực thi"
                  : undefined
              }
              onClick={() => void handleExecuteTask(record.id)}
            >
              Execute
            </Button>
          );
        }
        return <InboundStatusTag status={status} size="sm" />;
      },
    },
  ];

  const allocationColumns: ColumnsType<InboundOrderAllocation> = [
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
      title: "Số lô",
      key: "lot_number",
      width: 140,
      render: (_, record) =>
        record.lot_number ? (
          <span className="font-semibold">{record.lot_number}</span>
        ) : (
          "—"
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
      title: "Đơn vị",
      key: "unit_name",
      width: 120,
      render: (_, record) => record.unit_name ?? `#${record.unit_id}`,
    },
    {
      title: "Hạn sử dụng",
      key: "expiry_date",
      width: 140,
      render: (_, record) =>
        record.expiry_date
          ? dayjs(record.expiry_date).format("DD/MM/YYYY")
          : "—",
    },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-500 font-medium">
        Đang tải chi tiết đơn nhập...
      </div>
    );
  }

  if (!orderCode) {
    return (
      <div className="flex flex-col justify-center items-center h-64 text-slate-500 font-medium gap-4">
        <div>Không tìm thấy mã đơn hàng hợp lệ!</div>
        <Button onClick={() => navigate("/import")}>Quay lại danh sách</Button>
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
            onClick={() => navigate("/import")}
          />
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-slate-800">
              Đơn nhập kho:{" "}
              <span className="text-brand-primary">{orderCode}</span>
            </h2>
            <div className="text-slate-400 text-sm mt-1">
              {completedCount} / {totalCount} nhóm hoàn thành
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
            loading={updateMutation.isPending}
            title={
              !allInitialize ? "Chỉ đơn ở trạng thái khởi tạo mới được xóa" : undefined
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
              Thông tin đơn nhập
            </div>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Người tạo</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-800">
                  {orderMeta?.created_by_id
                    ? userNameById.get(orderMeta.created_by_id) ??
                      `#${orderMeta.created_by_id}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Trạng thái</dt>
                <dd className="mt-1">
                  <InboundStatusTag
                    status={orderMeta?.status ?? "initialize"}
                    size="sm"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Loại nhập</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-800">
                  {displayValue(inboundType)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Ngày cập nhật</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-800">
                  {formatDateTime(orderMeta?.updated_at)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">Ghi chú</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-800 whitespace-pre-wrap">
                  {displayValue(orderMeta?.note)}
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
              <div className="text-sm text-slate-600">
                % nhóm có status = completed
              </div>
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg border border-stripe-hairline bg-slate-50 p-3">
              <Progress
                type="circle"
                percent={progressPercent}
                size={70}
                strokeColor="var(--color-brand-primary)"
              />
              <div className="mt-2 text-xs font-bold text-slate-500">
                {completedCount} / {totalCount}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">
            Danh sách nhóm hàng
          </h3>
          {progressPercent === 100 && totalCount > 0 && (
            <InboundStatusTag
              status="completed"
              size="sm"
              className="px-2 py-0.5 text-xs font-semibold tracking-normal"
            />
          )}
        </div>
        <Table
          columns={columns}
          dataSource={details}
          pagination={false}
          rowKey="id"
          size="middle"
          className={TABLE_CLASS}
          expandable={{
            expandedRowRender: (record) => (
              <div className="mx-2 my-1 space-y-2 rounded-lg bg-slate-50/60 px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Hàng hóa trong nhóm
                </div>
                <Table
                  columns={allocationColumns}
                  dataSource={record.allocations ?? []}
                  pagination={false}
                  rowKey="id"
                  size="small"
                />
                <DetailsEntriesPanel
                  entries={getDetailEntries(record.details)}
                  formatKey={formatDetailLineKey}
                  title="Chi tiết dòng"
                  emptyText="Không có dữ liệu bổ sung"
                />
              </div>
            ),
            rowExpandable: () => true,
          }}
        />
      </Card>

      <CreateImportModal
        open={isEditOpen}
        mode="edit"
        editOrderCode={orderCode}
        initialNote={orderMeta?.note ?? ""}
        initialGroups={editInitialGroups}
        onCancel={() => setIsEditOpen(false)}
        onSuccess={() => {
          setIsEditOpen(false);
          void refetch();
          void refetchOrders();
        }}
      />
    </div>
  );
}
