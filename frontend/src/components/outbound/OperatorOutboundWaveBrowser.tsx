import { useMemo, useState, type Key } from "react";
import {
  ArrowLeftOutlined,
  RightOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Table, cn } from "@/components/ui";
import { TruckDockIcon } from "@/components/outbound/iotIcons";
import { useOutboundVehicleProducts } from "@/hooks/useOutbound";
import type {
  IncompleteVehicle,
  OutboundOrder,
  OutboundVehicleProductLine,
} from "@/types/outbound";
import type { SortingWave } from "@/types/sortingWave";
import type { LoadingSlotStatus } from "@/data/mockOperatorOutbound";
import { outboundStatusLabel } from "@/utils/outboundStatusLabel";
import { toDisplayInteger } from "@/utils/number";
import type { OutboundSelectedProductLine } from "@/components/outbound/OperatorOutboundVehicleCards";

const EMPTY_PRODUCTS: OutboundVehicleProductLine[] = [];
const EMPTY_SELECTED_LINES: OutboundSelectedProductLine[] = [];

const WAVE_TONE = {
  shell:
    "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
  rail: "bg-brand-primary",
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

function buildOrderWaveMap(orders: OutboundOrder[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const order of orders) {
    map.set(order.id, order.sorting_wave_ids ?? []);
  }
  return map;
}

function filterVehiclesByWave(
  vehicles: IncompleteVehicle[],
  waveId: number,
  orderWaveMap: Map<number, number[]>,
): IncompleteVehicle[] {
  return vehicles.filter((vehicle) =>
    vehicle.details.some((detail) =>
      (orderWaveMap.get(detail.outbound_order_id) ?? []).includes(waveId),
    ),
  );
}

function countVehiclesForWave(
  vehicles: IncompleteVehicle[],
  waveId: number,
  orderWaveMap: Map<number, number[]>,
): number {
  return filterVehiclesByWave(vehicles, waveId, orderWaveMap).length;
}

type OperatorOutboundWaveBrowserProps = {
  zoneId: number;
  waves: SortingWave[];
  vehicles: IncompleteVehicle[];
  orders: OutboundOrder[];
  loading?: boolean;
  selectedWaveId: number | null;
  onSelectedWaveIdChange: (waveId: number | null) => void;
  selectedVehicleNumber: string | null;
  onSelectVehicle: (vehicleNumber: string | null) => void;
  onSelectedProductsChange?: (rows: OutboundSelectedProductLine[]) => void;
};

export default function OperatorOutboundWaveBrowser({
  zoneId,
  waves,
  vehicles,
  orders,
  loading = false,
  selectedWaveId,
  onSelectedWaveIdChange,
  selectedVehicleNumber,
  onSelectVehicle,
  onSelectedProductsChange,
}: OperatorOutboundWaveBrowserProps) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const orderWaveMap = useMemo(() => buildOrderWaveMap(orders), [orders]);
  const selectedWave = waves.find((wave) => wave.id === selectedWaveId) ?? null;
  const waveVehicles = useMemo(() => {
    if (!selectedWaveId) return [];
    return filterVehiclesByWave(vehicles, selectedWaveId, orderWaveMap);
  }, [vehicles, selectedWaveId, orderWaveMap]);

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

  if (selectedVehicleNumber && selectedWaveId) {
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

  if (selectedWaveId && selectedWave) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-stripe-hairline px-3 py-2.5">
          <Button
            variant="secondary"
            icon={<ArrowLeftOutlined />}
            className="!h-9 !px-2.5 !text-sm"
            onClick={() => {
              onSelectedWaveIdChange(null);
              onSelectVehicle(null);
              setSelectedRowKeys([]);
              onSelectedProductsChange?.(EMPTY_SELECTED_LINES);
            }}
          >
            Phiên
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-brand-dark">
              {selectedWave.name}
            </p>
            <p className="text-sm text-slate-500">
              {waveVehicles.length} xe chờ xuất
            </p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {loading ? (
            <div className="px-2 py-6 text-center text-sm text-slate-500">
              Đang tải danh sách xe...
            </div>
          ) : waveVehicles.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-slate-500">
              Không có xe nào thuộc phiên xuất này
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {waveVehicles.map((vehicle, index) => {
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-2.5">
      {loading ? (
        <div className="px-2 py-6 text-center text-sm text-slate-500">
          Đang tải phiên xuất...
        </div>
      ) : waves.length === 0 ? (
        <div className="px-2 py-6 text-center text-sm text-slate-500">
          Chưa có phiên xuất được cấu hình
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {waves.map((wave) => {
            const vehicleCount = countVehiclesForWave(
              vehicles,
              wave.id,
              orderWaveMap,
            );
            return (
              <button
                key={wave.id}
                type="button"
                title="Nhấp đúp để xem danh sách xe"
                aria-label={`Nhấp đúp để xem xe của phiên ${wave.name}`}
                onDoubleClick={() => onSelectedWaveIdChange(wave.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSelectedWaveIdChange(wave.id);
                }}
                className={cn(
                  "group relative flex min-h-24 w-full items-center gap-3 overflow-hidden rounded-xl border p-3 pl-4 text-left shadow-stripe-1 transition duration-200 hover:-translate-y-0.5",
                  WAVE_TONE.shell,
                )}
              >
                <span
                  className={cn("absolute inset-y-0 left-0 w-1.5", WAVE_TONE.rail)}
                  aria-hidden
                />
                <span
                  className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full border border-cyan-300/15 shadow-[0_0_28px_rgba(34,211,238,0.12)]"
                  aria-hidden
                />
                <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-stripe-hairline bg-panel-soft text-xl text-brand-primary shadow-sm">
                  <ThunderboltOutlined />
                </span>
                <span className="relative z-10 min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-[0.14em] text-stripe-ink-mute">
                    Phiên xuất
                  </span>
                  <span className="mt-0.5 block truncate text-lg font-extrabold tracking-wide text-brand-dark">
                    {wave.name}
                  </span>
                  <span className="mt-1 block text-sm text-stripe-ink-mute">
                    {vehicleCount} xe ·{" "}
                    {(wave.sorting_stations?.length ?? 0) +
                      (wave.outbound_stations?.length ?? 0)}{" "}
                    điểm
                  </span>
                </span>
                <RightOutlined className="relative z-10 text-stripe-ink-mute transition group-hover:translate-x-0.5 group-hover:text-brand-primary" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
