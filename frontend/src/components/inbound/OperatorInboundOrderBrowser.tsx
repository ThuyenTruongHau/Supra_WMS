import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { postInboundOperatorListSummaryApi } from "@/api/inboundOrder";
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
import { formatOperatorSampleVehicle } from "@/utils/operatorOrderVehicleDisplay";
import { toDisplayInteger } from "@/utils/number";
import {
  operatorInboundOrderCodeClass,
  operatorInboundOrderMetaClass,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";
import OrderCreatedAtRangeFilter from "@/components/shared/OrderCreatedAtRangeFilter";
import type { OrderCreatedAtRange } from "@/utils/orderCreatedAtRangeParams";

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

function detailAllocations(detail: InboundOrderDetail): InboundOrderDetail["allocations"] {
  return detail.allocations ?? [];
}

function detailQuantity(detail: InboundOrderDetail): number {
  return detailAllocations(detail).reduce(
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
    for (const allocation of detailAllocations(detail)) {
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
  compact = false,
}: {
  status: string;
  detail?: boolean;
  compact?: boolean;
}) {
  const label = detail
    ? (DETAIL_STATUS_LABEL[status] ?? status)
    : (ORDER_STATUS_LABEL[status] ?? status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 whitespace-nowrap rounded font-bold uppercase",
        compact ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs",
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
      const allocations = detailAllocations(row);
      const first = allocations[0];
      const extra = allocations.length - 1;
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
    render: (_: unknown, row) =>
      detailAllocations(row)[0]?.lot_number?.trim() || "—",
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

export type InboundListFilterExportContext = {
  visibleOrderIds: number[];
  hasSkuFilter: boolean;
  skuFilterLoading: boolean;
};

type OperatorInboundOrderBrowserProps = {
  /** Kho đang chọn — SkuSearchSelect cần `warehouse_id` khi gọi API sản phẩm. */
  warehouseId: number;
  orders: InboundOrder[];
  loading?: boolean;
  error?: boolean;
  /** Đơn operator đang mở (double-click); dùng cho xuất Excel Masan ở panel cha. */
  onFocusedOrderIdChange?: (orderId: number | null) => void;
  /** Danh sách đơn khớp lọc SKU (và list sau lọc ngày từ props.orders) — phục vụ xuất gom. */
  onListFilterExportContext?: (ctx: InboundListFilterExportContext) => void;
  createdRange?: OrderCreatedAtRange;
  onCreatedRangeChange?: (value: OrderCreatedAtRange) => void;
};

export default function OperatorInboundOrderBrowser({
  warehouseId,
  orders,
  loading = false,
  error = false,
  onFocusedOrderIdChange,
  onListFilterExportContext,
  createdRange = null,
  onCreatedRangeChange,
}: OperatorInboundOrderBrowserProps) {
  const tier = useOperatorViewportTier();
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
  const orderIds = useMemo(() => orders.map((order) => order.id), [orders]);
  const listSummaryQuery = useQuery({
    queryKey: [
      "inboundOperatorListSummary",
      orderIds,
      skuFilter?.itemId ?? null,
    ],
    queryFn: () =>
      postInboundOperatorListSummaryApi({
        order_ids: orderIds,
        ...(skuFilter ? { item_id: skuFilter.itemId } : {}),
      }),
    enabled: listAtRoot && orderIds.length > 0,
    staleTime: 60_000,
  });

  const sampleVehicleByOrderId = useMemo(() => {
    const map = new Map<number, string>();
    const samples = listSummaryQuery.data?.sample_vehicle_by_order_id;
    if (!samples) return map;
    for (const [id, plate] of Object.entries(samples)) {
      map.set(Number(id), plate);
    }
    return map;
  }, [listSummaryQuery.data?.sample_vehicle_by_order_id]);

  const hasMoreVehiclesByOrderId = useMemo(() => {
    const map = new Map<number, boolean>();
    const flags = listSummaryQuery.data?.has_more_vehicles_by_order_id;
    if (!flags) return map;
    for (const [id, hasMore] of Object.entries(flags)) {
      map.set(Number(id), Boolean(hasMore));
    }
    return map;
  }, [listSummaryQuery.data?.has_more_vehicles_by_order_id]);

  const skuFilterLoading =
    listAtRoot && skuFilter != null && listSummaryQuery.isLoading;

  const visibleOrders = useMemo(() => {
    if (!listAtRoot || !skuFilter) return orders;
    const matching = new Set(listSummaryQuery.data?.order_ids_with_item ?? []);
    if (listSummaryQuery.isLoading) return [];
    return orders.filter((order) => matching.has(order.id));
  }, [listAtRoot, skuFilter, listSummaryQuery.data, listSummaryQuery.isLoading, orders]);

  useEffect(() => {
    if (!onListFilterExportContext) return;
    if (!listAtRoot) return;
    const idsForExport = skuFilter
      ? visibleOrders.map((order) => order.id)
      : orders.map((order) => order.id);
    onListFilterExportContext({
      visibleOrderIds: idsForExport,
      hasSkuFilter: skuFilter != null,
      skuFilterLoading: Boolean(skuFilterLoading),
    });
  }, [
    listAtRoot,
    orders,
    visibleOrders,
    skuFilter,
    skuFilterLoading,
    onListFilterExportContext,
  ]);

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

  const masanFilter =
    selectedVehicle && selectedVehicle.vehicleNumber !== NO_VEHICLE_LABEL
      ? { vehicle_no: selectedVehicle.vehicleNumber }
      : null;
  const masanDetailsQuery = useMasanInboundDetails(
    selectedOrder?.id,
    masanFilter,
  );

  const openOrder = (orderId: number) => {
    setSelectedOrderId(orderId);
    setSelectedVehicleKey(null);
  };

  const closeOrder = () => {
    setSelectedOrderId(null);
    setSelectedVehicleKey(null);
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
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-stripe-ink-mute">
                Mã đơn
              </span>
              <StatusBadge status={selectedOrder.status} compact />
            </div>
            <p
              className={cn(
                "mt-0.5 break-all font-mono font-extrabold leading-snug tracking-wide text-brand-dark",
                operatorInboundOrderCodeClass(tier),
              )}
            >
              {selectedOrder.order_code}
            </p>
            <p className={cn("mt-1", operatorInboundOrderMetaClass(tier))}>
              {vehicles.length} xe · {countProducts(orderDetails)} sản phẩm · SL{" "}
              {toDisplayInteger(sumQuantity(orderDetails))}
            </p>
          </div>
        </div>

        {orderDetailsQuery.isLoading ? (
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
                    <span
                      className={cn(
                        "mt-0.5 block break-all font-mono font-extrabold tracking-wide text-brand-dark",
                        operatorInboundOrderCodeClass(tier),
                      )}
                    >
                      {vehicle.vehicleNumber}
                    </span>
                    <span
                      className={cn("mt-1 block", operatorInboundOrderMetaClass(tier))}
                    >
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
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex shrink-0 flex-col gap-1.5 border-b border-stripe-hairline px-2 py-1.5">
        {onCreatedRangeChange ? (
          <OrderCreatedAtRangeFilter
            value={createdRange}
            onChange={onCreatedRangeChange}
            className="w-full"
          />
        ) : null}
        <SkuSearchSelect
          warehouseId={warehouseId}
          placeholder="Tìm đơn nhập theo mã hàng (SKU)..."
          onSelectOption={(option) =>
            setSkuFilter(
              option?.item_id != null
                ? { itemId: option.item_id, sku: option.value }
                : null,
            )
          }
        />
      </div>

      <div className="operator-panel-scroll grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-3 p-3 sm:grid-cols-2">
        {skuFilter ? (
          <p className="col-span-full text-xs text-stripe-ink-mute">
            Mã hàng <strong className="text-brand-dark">{skuFilter.sku}</strong>
            {" · "}
            {skuFilterLoading
              ? "Đang lọc đơn..."
              : `${visibleOrders.length} đơn khớp`}
          </p>
        ) : null}
        {skuFilterLoading && visibleOrders.length === 0 ? (
          <div className="col-span-full py-10 text-center text-sm text-slate-500">
            Đang lọc theo mã hàng...
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="col-span-full py-10 text-center text-sm text-slate-500">
            {skuFilter
              ? `Không có đơn nào chứa mã ${skuFilter.sku}`
              : "Không có lệnh nhập"}
          </div>
        ) : (
          visibleOrders.map((order) => {
              const tone = toneOf(order.status);
              const vehiclesLoading = listSummaryQuery.isLoading;
              const samplePlate = sampleVehicleByOrderId.get(order.id);
              const hasMoreVehicles = hasMoreVehiclesByOrderId.get(order.id) ?? false;
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
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-[0.16em] text-stripe-ink-mute">
                        Mã đơn
                      </span>
                      <StatusBadge status={order.status} compact />
                    </span>
                    <span
                      className={cn(
                        "block break-all font-mono font-extrabold leading-snug tracking-wide text-brand-dark",
                        operatorInboundOrderCodeClass(tier),
                      )}
                    >
                      {order.order_code}
                    </span>
                    <span className="mt-auto grid grid-cols-2 gap-3 border-t border-stripe-hairline pt-2">
                      <span className="border-r border-stripe-hairline">
                        <span
                          className={cn(
                            "block text-xs font-bold uppercase tracking-wider text-stripe-ink-mute",
                            operatorInboundOrderMetaClass(tier),
                          )}
                        >
                          Biển số
                        </span>
                        <strong
                          className={cn(
                            "mt-0.5 block truncate font-black text-brand-dark",
                            tier === "tv"
                              ? "text-lg"
                              : tier === "narrow"
                                ? "text-base"
                                : "text-lg",
                          )}
                        >
                          {vehiclesLoading
                            ? "…"
                            : formatOperatorSampleVehicle(
                                samplePlate,
                                hasMoreVehicles,
                                NO_VEHICLE_LABEL,
                              )}
                        </strong>
                      </span>
                      <span>
                        <span
                          className={cn(
                            "block text-xs font-bold uppercase tracking-wider text-stripe-ink-mute",
                            operatorInboundOrderMetaClass(tier),
                          )}
                        >
                          Tạo lúc
                        </span>
                        <strong
                          className={cn(
                            "mt-0.5 block font-black tabular-nums text-brand-dark",
                            tier === "tv"
                              ? "text-lg"
                              : tier === "narrow"
                                ? "text-sm"
                                : "text-base",
                          )}
                        >
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
    </div>
  );
}
