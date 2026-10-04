import { useMemo, useState, useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import { getInboundOrderDetailsApi } from "@/api/inboundOrder";
import {
  ArrowLeftOutlined,
  CarOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Table, cn } from "@/components/ui";
import { SkuSearchSelect } from "@/components/shared/SkuSearchSelect";
import { useGetInboundOrderDetails } from "@/hooks/useInboundOrder";
import { useMasanInboundDetails } from "@/hooks/useMasanInbound";
import type { InboundOrder, InboundOrderDetail } from "@/types/inboundOrder";
import { toDisplayInteger } from "@/utils/number";

type VehicleNode = {
  key: string;
  vehicleNumber: string;
  details: InboundOrderDetail[];
};

type SkuFilter = { itemId: number; sku: string };

const NO_VEHICLE_LABEL = "Không biển số";

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Khởi tạo",
  initialize: "Khởi tạo",
  receiving: "Đang nhập",
  in_progress: "Đang nhập",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  canceled: "Đã hủy",
};

const DETAIL_STATUS_LABEL: Record<string, string> = {
  initialize: "Chờ gọi",
  pending: "Chưa nhập",
  partial: "Đang nhập",
  in_progress: "Đang nhập",
  completed: "Hoàn thành",
};

type Tone = { shell: string; rail: string; badge: string };

const TONE_PENDING: Tone = {
  shell:
    "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
  rail: "bg-warning-400",
  badge: "bg-warning-100 text-warning-700",
};

const TONE_RUNNING: Tone = {
  shell:
    "border-brand-primary/20 bg-brand-primary/5 hover:border-brand-primary/40 hover:shadow-sm",
  rail: "bg-info-500",
  badge: "bg-info-100 text-info-700",
};

const TONE_DONE: Tone = {
  shell:
    "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
  rail: "bg-success-400",
  badge: "bg-success-100 text-success-700",
};

const TONE_CANCELLED: Tone = {
  shell:
    "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
  rail: "bg-error-400",
  badge: "bg-error-100 text-error-700",
};

const ORDER_TONE: Record<string, Tone> = {
  pending: TONE_PENDING,
  initialize: TONE_PENDING,
  receiving: TONE_RUNNING,
  in_progress: TONE_RUNNING,
  completed: TONE_DONE,
  cancelled: TONE_CANCELLED,
  canceled: TONE_CANCELLED,
};

const toneOf = (status: string): Tone => ORDER_TONE[status] ?? TONE_PENDING;

function vehicleOf(detail: InboundOrderDetail): string {
  const raw = detail.details?.vehicle_no;
  return typeof raw === "string" && raw.trim() ? raw.trim() : NO_VEHICLE_LABEL;
}

function groupDetailsByVehicle(details: InboundOrderDetail[]): VehicleNode[] {
  const groups = new Map<string, InboundOrderDetail[]>();
  for (const detail of details) {
    const vehicleNumber = vehicleOf(detail);
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

function detailQuantity(detail: InboundOrderDetail): number {
  return detail.allocations.reduce(
    (sum, allocation) => sum + (Number(allocation.quantity) || 0),
    0,
  );
}

function sumQuantity(details: InboundOrderDetail[]): number {
  return details.reduce((sum, detail) => sum + detailQuantity(detail), 0);
}

function countProducts(details: InboundOrderDetail[]): number {
  const ids = new Set<number>();
  for (const detail of details) {
    for (const allocation of detail.allocations) {
      if (allocation.item_id != null) ids.add(allocation.item_id);
    }
  }
  return ids.size;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({
  status,
  detail = false,
}: {
  status: string;
  detail?: boolean;
}) {
  const label = detail
    ? (DETAIL_STATUS_LABEL[status] ?? status)
    : (ORDER_STATUS_LABEL[status] ?? status);
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold uppercase",
        toneOf(status).badge,
      )}
    >
      {label}
    </span>
  );
}

const detailColumns: ColumnsType<InboundOrderDetail> = [
  {
    title: "Sản phẩm",
    key: "product",
    render: (_: unknown, row) => {
      const first = row.allocations[0];
      const extra = row.allocations.length - 1;
      return (
        <div className="min-w-0">
          <p className="truncate font-mono text-base font-bold text-brand-dark">
            {first?.sku?.trim() || "—"}
            {extra > 0 ? (
              <span className="ml-1 text-xs font-semibold text-slate-500">
                +{extra}
              </span>
            ) : null}
          </p>
          <p className="truncate text-sm text-slate-500">
            {first?.item_name?.trim() || "—"}
          </p>
        </div>
      );
    },
  },
  {
    title: "LOT",
    key: "lot",
    width: 110,
    ellipsis: true,
    render: (_: unknown, row) => row.allocations[0]?.lot_number?.trim() || "—",
  },
  {
    title: "SL",
    key: "quantity",
    width: 80,
    align: "right",
    render: (_: unknown, row) => (
      <span className="text-base font-bold tabular-nums text-brand-dark">
        {toDisplayInteger(detailQuantity(row))}
      </span>
    ),
  },
  {
    title: "Lấy → Cất",
    key: "route",
    width: 150,
    ellipsis: true,
    render: (_: unknown, row) => (
      <span className="font-mono text-sm font-semibold text-brand-dark">
        {row.from_location_name?.trim() || "—"} →{" "}
        {row.to_location_name?.trim() || "—"}
      </span>
    ),
  },
  {
    title: "Trạng thái",
    dataIndex: "status",
    key: "status",
    width: 115,
    render: (status: string) => <StatusBadge status={status} detail />,
  },
];

