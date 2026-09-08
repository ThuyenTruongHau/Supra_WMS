import { useState } from "react";
import {
  ArrowLeftOutlined,
  CarOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Table, cn } from "@/components/ui";
import type {
  InboundOrder,
  InboundOrderDetail,
  InboundOrderStatus,
} from "@/types/inbound";
import { toDisplayInteger } from "@/utils/number";

type VehicleNode = {
  key: string;
  vehicleNumber: string;
  details: InboundOrderDetail[];
};

const ORDER_STATUS_LABEL: Record<InboundOrderStatus, string> = {
  pending: "Khởi tạo",
  receiving: "Đang nhập",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

const DETAIL_STATUS_LABEL: Record<string, string> = {
  pending: "Chưa nhập",
  partial: "Đang nhập",
  completed: "Hoàn thành",
};

const ORDER_TONE: Record<
  InboundOrderStatus,
  { shell: string; rail: string; badge: string }
> = {
  pending: {
    shell:
      "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
    rail: "bg-warning-400",
    badge: "bg-warning-100 text-warning-700",
  },
  receiving: {
    shell:
      "border-brand-primary/20 bg-brand-primary/5 hover:border-brand-primary/40 hover:shadow-sm",
    rail: "bg-info-500",
    badge: "bg-info-100 text-info-700",
  },
  completed: {
    shell:
      "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
    rail: "bg-success-400",
    badge: "bg-success-100 text-success-700",
  },
  cancelled: {
    shell:
      "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
    rail: "bg-error-400",
    badge: "bg-error-100 text-error-700",
  },
};

function groupDetailsByVehicle(details: InboundOrderDetail[]): VehicleNode[] {
  const groups = new Map<string, InboundOrderDetail[]>();
  for (const detail of details) {
    const vehicleNumber = detail.vehicle_number?.trim() || "Không biển số";
    groups.set(vehicleNumber, [...(groups.get(vehicleNumber) ?? []), detail]);
  }
  return [...groups.entries()]
    .map(([vehicleNumber, vehicleDetails]) => ({
      key: vehicleNumber,
      vehicleNumber,
      details: vehicleDetails,
    }))
    .sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber));
}

function sumQuantity(details: InboundOrderDetail[]): number {
  return details.reduce(
    (sum, detail) => sum + (Number(detail.expected_quantity) || 0),
    0,
  );
}

function countProducts(details: InboundOrderDetail[]): number {
  return new Set(details.map((detail) => detail.product_id)).size;
}

function StatusBadge({
  status,
  detail = false,
}: {
  status: string;
  detail?: boolean;
}) {
  const orderTone = ORDER_TONE[status as InboundOrderStatus];
  const label = detail
    ? (DETAIL_STATUS_LABEL[status] ?? status)
    : (ORDER_STATUS_LABEL[status as InboundOrderStatus] ?? status);
  return (
    <span
      className={cn(
        "inline-flex rounded px-2 py-0.5 text-xs font-bold uppercase",
        detail
          ? status === "completed"
            ? "bg-success-100 text-success-700"
            : status === "partial"
              ? "bg-info-100 text-info-700"
              : "bg-warning-100 text-warning-700"
          : (orderTone?.badge ?? "bg-slate-100 text-slate-600"),
      )}
    >
      {label}
    </span>
  );
}

type OperatorInboundOrderBrowserProps = {
  orders: InboundOrder[];
  loading?: boolean;
  error?: boolean;
};

