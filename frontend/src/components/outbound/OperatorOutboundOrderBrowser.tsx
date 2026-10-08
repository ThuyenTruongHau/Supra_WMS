import { useEffect, useMemo, useState, type Key, type ReactNode } from "react";
import {
  ArrowLeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Table, cn } from "@/components/ui";
import { TruckDockIcon } from "@/components/outbound/iotIcons";
import {
  useOperatorBoardOrders,
  useOperatorBoardVehicles,
  useOperatorBoardCustomers,
  useOperatorBoardTrips,
  useOperatorBoardLines,
} from "@/hooks/useOutbound";
import { operatorBoardTripPathKey } from "@/api/outbound";
import type {
  OperatorBoardLineRow,
  OperatorBoardOrderRow,
  OperatorBoardCustomerRow,
  OperatorBoardProgressFields,
  OperatorBoardTripRow,
  OperatorBoardVehicleRow,
} from "@/types/outbound";
import { translateStatus } from "@/i18n/statusLabels.vi";
import { toDisplayInteger } from "@/utils/number";
import type { OutboundSelectedProductLine } from "@/components/outbound/OperatorOutboundVehicleCards";

const EMPTY_SELECTED_LINES: OutboundSelectedProductLine[] = [];

const NO_VEHICLE_LABEL = "Không biển số";

type Tone = { shell: string; rail: string; badge: string };

const DEFAULT_TONE: Tone = {
  shell:
    "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
  rail: "bg-warning-400",
  badge: "bg-warning-100 text-warning-700",
};