const DETAIL_TABLE_CLASS =
  "[&_.ant-table]:text-base [&_.ant-table-thead_th]:!bg-[#EEF2FF] [&_.ant-table-thead_th]:!text-sm [&_.ant-table-tbody_td]:!py-3";

type OperatorInboundOrderBrowserProps = {
  /** Kho đang chọn — SkuSearchSelect cần `warehouse_id` khi gọi API sản phẩm. */
  warehouseId: number;
  orders: InboundOrder[];
  loading?: boolean;
  error?: boolean;
  /** Đơn operator đang mở (double-click); dùng cho xuất Excel Masan ở panel cha. */
  onFocusedOrderIdChange?: (orderId: number | null) => void;
};

export default function OperatorInboundOrderBrowser({
  warehouseId,
  orders,
  loading = false,
  error = false,
  onFocusedOrderIdChange,
}: OperatorInboundOrderBrowserProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [selectedVehicleKey, setSelectedVehicleKey] = useState<string | null>(
    null,
  );
  const [skuFilter, setSkuFilter] = useState<SkuFilter | null>(null);

  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;

  useEffect(() => {
    onFocusedOrderIdChange?.(selectedOrderId);
  }, [selectedOrderId, onFocusedOrderIdChange]);

  const listAtRoot = selectedOrderId == null;
  const listDetailQueries = useQueries({
    queries: listAtRoot
      ? orders.map((order) => ({
          queryKey: ["inboundOrderDetails", order.order_code],
          queryFn: () => getInboundOrderDetailsApi(order.order_code),
          staleTime: 60_000,
        }))
      : [],
  });

  const vehicleCountByOrderId = useMemo(() => {
    const map = new Map<number, number>();
    if (!listAtRoot) return map;
    orders.forEach((order, index) => {
      const details = listDetailQueries[index]?.data;
      if (details) {
        map.set(order.id, groupDetailsByVehicle(details).length);
      }
    });
    return map;
  }, [listAtRoot, listDetailQueries, orders]);

  const orderDetailsQuery = useGetInboundOrderDetails(
    selectedOrder?.order_code,
  );
  const orderDetails = useMemo(
    () => orderDetailsQuery.data ?? [],
    [orderDetailsQuery.data],
  );
  const vehicles = useMemo(
    () => groupDetailsByVehicle(orderDetails),
    [orderDetails],
  );
  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.key === selectedVehicleKey) ?? null;

  const masanFilter = selectedVehicle
    ? selectedVehicle.vehicleNumber === NO_VEHICLE_LABEL
      ? null
      : { vehicle_no: selectedVehicle.vehicleNumber }
    : skuFilter
      ? { item_id: skuFilter.itemId }
      : null;
  const masanDetailsQuery = useMasanInboundDetails(
    selectedOrder?.id,
    masanFilter,
  );

  const openOrder = (orderId: number) => {
    setSelectedOrderId(orderId);
    setSelectedVehicleKey(null);
    setSkuFilter(null);
  };

  const closeOrder = () => {
    setSelectedOrderId(null);
    setSelectedVehicleKey(null);
    setSkuFilter(null);
  };

  if (selectedOrder && selectedVehicle) {
    const rows = masanFilter
      ? (masanDetailsQuery.data ?? [])
      : selectedVehicle.details;
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
              {selectedOrder.order_code} · {countProducts(rows)} sản phẩm · SL{" "}
              {toDisplayInteger(sumQuantity(rows))}
            </p>
          </div>
        </div>
        <div className="operator-panel-scroll min-h-0 flex-1 p-2">
          <Table<InboundOrderDetail>
            columns={detailColumns}
            dataSource={rows}
            rowKey="id"
            pagination={false}
            size="middle"
            tableLayout="fixed"
            scroll={{ x: "max-content" }}
            loading={masanFilter ? masanDetailsQuery.isLoading : false}
            locale={{
              emptyText: masanDetailsQuery.isError
                ? "Không tải được chi tiết xe"
                : "Xe này chưa có sản phẩm",
            }}
            className={DETAIL_TABLE_CLASS}
          />
        </div>
      </div>
    );
  }

  if (selectedOrder) {
    const skuRows = masanDetailsQuery.data ?? [];
    return (
      <div className="flex h-full min-h-0 flex-col bg-panel">
        <div className="flex shrink-0 items-center gap-3 border-b border-stripe-hairline px-3 py-2.5">
          <Button
            variant="secondary"
            icon={<ArrowLeftOutlined />}
            aria-label="Quay lại danh sách đơn nhập"
            className="!h-9 !px-2.5 !text-sm"
            onClick={closeOrder}
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
              {vehicles.length} xe · {countProducts(orderDetails)} sản phẩm · SL{" "}
              {toDisplayInteger(sumQuantity(orderDetails))}
            </p>
          </div>
        </div>
        <div className="shrink-0 border-b border-stripe-hairline px-3 py-2">
          <SkuSearchSelect
            warehouseId={warehouseId}
            placeholder="Lọc theo mã hàng (SKU)..."
            onSelectOption={(option) =>
              setSkuFilter(
                option?.item_id != null
                  ? { itemId: option.item_id, sku: option.value }
                  : null,
              )
            }
          />
        </div>

        {skuFilter ? (
          <div className="operator-panel-scroll min-h-0 flex-1 p-2">
            <Table<InboundOrderDetail>
              columns={[
                {
                  title: "Biển số",
                  key: "vehicle",
                  width: 120,
                  ellipsis: true,
                  render: (_: unknown, row) => (
                    <span className="font-mono text-base font-semibold text-brand-dark">
                      {vehicleOf(row)}
                    </span>
                  ),
                },
                ...detailColumns,
              ]}
              dataSource={skuRows}
              rowKey="id"
              pagination={false}
              size="middle"
              tableLayout="fixed"
              loading={masanDetailsQuery.isLoading}
              locale={{
                emptyText: masanDetailsQuery.isError
                  ? "Không tải được chi tiết theo mã hàng"
                  : `Đơn không có mã hàng ${skuFilter.sku}`,
              }}
              className={DETAIL_TABLE_CLASS}
            />
          </div>
        ) : orderDetailsQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
            Đang tải danh sách xe...
          </div>
        ) : orderDetailsQuery.isError ? (
          <div className="flex flex-1 items-center justify-center text-sm text-error-600">
            Không tải được chi tiết đơn nhập
          </div>
        ) : (
          <div className="operator-panel-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 p-3 sm:grid-cols-2">
            {vehicles.length === 0 ? (
              <div className="col-span-full py-10 text-center text-sm text-slate-500">
                Đơn nhập chưa có dòng nào
              </div>
            ) : (
              vehicles.map((vehicle) => (
                <button
                  key={vehicle.key}
                  type="button"
                  title="Nhấp đúp để xem sản phẩm"
                  aria-label={`Nhấp đúp để xem sản phẩm của xe ${vehicle.vehicleNumber}`}
                  onDoubleClick={() => setSelectedVehicleKey(vehicle.key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter")
                      setSelectedVehicleKey(vehicle.key);
                  }}
                  className={cn(
                    "group relative flex min-h-24 w-full items-center gap-3 overflow-hidden rounded-xl border p-3 pl-4 text-left shadow-stripe-1 transition duration-200 hover:-translate-y-0.5",
                    toneOf(selectedOrder.status).shell,
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 w-1.5",
                      toneOf(selectedOrder.status).rail,
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
              ))
            )}
          </div>
        )}
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
    <div className="operator-panel-scroll grid h-full min-h-0 auto-rows-min grid-cols-1 gap-3 bg-panel p-3 sm:grid-cols-2">
      {orders.length === 0 ? (
        <div className="col-span-full py-10 text-center text-sm text-slate-500">
          Không có lệnh nhập
        </div>
      ) : (
        orders.map((order, index) => {
          const tone = toneOf(order.status);
          const vehicleCount = vehicleCountByOrderId.get(order.id);
          const vehiclesLoading = listDetailQueries[index]?.isLoading;
          return (
            <button
              key={order.id}
              type="button"
              title="Nhấp đúp để xem danh sách xe"
              aria-label={`Nhấp đúp để xem danh sách xe của đơn ${order.order_code}`}
              onDoubleClick={() => openOrder(order.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") openOrder(order.id);
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
              <span className="relative z-10 flex min-w-0 flex-1 flex-col gap-2">
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
                    <strong className="mt-0.5 block text-lg font-black tabular-nums text-brand-dark">
                      {vehiclesLoading
                        ? "…"
                        : vehicleCount != null
                          ? toDisplayInteger(vehicleCount)
                          : "—"}
                    </strong>
                  </span>
                  <span>
                    <span className="block text-xs font-bold uppercase tracking-wider text-stripe-ink-mute">
                      Tạo lúc
                    </span>
                    <strong className="mt-0.5 block text-lg font-black tabular-nums text-brand-dark">
                      {formatDateTime(order.created_at)}
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
