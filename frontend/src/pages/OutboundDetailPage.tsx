import { useMemo, useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Table, Button, message, Modal, Space } from "@/components/ui";
import { Progress, Checkbox } from "antd";
import OutboundStatusTag from "@/components/shared/OutboundStatusTag";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import {
  useGetOutboundOrderById,
  useGetOutboundOrderDetails,
  useGetOutboundLackedDetails,
  useDeleteOutboundOrder,
} from "@/hooks/useOutbound";
import { useAppStore } from "@/store/useAppStore";
import type {
  LackedDetail,
  OutboundOrderAllocation,
  OutboundOrderDetail,
} from "@/types/outbound";
import type { ColumnsType } from "antd/es/table";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";
import { useUser } from "@/hooks/useAuth";
import dayjs from "dayjs";
import CreateOutboundModal, {
  type OutboundItemDraft,
} from "./components/CreateOutboundModal";
import { detailsToEntries } from "@/utils/keyValueDetails";

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

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedDetailIds, setSelectedDetailIds] = useState<Set<number>>(
    () => new Set(),
  );

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
  const { data: lackedDetails = [], isLoading: isLackedLoading } =
    useGetOutboundLackedDetails(orderId);
  const deleteMutation = useDeleteOutboundOrder();
  const { data: users = [] } = useUser();

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

  const lackedByDetailId = useMemo(() => {
    const map = new Map<number, LackedDetail>();
    for (const item of lackedDetails) map.set(item.id, item);
    return map;
  }, [lackedDetails]);

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

  useEffect(() => {
    setSelectedDetailIds(new Set());
  }, [orderId]);

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

  const handleConfirmOutbound = () => {
    if (selectedCount === 0) {
      message.warning("Vui lòng chọn ít nhất một dòng hàng để xác nhận xuất");
      return;
    }

    Modal.confirm({
      title: "Xác nhận xuất",
      content: `Bạn có chắc muốn xác nhận xuất ${selectedCount} dòng đã chọn?`,
      okText: "Xác nhận",
      cancelText: "Hủy",
      onOk: () =>
        new Promise<void>((resolve) => {
          // TODO: gọi API xác nhận xuất theo danh sách detail đã chọn
          message.success(`Đã ghi nhận ${selectedCount} dòng xác nhận xuất`);
          setSelectedDetailIds(new Set());
          resolve();
        }),
    });
  };

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

  const allocationColumns: ColumnsType<OutboundOrderAllocation> = [
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
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => <OutboundStatusTag status={status} size="sm" />,
    },
    {
      title: "Từ vị trí",
      key: "from_location",
      width: 140,
      render: (_, record) =>
        record.from_location_code ?? `#${record.from_location_id}`,
    },
    {
      title: "Đến vị trí",
      key: "to_location",
      width: 140,
      render: (_, record) =>
        record.to_location_code ?? `#${record.to_location_id}`,
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
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 150,
      render: (status: string) => <OutboundStatusTag status={status} size="sm" />,
    },
  ];

  const lackedColumns: ColumnsType<LackedDetail> = [
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
              {completedCount} / {totalCount} dòng hoàn thành
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
              <div className="text-sm text-slate-600">
                % dòng có status = completed
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
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-slate-800">
            Danh sách hàng xuất
          </h3>
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
              onClick={handleConfirmOutbound}
            >
              Xác nhận xuất
              {selectedCount > 0 ? ` (${selectedCount})` : ""}
            </Button>
          </Space>
        </div>
        <Table
          columns={detailColumns}
          dataSource={details}
          pagination={false}
          rowKey="id"
          size="middle"
          className={TABLE_CLASS}
          expandable={{
            expandIconColumnIndex: 1,
            expandedRowRender: (record) => {
              const lacked = lackedByDetailId.get(record.id);
              return (
                <div className="mx-2 my-1 space-y-2 rounded-lg bg-slate-50/60 px-3 py-2">
                  {lacked && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span className="font-semibold">Còn thiếu phân bổ: </span>
                      {lacked.quantity} / {lacked.requested_quantity}{" "}
                      {lacked.unit ?? record.unit}
                      <span className="ml-2 text-xs text-amber-700">
                        (Dòng #{lacked.id})
                      </span>
                    </div>
                  )}
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
            },
            rowExpandable: () => true,
          }}
        />
      </Card>

      {lackedDetails.length > 0 && (
        <Card className="p-6">
          <h3 className="mb-4 text-lg font-bold text-amber-800">
            Hàng còn thiếu phân bổ
          </h3>
          <Table
            columns={lackedColumns}
            dataSource={lackedDetails}
            pagination={false}
            rowKey="id"
            size="middle"
            className={TABLE_CLASS}
          />
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
