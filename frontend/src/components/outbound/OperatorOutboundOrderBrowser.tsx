import { useMemo, useState, type Key } from "react";
import {
  ArrowLeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Table, cn } from "@/components/ui";
import { TruckDockIcon } from "@/components/outbound/iotIcons";
import { useOutboundVehicleProducts } from "@/hooks/useOutbound";
import type {
  IncompleteVehicle,
  OutboundOrder,
  OutboundOrderStatus,
  OutboundVehicleProductLine,
} from "@/types/outbound";
import type { LoadingSlotStatus } from "@/data/mockOperatorOutbound";
import { outboundStatusLabel } from "@/utils/outboundStatusLabel";
import { toDisplayInteger } from "@/utils/number";
import type { OutboundSelectedProductLine } from "@/components/outbound/OperatorOutboundVehicleCards";

const EMPTY_PRODUCTS: OutboundVehicleProductLine[] = [];
const EMPTY_SELECTED_LINES: OutboundSelectedProductLine[] = [];

const ORDER_STATUS_LABEL: Record<OutboundOrderStatus, string> = {
  pending: "Khởi tạo",
  wave_assigned: "Đã gán phiên",
  sorting: "Đang chia chọn",
  picking: "Đang lấy hàng",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

const ORDER_TONE: Record<
  OutboundOrderStatus,
  { shell: string; rail: string; badge: string }
> = {
  pending: {
    shell:
      "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
    rail: "bg-warning-400",
    badge: "bg-warning-100 text-warning-700",
  },
  wave_assigned: {
    shell:
      "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
    rail: "bg-indigo-400",
    badge: "bg-indigo-100 text-indigo-700",
  },
  sorting: {
    shell:
      "border-brand-primary/20 bg-brand-primary/5 hover:border-brand-primary/40 hover:shadow-sm",
    rail: "bg-info-500",
    badge: "bg-info-100 text-info-700",
  },
  picking: {
    shell:
      "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
    rail: "bg-violet-400",
    badge: "bg-violet-100 text-violet-700",
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

const VEHICLE_PANEL_TONE: Record<
  LoadingSlotStatus,
  { shell: string; badge: string; rail: string }
> = {
  enough: {
    shell:
      "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
    badge: "border-success-300/30 bg-success-100 text-success-700",
    rail: "bg-success-400",
  },
  waiting: {
    shell:
      "border-brand-primary/20 bg-brand-primary/5 hover:border-brand-primary/40 hover:shadow-sm",
    badge: "border-cyan-300/30 bg-info-100 text-info-700",
    rail: "bg-info-500",
  },
  shortage: {
    shell:
      "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
    badge: "border-warning-300/30 bg-warning-100 text-warning-700",
    rail: "bg-warning-400",
  },
};

function resolveAssignCoverage(
  vehicle: IncompleteVehicle,
): "none" | "partial" | "full" {
  const raw = (vehicle.assign_coverage || "").toLowerCase();
  if (raw === "full" || raw === "partial" || raw === "none") return raw;

  const total = vehicle.detail_count || vehicle.details.length || 0;
  const assigned =
    vehicle.assigned_detail_count ??
    vehicle.details.filter((detail) => (detail.sorting_position || "").trim())
      .length;
  if (total > 0 && assigned >= total) return "full";
  if (assigned > 0) return "partial";
  return "none";
}

function mapVehicleTone(vehicle: IncompleteVehicle): LoadingSlotStatus {
  const coverage = resolveAssignCoverage(vehicle);
  if (coverage === "full") return "waiting";
  return "shortage";
}

function vehicleStatusLabel(vehicle: IncompleteVehicle): string {
  const coverage = resolveAssignCoverage(vehicle);
  if (coverage === "full") return "Đang chờ xuất";
  if (coverage === "partial") return "Gán 1 phần";
  return "Chưa hoàn tất";
}

function productRowKey(row: OutboundVehicleProductLine): string {
  return `${row.customer_name}::${row.product_id}`;
}

function countVehiclesForOrder(
  vehicles: IncompleteVehicle[],
  orderId: number,
): number {
  const plates = new Set<string>();
  for (const vehicle of vehicles) {
    if (
      vehicle.details.some((detail) => detail.outbound_order_id === orderId)
    ) {
      plates.add(vehicle.vehicle_number);
    }
  }
  return plates.size;
}

function filterVehiclesByOrder(
  vehicles: IncompleteVehicle[],
  orderId: number,
): IncompleteVehicle[] {
  return vehicles.filter((vehicle) =>
    vehicle.details.some((detail) => detail.outbound_order_id === orderId),
  );
}

function sumOrderQuantity(order: OutboundOrder): number {
  return order.detail_groups.reduce(
    (sum, group) =>
      sum +
      group.items.reduce(
        (itemSum, item) => itemSum + (Number(item.requested_quantity) || 0),
        0,
      ),
    0,
  );
}

function countOrderVehicles(order: OutboundOrder): number {
  return new Set(
    order.detail_groups
      .map((group) => group.vehicle_number?.trim())
      .filter(Boolean),
  ).size;
}

type OperatorOutboundOrderBrowserProps = {
  zoneId: number;
  orders: OutboundOrder[];
  vehicles: IncompleteVehicle[];
  loading?: boolean;
  error?: boolean;
  selectedOrderId: number | null;
  onSelectedOrderIdChange: (orderId: number | null) => void;
  selectedVehicleNumber: string | null;
  onSelectVehicle: (vehicleNumber: string | null) => void;
  onSelectedProductsChange?: (rows: OutboundSelectedProductLine[]) => void;
};

export default function OperatorOutboundOrderBrowser({
  zoneId,
  orders,
  vehicles,
  loading = false,
  error = false,
  selectedOrderId,
  onSelectedOrderIdChange,
  selectedVehicleNumber,
  onSelectVehicle,
  onSelectedProductsChange,
}: OperatorOutboundOrderBrowserProps) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;
  const orderVehicles = useMemo(() => {
    if (!selectedOrderId) return [];
    return filterVehiclesByOrder(vehicles, selectedOrderId);
  }, [vehicles, selectedOrderId]);

  const { data, isLoading, isError } = useOutboundVehicleProducts(
    zoneId,
    selectedVehicleNumber ?? "",
    Boolean(selectedVehicleNumber) && zoneId > 0,
    "incomplete",
  );
  const products = data?.products ?? EMPTY_PRODUCTS;

  const selectedSummary = useMemo(() => {
    const keySet = new Set(selectedRowKeys.map(String));
    const rows = products.filter((row) => keySet.has(productRowKey(row)));
    const totalQty = rows.reduce(
      (sum, row) => sum + (Number(row.total_quantity) || 0),
      0,
    );
    return { count: rows.length, totalQty };
  }, [products, selectedRowKeys]);

  const productColumns: ColumnsType<OutboundVehicleProductLine> = [
    {
      title: "Khách hàng",
      dataIndex: "customer_name",
      key: "customer_name",
      width: 96,
      ellipsis: true,
      render: (name: string) => (
        <span className="truncate text-sm font-semibold text-brand-dark">
          {name}
        </span>
      ),
    },
    {
      title: "Hàng hóa",
      key: "product",
      render: (_: unknown, row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-semibold text-brand-dark">
            {row.product_sku?.trim() || `P${row.product_id}`}
          </p>
          <p className="truncate text-xs text-slate-500">
            {row.product_name?.trim() || "—"}
          </p>
        </div>
      ),
    },
    {
      title: "SL",
      dataIndex: "total_quantity",
      key: "total_quantity",
      width: 64,
      align: "right",
      render: (qty: number) => (
        <span className="tabular-nums text-sm font-semibold text-brand-dark">
          {toDisplayInteger(qty)}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      key: "statuses",
      width: 100,
      render: (_: unknown, row) => (
        <span className="text-xs font-medium leading-tight text-slate-600">
          {row.statuses?.length
            ? row.statuses.map(outboundStatusLabel).join(" / ")
            : "—"}
        </span>
      ),
    },
  ];

  if (selectedVehicleNumber && selectedOrderId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-stripe-hairline px-3 py-2.5">
          <Button
            variant="secondary"
            icon={<ArrowLeftOutlined />}
            className="!h-9 !px-2.5 !text-sm"
            onClick={() => {
              onSelectVehicle(null);
              setSelectedRowKeys([]);
              onSelectedProductsChange?.(EMPTY_SELECTED_LINES);
            }}
          >
            Xe
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-base font-bold text-brand-dark">
              {selectedVehicleNumber}
            </p>
            {selectedSummary.count > 0 ? (
              <p className="text-sm text-slate-500">
                {selectedSummary.count} dòng · SL{" "}
                {toDisplayInteger(selectedSummary.totalQty)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="px-2 py-6 text-center text-sm text-slate-500">
              Đang tải hàng hóa...
            </div>
          ) : isError ? (
            <div className="px-2 py-6 text-center text-sm text-error-600">
              Không tải được danh sách hàng
            </div>
          ) : (
            <Table<OutboundVehicleProductLine>
              columns={productColumns}
              dataSource={products}
              rowKey={productRowKey}
              pagination={false}
              size="small"
              loading={false}
              locale={{ emptyText: "Xe này không còn hàng chưa hoàn tất" }}
              rowSelection={{
                selectedRowKeys,
                columnWidth: 36,
                onChange: (keys, rows) => {
                  setSelectedRowKeys(keys);
                  onSelectedProductsChange?.(
                    rows.map((row) => ({
                      ...row,
                      rowKey: productRowKey(row),
                    })),
                  );
                },
                getCheckboxProps: (row) => ({
                  name: row.product_sku ?? String(row.product_id),
                }),
              }}
              onRow={(record) => ({
                onClick: (event) => {
                  const target = event.target as HTMLElement | null;
                  if (
                    target?.closest(".ant-checkbox-wrapper") ||
                    target?.closest("input")
                  ) {
                    return;
                  }
                  const key = productRowKey(record);
                  setSelectedRowKeys((prev) => {
                    const has = prev.some((item) => String(item) === key);
                    const next = has
                      ? prev.filter((item) => String(item) !== key)
                      : [...prev, key];
                    const keySet = new Set(next.map(String));
                    onSelectedProductsChange?.(
                      products
                        .filter((row) => keySet.has(productRowKey(row)))
                        .map((row) => ({
                          ...row,
                          rowKey: productRowKey(row),
                        })),
                    );
                    return next;
                  });
                },
                className: "cursor-pointer",
              })}
              className="[&_.ant-table-tbody_td]:align-middle [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-row-selected>td]:!bg-brand-primary/10"
            />
          )}
        </div>
      </div>
    );
  }

  if (selectedOrderId && selectedOrder) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-stripe-hairline px-3 py-2.5">
          <Button
            variant="secondary"
            icon={<ArrowLeftOutlined />}
            className="!h-9 !px-2.5 !text-sm"
            onClick={() => {
              onSelectedOrderIdChange(null);
              onSelectVehicle(null);
              setSelectedRowKeys([]);
              onSelectedProductsChange?.(EMPTY_SELECTED_LINES);
            }}
          >
            Đơn
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-base font-bold text-brand-dark">
              {selectedOrder.order_code}
            </p>
            <p className="text-sm text-slate-500">
              {orderVehicles.length} xe chờ xuất
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {loading ? (
            <div className="px-2 py-6 text-center text-sm text-slate-500">
              Đang tải danh sách xe...
            </div>
          ) : orderVehicles.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-slate-500">
              Không có xe nào thuộc đơn này
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {orderVehicles.map((vehicle, index) => {
                const tone = VEHICLE_PANEL_TONE[mapVehicleTone(vehicle)];
                return (
                  <button
                    key={vehicle.vehicle_number}
                    type="button"
                    title="Nhấp đúp để xem sản phẩm"
                    aria-label={`Nhấp đúp để xem sản phẩm của xe ${vehicle.vehicle_number}`}
                    onDoubleClick={() => onSelectVehicle(vehicle.vehicle_number)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        onSelectVehicle(vehicle.vehicle_number);
                      }
                    }}
                    className={cn(
                      "group relative flex min-h-28 w-full flex-col gap-2 overflow-hidden rounded-xl border px-3 py-3 pl-4 text-left shadow-stripe-1 transition duration-200 hover:-translate-y-0.5",
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
                    <div className="relative z-10 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stripe-ink-mute">
                        Xe {String(index + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          tone.badge,
                        )}
                      >
                        {vehicleStatusLabel(vehicle)}
                      </span>
                    </div>
                    <div className="relative z-10 flex items-center gap-3 border-t border-stripe-hairline pt-2">
                      <div className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl border border-stripe-hairline bg-panel-soft shadow-sm">
                        <TruckDockIcon className="h-7 w-10 text-brand-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-lg font-extrabold tracking-wide text-brand-dark">
                          {vehicle.vehicle_number}
                        </p>
                        <p className="mt-0.5 text-sm text-stripe-ink-mute">
                          {vehicle.customer_count} KH · {vehicle.detail_count}{" "}
                          nhóm
                        </p>
                      </div>
                      <RightOutlined className="text-stripe-ink-mute transition group-hover:translate-x-0.5 group-hover:text-brand-primary" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-error-600">
        Không tải được danh sách đơn xuất
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-2.5">
      {loading ? (
        <div className="px-2 py-6 text-center text-sm text-slate-500">
          Đang tải đơn xuất...
        </div>
      ) : orders.length === 0 ? (
        <div className="px-2 py-6 text-center text-sm text-slate-500">
          Chưa có đơn xuất nào
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {orders.map((order) => {
            const tone = ORDER_TONE[order.status];
            const vehicleCount = Math.max(
              countVehiclesForOrder(vehicles, order.id),
              countOrderVehicles(order),
            );
            return (
              <button
                key={order.id}
                type="button"
                title="Nhấp đúp để xem danh sách xe"
                aria-label={`Nhấp đúp để xem xe của đơn ${order.order_code}`}
                onDoubleClick={() => onSelectedOrderIdChange(order.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSelectedOrderIdChange(order.id);
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
                    <span
                      className={cn(
                        "inline-flex rounded px-2 py-0.5 text-xs font-bold uppercase",
                        tone.badge,
                      )}
                    >
                      {ORDER_STATUS_LABEL[order.status]}
                    </span>
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
                        {toDisplayInteger(sumOrderQuantity(order))}
                      </strong>
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