const ORDER_TONE: Record<string, Tone> = {
  initialize: DEFAULT_TONE,
  pending: DEFAULT_TONE,
  in_progress: {
    shell:
      "border-brand-primary/20 bg-brand-primary/5 hover:border-brand-primary/40 hover:shadow-sm",
    rail: "bg-info-500",
    badge: "bg-info-100 text-info-700",
  },
  reserved: {
    shell:
      "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
    rail: "bg-indigo-400",
    badge: "bg-indigo-100 text-indigo-700",
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

function toneForStatus(status: string): Tone {
  return ORDER_TONE[status] ?? DEFAULT_TONE;
}

/** Tiến độ nhóm xe/KH/trip — nhãn trạng thái giống admin (i18n chung). */
function progressStatusBadge(
  progress: OperatorBoardProgressFields,
): { label: string; tone: Tone } {
  if (progress.is_fully_done || progress.done_coverage === "full") {
    return {
      label: translateStatus("completed"),
      tone: toneForStatus("completed"),
    };
  }
  if (progress.done_coverage === "partial") {
    return {
      label: translateStatus("in_progress"),
      tone: toneForStatus("in_progress"),
    };
  }
  return {
    label: translateStatus("initialize"),
    tone: toneForStatus("initialize"),
  };
}

function formatProgressMeta(progress: OperatorBoardProgressFields): string {
  const parts = [
    `${progress.pending_detail_count} chờ`,
    `${progress.done_detail_count} xong`,
    `SL ${toDisplayInteger(progress.pending_quantity)}`,
  ];
  return parts.join(" · ");
}

function displayVehicle(vehicleNumber: string): string {
  return vehicleNumber === "no_vehicle" ? NO_VEHICLE_LABEL : vehicleNumber;
}

function displayTrip(trip: string): string {
  return trip.trim() ? trip : "—";
}

function lineRowKey(row: OperatorBoardLineRow): string {
  return String(row.detail_id);
}

function linesToSelectedProducts(
  lines: OperatorBoardLineRow[],
): OutboundSelectedProductLine[] {
  return lines.map((line) => ({
    customer_name: line.customer_name,
    product_id: line.item_id,
    product_sku: line.sku != null ? String(line.sku) : null,
    product_name: null,
    item_ids: [line.item_id],
    total_quantity: line.quantity,
    total_pallet_quantity: 0,
    statuses: [line.status],
    rowKey: lineRowKey(line),
  }));
}

type OperatorOutboundOrderBrowserProps = {
  warehouseId: number;
  selectedOrderId: number | null;
  onSelectedOrderIdChange: (orderId: number | null) => void;
  selectedVehicleNumber: string | null;
  onSelectVehicle: (vehicleNumber: string | null) => void;
  onSelectedProductsChange?: (rows: OutboundSelectedProductLine[]) => void;
};

export default function OperatorOutboundOrderBrowser({
  warehouseId,
  selectedOrderId,
  onSelectedOrderIdChange,
  selectedVehicleNumber,
  onSelectVehicle,
  onSelectedProductsChange,
}: OperatorOutboundOrderBrowserProps) {
  const [selectedCustomerName, setSelectedCustomerName] = useState<
    string | null
  >(null);
  const [selectedTripKey, setSelectedTripKey] = useState<string | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);

  useEffect(() => {
    setSelectedCustomerName(null);
    setSelectedTripKey(null);
    setSelectedRowKeys([]);
    onSelectedProductsChange?.(EMPTY_SELECTED_LINES);
  }, [selectedOrderId, selectedVehicleNumber, onSelectedProductsChange]);

  useEffect(() => {
    setSelectedTripKey(null);
    setSelectedRowKeys([]);
    onSelectedProductsChange?.(EMPTY_SELECTED_LINES);
  }, [selectedCustomerName, onSelectedProductsChange]);

  const ordersQuery = useOperatorBoardOrders(warehouseId);
  const orders = ordersQuery.data?.items ?? [];

  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;

  const vehiclesQuery = useOperatorBoardVehicles(
    selectedOrderId,
    Boolean(selectedOrderId),
  );
  const vehicles = vehiclesQuery.data?.items ?? [];

  const customersQuery = useOperatorBoardCustomers(
    selectedOrderId,
    selectedVehicleNumber,
    Boolean(selectedOrderId) && Boolean(selectedVehicleNumber),
  );
  const customers = customersQuery.data?.items ?? [];

  const tripsQuery = useOperatorBoardTrips(
    selectedOrderId,
    selectedVehicleNumber,
    selectedCustomerName,
    Boolean(selectedCustomerName),
  );
  const trips = tripsQuery.data?.items ?? [];

  const linesQuery = useOperatorBoardLines(
    selectedOrderId,
    selectedVehicleNumber,
    selectedCustomerName,
    selectedTripKey,
    Boolean(selectedTripKey),
  );
  const lines = linesQuery.data?.items ?? [];

  const selectedSummary = useMemo(() => {
    const keySet = new Set(selectedRowKeys.map(String));
    const rows = lines.filter((row) => keySet.has(lineRowKey(row)));
    const totalQty = rows.reduce(
      (sum, row) => sum + (Number(row.quantity) || 0),
      0,
    );
    return { count: rows.length, totalQty };
  }, [lines, selectedRowKeys]);

  const lineColumns: ColumnsType<OperatorBoardLineRow> = [
    {
      title: "SKU / mã hàng",
      key: "sku",
      ellipsis: true,
      render: (_: unknown, row) => (
        <span className="font-mono text-lg font-bold leading-snug text-brand-dark">
          {row.sku != null && String(row.sku).trim() !== ""
            ? String(row.sku)
            : `P${row.item_id}`}
        </span>
      ),
    },
    {
      title: "Số lô",
      dataIndex: "lot_number",
      width: 120,
      ellipsis: true,
      render: (lot: OperatorBoardLineRow["lot_number"]) => (
        <span className="font-mono text-base font-semibold text-slate-700">
          {lot != null && String(lot).trim() !== "" ? String(lot) : "—"}
        </span>
      ),
    },
    {
      title: "SL",
      dataIndex: "quantity",
      width: 88,
      align: "right",
      render: (qty: number) => (
        <span className="tabular-nums text-2xl font-black text-brand-primary">
          {toDisplayInteger(qty)}
        </span>
      ),
    },
    {
      title: "ĐVT",
      dataIndex: "unit",
      width: 72,
      align: "center",
      render: (unit: string) => (
        <span className="text-base font-semibold text-slate-700">{unit}</span>
      ),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      width: 120,
      render: (status: string) => (
        <span className="text-base font-semibold text-slate-700">
          {translateStatus(status)}
        </span>
      ),
    },
  ];

  const lineTableClassName = cn(
    "[&_.ant-table-thead>tr>th]:!bg-slate-50 [&_.ant-table-thead>tr>th]:!py-4 [&_.ant-table-thead>tr>th]:!text-sm [&_.ant-table-thead>tr>th]:!font-bold [&_.ant-table-thead>tr>th]:!uppercase [&_.ant-table-thead>tr>th]:!tracking-wide",
    "[&_.ant-table-tbody>tr>td]:!py-4 [&_.ant-table-tbody>tr>td]:!align-middle",
    "[&_.ant-table-tbody>tr:hover>td]:!bg-brand-primary/[0.04]",
    "[&_.ant-table-row-selected>td]:!bg-brand-primary/10",
    "[&_.ant-checkbox-wrapper]:!scale-125",
  );

  const resetDrill = () => {
    onSelectedOrderIdChange(null);
    onSelectVehicle(null);
    setSelectedCustomerName(null);
    setSelectedTripKey(null);
    setSelectedRowKeys([]);
    onSelectedProductsChange?.(EMPTY_SELECTED_LINES);
  };

  if (selectedTripKey && selectedOrderId && selectedVehicleNumber && selectedCustomerName) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-stripe-hairline px-3 py-2.5">
          <Button
            variant="secondary"
            icon={<ArrowLeftOutlined />}
            className="!h-9 !px-2.5 !text-sm"
            onClick={() => {
              setSelectedTripKey(null);
              setSelectedRowKeys([]);
              onSelectedProductsChange?.(EMPTY_SELECTED_LINES);
            }}
          >
            Trip
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-black text-brand-dark">
              {displayTrip(linesQuery.data?.trip ?? "")}
            </p>
            {selectedSummary.count > 0 ? (
              <p className="text-base text-slate-500">
                {selectedSummary.count} dòng · SL{" "}
                {toDisplayInteger(selectedSummary.totalQty)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {linesQuery.isLoading ? (
            <div className="px-2 py-8 text-center text-base text-slate-500">
              Đang tải dòng hàng...
            </div>
          ) : linesQuery.isError ? (
            <div className="px-2 py-8 text-center text-base text-error-600">
              Không tải được dòng hàng
            </div>
          ) : (
            <Table<OperatorBoardLineRow>
              columns={lineColumns}
              dataSource={lines}
              rowKey={lineRowKey}
              pagination={false}
              size="large"
              locale={{ emptyText: "Không còn dòng chưa hoàn tất" }}
              rowSelection={{
                selectedRowKeys,
                columnWidth: 52,
                onChange: (keys, rows) => {
                  setSelectedRowKeys(keys);
                  onSelectedProductsChange?.(linesToSelectedProducts(rows));
                },
              }}
              className={lineTableClassName}
            />
          )}
        </div>
      </div>
    );
  }

  if (selectedCustomerName && selectedOrderId && selectedVehicleNumber) {
    return (
      <DrillList<TripRowView>
        backLabel="Khách hàng"
        title={selectedCustomerName}
        subtitle={`${trips.length} trip`}
        loading={tripsQuery.isLoading}
        error={tripsQuery.isError}
        emptyText="Không có trip nào"
        items={trips.map((trip) => ({ ...trip, key: operatorBoardTripPathKey(trip.trip) }))}
        onBack={() => {
          setSelectedCustomerName(null);
          setSelectedTripKey(null);
        }}
        renderCard={(trip, index) => {
          const { label: badgeLabel, tone } = progressStatusBadge(trip);
          return (
            <DrillCard
              label={`Trip ${String(index + 1).padStart(2, "0")}`}
              title={displayTrip(trip.trip)}
              meta={formatProgressMeta(trip)}
              badgeLabel={badgeLabel}
              tone={tone}
              onActivate={() => setSelectedTripKey(trip.key)}
            />
          );
        }}
      />
    );
  }

  if (selectedVehicleNumber && selectedOrderId) {
    return (
      <DrillList<OperatorBoardCustomerRow & { key: string }>
        backLabel="Xe"
        title={displayVehicle(selectedVehicleNumber)}
        subtitle={`${customers.length} khách hàng`}
        loading={customersQuery.isLoading}
        error={customersQuery.isError}
        emptyText="Không có khách hàng nào"
        items={customers.map((c) => ({ ...c, key: c.customer_name }))}
        onBack={() => {
          onSelectVehicle(null);
          setSelectedCustomerName(null);
        }}
        renderCard={(customer, index) => {
          const { label: badgeLabel, tone } = progressStatusBadge(customer);
          return (
            <DrillCard
              label={`KH ${String(index + 1).padStart(2, "0")}`}
              title={customer.customer_name}
              meta={`${customer.trip_count} trip · ${formatProgressMeta(customer)}`}
              badgeLabel={badgeLabel}
              tone={tone}
              onActivate={() => setSelectedCustomerName(customer.customer_name)}
            />
          );
        }}
      />
    );
  }

  if (selectedOrderId && selectedOrder) {
    return (
      <DrillList<OperatorBoardVehicleRow>
        backLabel="Đơn"
        title={selectedOrder.order_code}
        subtitle={`${vehicles.length} xe`}
        loading={vehiclesQuery.isLoading}
        error={vehiclesQuery.isError}
        emptyText="Không có xe nào (detail chưa hoàn tất)"
        items={vehicles}
        onBack={resetDrill}
        renderCard={(vehicle, index) => {
          const { label: badgeLabel, tone } = progressStatusBadge(vehicle);
          return (
            <button
              key={vehicle.vehicle_number}
              type="button"
              title="Nhấp đúp để xem khách hàng"
              onDoubleClick={() => onSelectVehicle(vehicle.vehicle_number)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSelectVehicle(vehicle.vehicle_number);
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
                  {badgeLabel}
                </span>
              </div>
              <div className="relative z-10 flex items-center gap-3 border-t border-stripe-hairline pt-2">
                <div className="flex h-11 w-12 shrink-0 items-center justify-center rounded-xl border border-stripe-hairline bg-panel-soft shadow-sm">
                  <TruckDockIcon className="h-7 w-10 text-brand-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-lg font-extrabold text-brand-dark">
                    {displayVehicle(vehicle.vehicle_number)}
                  </p>
                  <p className="mt-0.5 text-sm text-stripe-ink-mute">
                    {vehicle.customer_count} KH · {formatProgressMeta(vehicle)}
                  </p>
                </div>
                <RightOutlined className="text-stripe-ink-mute transition group-hover:translate-x-0.5 group-hover:text-brand-primary" />
              </div>
            </button>
          );
        }}
      />
    );
  }

  if (ordersQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-error-600">
        Không tải được danh sách đơn xuất
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-2.5">
      {ordersQuery.isLoading ? (
        <div className="px-2 py-6 text-center text-sm text-slate-500">
          Đang tải đơn xuất...
        </div>
      ) : orders.length === 0 ? (
        <div className="px-2 py-6 text-center text-sm text-slate-500">
          Chưa có đơn xuất nào
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onOpen={() => onSelectedOrderIdChange(order.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type TripRowView = OperatorBoardTripRow & { key: string };

function OrderCard({
  order,
  onOpen,
}: {
  order: OperatorBoardOrderRow;
  onOpen: () => void;
}) {
  const tone = toneForStatus(order.status);
  const badgeLabel = translateStatus(order.status);
  return (
    <button
      type="button"
      title="Nhấp đúp để xem xe"
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      className={cn(
        "group relative flex min-h-28 w-full overflow-hidden rounded-xl border p-3 pl-4 text-left shadow-stripe-1 transition duration-200 hover:-translate-y-0.5",
        tone.shell,
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", tone.rail)} aria-hidden />
      <span className="relative z-10 flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-[0.16em] text-stripe-ink-mute">
              Mã đơn
            </span>
            <span className="mt-0.5 block truncate font-mono text-xl font-extrabold text-brand-dark">
              {order.order_code}
            </span>
          </span>
          <span
            className={cn(
              "inline-flex rounded px-2 py-0.5 text-xs font-bold uppercase",
              tone.badge,
            )}
          >
            {badgeLabel}
          </span>
        </span>
        <span className="mt-auto grid grid-cols-2 gap-3 border-t border-stripe-hairline pt-2 text-sm">
          <span className="border-r border-stripe-hairline">
            <span className="block text-xs font-bold uppercase tracking-wider text-stripe-ink-mute">
              Số xe
            </span>
            <strong className="mt-0.5 block text-lg font-black text-brand-dark">
              {order.vehicle_count}
            </strong>
          </span>
          <span>
            <span className="block text-xs font-bold uppercase tracking-wider text-stripe-ink-mute">
              SL mở
            </span>
            <strong className="mt-0.5 block text-lg font-black tabular-nums text-brand-dark">
              {toDisplayInteger(order.open_line_quantity)}
            </strong>
          </span>
        </span>
      </span>
    </button>
  );
}

function DrillList<T>({
  backLabel,
  title,
  subtitle,
  loading,
  error,
  emptyText,
  items,
  onBack,
  renderCard,
}: {
  backLabel: string;
  title: string;
  subtitle: string;
  loading: boolean;
  error: boolean;
  emptyText: string;
  items: T[];
  onBack: () => void;
  renderCard: (item: T, index: number) => ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-stripe-hairline px-3 py-2.5">
        <Button
          variant="secondary"
          icon={<ArrowLeftOutlined />}
          className="!h-9 !px-2.5 !text-sm"
          onClick={onBack}
        >
          {backLabel}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-brand-dark">{title}</p>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {loading ? (
          <div className="px-2 py-6 text-center text-sm text-slate-500">
            Đang tải...
          </div>
        ) : error ? (
          <div className="px-2 py-6 text-center text-sm text-error-600">
            Không tải được dữ liệu
          </div>
        ) : items.length === 0 ? (
          <div className="px-2 py-6 text-center text-sm text-slate-500">
            {emptyText}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {items.map((item, index) => renderCard(item, index))}
          </div>
        )}
      </div>
    </div>
  );
}

function DrillCard({
  label,
  title,
  meta,
  badgeLabel,
  tone = DEFAULT_TONE,
  onActivate,
}: {
  label: string;
  title: string;
  meta: string;
  badgeLabel: string;
  tone?: Tone;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      title="Nhấp đúp để mở"
      onDoubleClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter") onActivate();
      }}
      className={cn(
        "group relative flex min-h-24 w-full flex-col gap-2 overflow-hidden rounded-xl border px-3 py-3 pl-4 text-left shadow-stripe-1 transition hover:-translate-y-0.5",
        tone.shell,
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1.5", tone.rail)} aria-hidden />
      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-stripe-ink-mute">
          {label}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            tone.badge,
          )}
        >
          {badgeLabel}
        </span>
      </div>
      <div className="relative z-10 min-w-0 flex-1">
        <p className="truncate font-semibold text-brand-dark">{title}</p>
        <p className="mt-0.5 text-sm text-stripe-ink-mute">{meta}</p>
      </div>
      <RightOutlined className="relative z-10 self-end text-stripe-ink-mute transition group-hover:translate-x-0.5 group-hover:text-brand-primary" />
    </button>
  );
}