export default function OperatorInboundOrderBrowser({
  orders,
  loading = false,
  error = false,
}: OperatorInboundOrderBrowserProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<string | null>(
    null,
  );

  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;
  const vehicles = selectedOrder
    ? groupDetailsByVehicle(selectedOrder.details)
    : [];
  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.key === selectedVehicleKey) ?? null;

  const productColumns: ColumnsType<InboundOrderDetail> = [
    {
      title: "Sản phẩm",
      key: "product",
      render: (_: unknown, row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-base font-bold text-brand-dark">
            {row.product_sku?.trim() || `P${row.product_id}`}
          </p>
          <p className="truncate text-sm text-slate-500">
            {row.product_name?.trim() || "—"}
          </p>
        </div>
      ),
    },
    {
      title: "LOT",
      dataIndex: "lot_number",
      key: "lot_number",
      width: 110,
      ellipsis: true,
      render: (value: string | null) => value?.trim() || "—",
    },
    {
      title: "SL dự kiến",
      dataIndex: "expected_quantity",
      key: "expected_quantity",
      width: 105,
      align: "right",
      render: (value: number) => (
        <span className="text-base font-bold tabular-nums text-brand-dark">
          {toDisplayInteger(value)}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => <StatusBadge status={status} detail />,
    },
  ];

  if (selectedOrder && selectedVehicle) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-panel">
        <div className="flex shrink-0 items-center gap-3 border-b border-stripe-hairline px-3 py-2.5">
          <Button
            variant="secondary"
            icon={<ArrowLeftOutlined />}
            aria-label="Quay lại danh sách xe của đơn nhập"
            className="!h-9 !px-2.5 !text-sm"
            onClick={() => setSelectedVehicleKey(null)}
          >
            Theo xe
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-base font-bold text-brand-dark">
              {selectedVehicle.vehicleNumber}
            </p>
            <p className="truncate text-sm text-slate-500">
              {selectedOrder.order_code} ·{" "}
              {countProducts(selectedVehicle.details)} sản phẩm
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <Table<InboundOrderDetail>
            columns={productColumns}
            dataSource={selectedVehicle.details}
            rowKey="id"
            pagination={false}
            size="middle"
            locale={{ emptyText: "Xe này chưa có sản phẩm" }}
            className="[&_.ant-table]:text-base [&_.ant-table-thead_th]:!bg-[#EEF2FF] [&_.ant-table-thead_th]:!text-sm [&_.ant-table-tbody_td]:!py-3"
          />
        </div>
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-panel">
        <div className="flex shrink-0 items-center gap-3 border-b border-stripe-hairline px-3 py-2.5">
          <Button
            variant="secondary"
            icon={<ArrowLeftOutlined />}
            aria-label="Quay lại danh sách đơn nhập"
            className="!h-9 !px-2.5 !text-sm"
            onClick={() => {
              setSelectedOrderId(null);
              setSelectedVehicleKey(null);
            }}
          >
            Đơn nhập
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-mono text-base font-bold text-brand-dark">
                {selectedOrder.order_code}
              </p>
              <StatusBadge status={selectedOrder.status} />
            </div>
            <p className="text-sm text-slate-500">
              {vehicles.length} xe · {countProducts(selectedOrder.details)} sản
              phẩm
            </p>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 overflow-y-auto p-3 sm:grid-cols-2">
          {vehicles.map((vehicle) => (
            <button
              key={vehicle.key}
              type="button"
              title="Nhấp đúp để xem sản phẩm"
              aria-label={`Nhấp đúp để xem sản phẩm của xe ${vehicle.vehicleNumber}`}
              onDoubleClick={() => setSelectedVehicleKey(vehicle.key)}
              onKeyDown={(event) => {
                if (event.key === "Enter") setSelectedVehicleKey(vehicle.key);
              }}
              className={cn(
                "group relative flex min-h-24 w-full items-center gap-3 overflow-hidden rounded-xl border p-3 pl-4 text-left shadow-stripe-1 transition duration-200 hover:-translate-y-0.5",
                ORDER_TONE[selectedOrder.status].shell,
              )}
            >
              <span
                className={cn(
                  "absolute inset-y-0 left-0 w-1.5",
                  ORDER_TONE[selectedOrder.status].rail,
                )}
                aria-hidden
              />
              <span
                className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full border border-cyan-300/15 shadow-[0_0_28px_rgba(34,211,238,0.12)]"
                aria-hidden
              />
              <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-stripe-hairline bg-panel-soft text-xl text-brand-primary shadow-sm">
                <CarOutlined />
              </span>
              <span className="relative z-10 min-w-0 flex-1">
                <span className="block text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
                  Số xe
                </span>
                <span className="mt-0.5 block truncate font-mono text-lg font-extrabold tracking-wide text-brand-dark">
                  {vehicle.vehicleNumber}
                </span>
                <span className="mt-1 block text-sm text-stripe-ink-mute">
                  {countProducts(vehicle.details)} sản phẩm · SL{" "}
                  <strong className="tabular-nums text-brand-dark">
                    {toDisplayInteger(sumQuantity(vehicle.details))}
                  </strong>
                </span>
              </span>
              <RightOutlined className="relative z-10 text-stripe-ink-mute transition group-hover:translate-x-0.5 group-hover:text-brand-primary" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-slate-500">
        Đang tải lệnh nhập...
      </div>
    );
  }

  if (error && orders.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-error-600">
        Không tải được danh sách lệnh nhập
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 auto-rows-min grid-cols-1 gap-3 overflow-y-auto bg-panel p-3 sm:grid-cols-2">
      {orders.length === 0 ? (
        <div className="col-span-full py-10 text-center text-sm text-slate-500">
          Không có lệnh nhập
        </div>
      ) : (
        orders.map((order) => {
          const tone = ORDER_TONE[order.status];
          const vehicleCount = groupDetailsByVehicle(order.details).length;
          return (
            <button
              key={order.id}
              type="button"
              title="Nhấp đúp để xem danh sách xe"
              aria-label={`Nhấp đúp để xem danh sách xe của đơn ${order.order_code}`}
              onDoubleClick={() => {
                setSelectedOrderId(order.id);
                setSelectedVehicleKey(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setSelectedOrderId(order.id);
                  setSelectedVehicleKey(null);
                }
              }}
              className={cn(
                "group relative flex min-h-28 w-full overflow-hidden rounded-xl border p-3 pl-4 text-left shadow-stripe-1 transition duration-200 hover:-translate-y-0.5",
                tone.shell,
              )}
            >
              <span
                className={cn("absolute inset-y-0 left-0 w-1.5", tone.rail)}
                aria-hidden
              />
              <span
                className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full border border-cyan-300/15 shadow-[0_0_32px_rgba(34,211,238,0.12)]"
                aria-hidden
              />
              <span
                className="pointer-events-none absolute bottom-0 right-0 h-px w-24 bg-brand-primary/20"
                aria-hidden
              />
              <span className="flex min-w-0 flex-1 flex-col gap-2 relative z-10">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block text-xs font-bold uppercase tracking-[0.16em] text-stripe-ink-mute">
                      Mã đơn
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-xl font-extrabold tracking-wide text-brand-dark">
                      {order.order_code}
                    </span>
                  </span>
                  <StatusBadge status={order.status} />
                </span>
                <span className="mt-auto grid grid-cols-2 gap-3 border-t border-stripe-hairline pt-2 text-sm">
                  <span className="border-r border-stripe-hairline">
                    <span className="block text-xs font-bold uppercase tracking-wider text-stripe-ink-mute">
                      Số xe
                    </span>
                    <strong className="mt-0.5 block text-lg font-black text-brand-dark">
                      {vehicleCount}
                    </strong>
                  </span>
                  <span>
                    <span className="block text-xs font-bold uppercase tracking-wider text-stripe-ink-mute">
                      Số lượng
                    </span>
                    <strong className="mt-0.5 block text-lg font-black tabular-nums text-brand-dark">
                      {toDisplayInteger(sumQuantity(order.details))}
                    </strong>
                  </span>
                </span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
