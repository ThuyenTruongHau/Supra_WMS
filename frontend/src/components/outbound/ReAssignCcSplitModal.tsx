/**
 * Modal chọn xe → KH → trip để chia lại ô CC (UI; chưa gọi API).
 * Nguồn dữ liệu: operator-board (warehouse), không dùng incomplete-vehicles (đã gỡ BE).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ModalProps } from "antd";
import {
  ArrowLeftOutlined,
  RightOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { useQueries } from "@tanstack/react-query";
import { Button, Modal, cn, message } from "@/components/ui";
import { OPERATOR_DESKTOP } from "@/constants/operatorDesktopSizes";
import {
  operatorModalWidthForTier,
  operatorPickGridMaxHeightClass,
  useOperatorViewportTier,
  type OperatorViewportTier,
} from "@/utils/operatorViewportTier";
import {
  listOperatorBoardVehiclesApi,
  operatorBoardTripPathKey,
} from "@/api/outbound";
import {
  operatorBoardVehiclesQueryKey,
  useOperatorBoardCustomers,
  useOperatorBoardOrders,
  useOperatorBoardTrips,
} from "@/hooks/useOutbound";
import type { OperatorBoardProgressFields } from "@/types/outbound";
import { TruckDockIcon } from "@/components/outbound/iotIcons";
import { toDisplayInteger } from "@/utils/number";
import { translateStatus } from "@/i18n/statusLabels.vi";

export type ReAssignCcSplitAssignMode = "vehicle" | "customer" | "trip";

export type ReAssignCcSplitSelection = {
  location_code: string;
  location_name: string;
  location_id: number | null;
  warehouse_id: number;
  /** Mức chia lại: ưu tiên trip > KH > xe theo lựa chọn hiện tại. */
  assign_mode: ReAssignCcSplitAssignMode;
  vehicle_number: string | null;
  customer_name: string | null;
  trip_code: string | null;
  outbound_order_id: number | null;
  order_code: string | null;
};

type DrillLevel = "vehicle" | "customer" | "trip";

type VehiclePick = {
  key: string;
  order_id: number;
  order_code: string;
  vehicle_number: string;
};

type Props = {
  open: boolean;
  /** Mã nội bộ — payload API, không hiển thị. */
  locationCode: string;
  /** Nhãn hiển thị (location_name). */
  locationName: string;
  locationId?: number | null;
  warehouseId: number;
  onClose: () => void;
  onConfirm?: (selection: ReAssignCcSplitSelection) => void;
  zIndex?: number;
};

const NO_VEHICLE_LABEL = "Không biển số";

function vehiclePickKey(orderId: number, vehicleNumber: string): string {
  return `${orderId}\u0001${vehicleNumber}`;
}

function parseVehiclePickKey(key: string): VehiclePick | null {
  const sep = key.indexOf("\u0001");
  if (sep <= 0) return null;
  const orderId = Number(key.slice(0, sep));
  const vehicleNumber = key.slice(sep + 1);
  if (!orderId || !vehicleNumber) return null;
  return {
    key,
    order_id: orderId,
    order_code: "",
    vehicle_number: vehicleNumber,
  };
}

function displayVehicle(vehicleNumber: string): string {
  return vehicleNumber === "no_vehicle" ? NO_VEHICLE_LABEL : vehicleNumber;
}

function displayTrip(trip: string): string {
  const t = trip.trim();
  return t ? t : "—";
}

type Tone = { shell: string; rail: string; badge: string };

const DEFAULT_TONE: Tone = {
  shell:
    "border-stripe-hairline bg-panel hover:border-brand-primary/30 hover:shadow-sm",
  rail: "bg-warning-400",
  badge: "bg-warning-100 text-warning-700",
};

/** Thẻ đang chọn — tách hẳn khỏi tone trạng thái. */
const SELECTED_SHELL =
  "border-brand-primary bg-brand-primary/18 shadow-md ring-2 ring-brand-primary/50";
const SELECTED_RAIL = "bg-brand-primary";

const ORDER_TONE: Record<string, Tone> = {
  in_progress: {
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
};

function progressStatusBadge(progress: OperatorBoardProgressFields): {
  label: string;
  tone: Tone;
} {
  if (progress.is_fully_done || progress.done_coverage === "full") {
    return {
      label: translateStatus("completed"),
      tone: ORDER_TONE.completed,
    };
  }
  if (progress.done_coverage === "partial") {
    return {
      label: translateStatus("in_progress"),
      tone: ORDER_TONE.in_progress,
    };
  }
  return {
    label: translateStatus("initialize"),
    tone: DEFAULT_TONE,
  };
}

function formatProgressMeta(progress: OperatorBoardProgressFields): string {
  return `${progress.pending_detail_count} chờ · ${progress.done_detail_count} xong · SL ${toDisplayInteger(progress.pending_quantity)}`;
}

/** ~60% kích thước card so với bản trước. */
function tierTitleClass(tier: OperatorViewportTier): string {
  if (tier === "tv") return "text-lg";
  if (tier === "narrow") return "text-xs";
  return "text-sm";
}

function tierMinCardHeight(tier: OperatorViewportTier): string {
  if (tier === "tv") return "min-h-[4.75rem]";
  if (tier === "narrow") return "min-h-[3.25rem]";
  return "min-h-[4.25rem]";
}

function LocationBanner({
  locationName,
  tier,
}: {
  locationName: string;
  tier: OperatorViewportTier;
}) {
  return (
    <div className="rounded-xl border border-brand-primary/25 bg-brand-primary/5 px-4 py-3 sm:px-5 sm:py-4">
      <p
        className={cn(
          "font-semibold uppercase tracking-[0.14em] text-slate-400",
          tier === "tv" ? "text-xs" : "text-[11px]",
        )}
      >
        Ô CC — vị trí chia lại
      </p>
      <p
        className={cn(
          "mt-1 font-bold tracking-tight text-brand-primary",
          tier === "tv" ? "text-3xl" : tier === "narrow" ? "text-xl" : "text-2xl",
        )}
      >
        {locationName}
      </p>
    </div>
  );
}

function PickGrid({
  tier,
  children,
}: {
  tier: OperatorViewportTier;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 sm:pr-1",
        operatorPickGridMaxHeightClass(tier),
      )}
    >
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function DrillPickCard({
  active,
  label,
  title,
  subtitle,
  badgeLabel,
  tone = DEFAULT_TONE,
  icon,
  tier,
  drillHint,
  onSelect,
  onDrill,
}: {
  active?: boolean;
  label: string;
  title: string;
  subtitle: string;
  badgeLabel: string;
  tone?: Tone;
  icon: ReactNode;
  tier: OperatorViewportTier;
  drillHint?: string;
  onSelect: () => void;
  onDrill: () => void;
}) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    },
    [],
  );

  /** 1 nhấp = chọn ngay; 2 nhấp nhanh = thêm bước vào trong (ổn trên tablet). */
  const handleClick = useCallback(() => {
    onSelect();
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      onDrill();
      return;
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
    }, 280);
  }, [onSelect, onDrill]);

  return (
    <button
      type="button"
      aria-pressed={active}
      title={drillHint ?? "Nhấp chọn · Nhấp đúp vào trong"}
      onClick={handleClick}
      className={cn(
        "group relative flex w-full touch-manipulation flex-col gap-1 overflow-hidden rounded-lg border px-2 py-1.5 pl-2.5 text-left shadow-stripe-1 transition duration-150",
        tierMinCardHeight(tier),
        active ? SELECTED_SHELL : tone.shell,
        !active && "hover:border-brand-primary/35",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          active ? SELECTED_RAIL : tone.rail,
        )}
        aria-hidden
      />
      <div className="relative z-10 flex items-center justify-between gap-1">
        <span
          className={cn(
            "font-semibold uppercase tracking-[0.12em] text-stripe-ink-mute",
            tier === "tv" ? "text-[10px]" : "text-[9px] sm:text-[10px]",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full border px-1.5 py-px font-bold uppercase tracking-wide",
            tier === "tv" ? "text-[10px]" : "text-[9px]",
            active ? "border-brand-primary/40 bg-brand-primary/25 text-brand-dark" : tone.badge,
          )}
        >
          {badgeLabel}
        </span>
      </div>
      <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2 border-t border-stripe-hairline pt-1">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg border border-stripe-hairline bg-panel-soft",
            tier === "tv" ? "h-9 w-11" : "h-7 w-9",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate font-mono font-extrabold text-brand-dark",
              tierTitleClass(tier),
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "mt-px line-clamp-2 text-stripe-ink-mute",
              tier === "tv" ? "text-sm" : "text-[10px] sm:text-xs",
            )}
          >
            {subtitle}
          </p>
        </div>
        <RightOutlined
          className={cn(
            "shrink-0 text-[10px] text-stripe-ink-mute transition group-hover:text-brand-primary",
            tier === "tv" && "text-sm",
            active && "text-brand-primary",
          )}
        />
      </div>
    </button>
  );
}

function EmptyPickState({
  tier,
  children,
}: {
  tier: OperatorViewportTier;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-slate-500",
        tier === "tv" ? "text-base" : "text-sm",
      )}
    >
      {children}
    </div>
  );
}

export default function ReAssignCcSplitModal({
  open,
  locationCode,
  locationName,
  locationId = null,
  warehouseId,
  onClose,
  onConfirm,
  zIndex,
}: Props) {
  const tier = useOperatorViewportTier();
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const modalWidth = operatorModalWidthForTier(tier, viewportWidth);
  const modalStyles: ModalProps["styles"] = {
    body: {
      maxHeight: OPERATOR_DESKTOP.modal.reAssignCcSplit.bodyMaxHeight,
      overflow: "hidden",
      paddingTop: tier === "narrow" ? 12 : 16,
    },
  };

  const locationLabel =
    locationName.trim() && locationName !== "—"
      ? locationName.trim()
      : "—";
  const [level, setLevel] = useState<DrillLevel>("vehicle");
  const [selectedVehiclePickKey, setSelectedVehiclePickKey] = useState<
    string | null
  >(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState<
    string | null
  >(null);
  const [selectedTripCode, setSelectedTripCode] = useState<string | null>(
    null,
  );

  const boardEnabled = open && warehouseId > 0;

  const ordersQuery = useOperatorBoardOrders(warehouseId, {
    enabled: boardEnabled,
  });
  const orders = ordersQuery.data?.items ?? [];

  const vehicleQueries = useQueries({
    queries: orders.map((order) => ({
      queryKey: operatorBoardVehiclesQueryKey(order.id),
      queryFn: () => listOperatorBoardVehiclesApi(order.id),
      enabled: boardEnabled,
      staleTime: 30 * 1000,
    })),
  });

  const vehiclePicks = useMemo((): VehiclePick[] => {
    const picks: VehiclePick[] = [];
    orders.forEach((order, index) => {
      const items = vehicleQueries[index]?.data?.items ?? [];
      for (const row of items) {
        picks.push({
          key: vehiclePickKey(order.id, row.vehicle_number),
          order_id: order.id,
          order_code: order.order_code,
          vehicle_number: row.vehicle_number,
        });
      }
    });
    return picks.sort((a, b) =>
      displayVehicle(a.vehicle_number).localeCompare(
        displayVehicle(b.vehicle_number),
        "vi",
      ),
    );
  }, [orders, vehicleQueries]);

  const selectedPick = useMemo(() => {
    if (!selectedVehiclePickKey) return null;
    return (
      vehiclePicks.find((p) => p.key === selectedVehiclePickKey) ??
      parseVehiclePickKey(selectedVehiclePickKey)
    );
  }, [selectedVehiclePickKey, vehiclePicks]);

  const selectedOrderId = selectedPick?.order_id ?? null;
  const selectedVehicleNumber = selectedPick?.vehicle_number ?? null;

  const customersQuery = useOperatorBoardCustomers(
    selectedOrderId,
    selectedVehicleNumber,
    boardEnabled &&
      level !== "vehicle" &&
      Boolean(selectedOrderId) &&
      Boolean(selectedVehicleNumber),
  );
  const customers = customersQuery.data?.items ?? [];

  const tripsQuery = useOperatorBoardTrips(
    selectedOrderId,
    selectedVehicleNumber,
    selectedCustomerName,
    boardEnabled &&
      level === "trip" &&
      Boolean(selectedCustomerName),
  );
  const trips = tripsQuery.data?.items ?? [];

  const vehiclesLoading =
    ordersQuery.isLoading || vehicleQueries.some((q) => q.isLoading);
  const vehiclesError =
    ordersQuery.isError || vehicleQueries.some((q) => q.isError);

  useEffect(() => {
    if (!open) {
      setLevel("vehicle");
      setSelectedVehiclePickKey(null);
      setSelectedCustomerName(null);
      setSelectedTripCode(null);
    }
  }, [open]);

  const resetDrill = () => {
    setLevel("vehicle");
    setSelectedVehiclePickKey(null);
    setSelectedCustomerName(null);
    setSelectedTripCode(null);
  };

  const goBack = () => {
    if (level === "trip") {
      setLevel("customer");
      setSelectedTripCode(null);
      return;
    }
    if (level === "customer") {
      setLevel("vehicle");
      setSelectedCustomerName(null);
      setSelectedTripCode(null);
      return;
    }
  };

  /** Vào lớp sâu hơn: bỏ chọn ở lớp con để nút xác nhận chỉ phụ thuộc lớp hiện tại. */
  useEffect(() => {
    if (level === "customer") {
      setSelectedCustomerName(null);
      setSelectedTripCode(null);
    } else if (level === "trip") {
      setSelectedTripCode(null);
    }
  }, [level]);

  const backLabel =
    level === "trip" ? "Khách hàng" : level === "customer" ? "Xe" : null;

  const headerTitle =
    level === "vehicle"
      ? "Chọn xe"
      : level === "customer"
        ? displayVehicle(selectedVehicleNumber ?? "")
        : (selectedCustomerName ?? "Chọn trip");

  const headerSubtitle =
    level === "vehicle"
      ? `${vehiclePicks.length} xe · chọn ít nhất một mức để xác nhận`
      : level === "customer"
        ? `${customers.length} khách hàng`
        : `${trips.length} trip`;

  /** Chỉ lựa chọn ở lớp đang mở mới bật xác nhận (xe / KH / trip). */
  const assignMode: ReAssignCcSplitAssignMode | null = useMemo(() => {
    if (level === "vehicle") {
      return selectedVehiclePickKey ? "vehicle" : null;
    }
    if (level === "customer") {
      return selectedCustomerName?.trim() ? "customer" : null;
    }
    if (level === "trip") {
      return selectedTripCode !== null ? "trip" : null;
    }
    return null;
  }, [level, selectedVehiclePickKey, selectedCustomerName, selectedTripCode]);

  const selectionReady = assignMode !== null;

  const selectionSummary = useMemo(() => {
    if (!assignMode) return "";
    if (assignMode === "vehicle" && selectedVehicleNumber) {
      return `Xe ${displayVehicle(selectedVehicleNumber)} (theo xe)`;
    }
    if (assignMode === "customer" && selectedCustomerName?.trim()) {
      return `KH ${selectedCustomerName.trim()} (theo khách hàng)`;
    }
    if (assignMode === "trip" && selectedTripCode !== null) {
      return `Trip ${displayTrip(selectedTripCode)} (theo trip)`;
    }
    return "";
  }, [
    assignMode,
    selectedVehicleNumber,
    selectedCustomerName,
    selectedTripCode,
  ]);

  const footerHint =
    level === "vehicle"
      ? "chọn một xe để xác nhận (2 nhấp vào KH)"
      : level === "customer"
        ? "chọn một khách hàng để xác nhận (2 nhấp vào trip)"
        : "chọn một trip để xác nhận";

  const handleConfirm = () => {
    if (!selectionReady || !assignMode) {
      message.warning(
        level === "vehicle"
          ? "Chọn một xe ở lớp hiện tại"
          : level === "customer"
            ? "Chọn một khách hàng ở lớp hiện tại"
            : "Chọn một trip ở lớp hiện tại",
      );
      return;
    }
    const payload: ReAssignCcSplitSelection = {
      location_code: locationCode,
      location_name: locationLabel,
      location_id: locationId,
      warehouse_id: warehouseId,
      assign_mode: assignMode,
      vehicle_number:
        assignMode === "vehicle" || selectedVehicleNumber
          ? selectedVehicleNumber
          : null,
      customer_name:
        assignMode === "customer" || assignMode === "trip"
          ? selectedCustomerName?.trim() || null
          : null,
      trip_code: assignMode === "trip" ? selectedTripCode : null,
      outbound_order_id: selectedPick?.order_id ?? selectedOrderId,
      order_code: selectedPick?.order_code?.trim() || null,
    };
    onConfirm?.(payload);
    message.success(
      `Đã chọn chia lại ô ${locationLabel}: ${selectionSummary} (chưa gửi API)`,
    );
    onClose();
  };

  const listBody = () => {
    if (warehouseId <= 0) {
      return (
        <EmptyPickState tier={tier}>
          Vui lòng chọn kho trước khi chia lại.
        </EmptyPickState>
      );
    }
    if (level === "vehicle") {
      if (vehiclesLoading) {
        return (
          <EmptyPickState tier={tier}>Đang tải danh sách xe...</EmptyPickState>
        );
      }
      if (vehiclesError) {
        return (
          <div
            className={cn(
              "rounded-xl border border-error-200 bg-error-50 px-4 py-10 text-center text-error-600",
              tier === "tv" ? "text-base" : "text-sm",
            )}
          >
            Không tải được danh sách xe (operator board). Kiểm tra kho và quyền
            outbound:read.
          </div>
        );
      }
      if (vehiclePicks.length === 0) {
        return (
          <EmptyPickState tier={tier}>
            Không có xe nào còn hàng chưa hoàn tất trong kho
          </EmptyPickState>
        );
      }
      return (
        <PickGrid tier={tier}>
          {vehiclePicks.map((pick, index) => {
            const rowIndex = orders.findIndex((o) => o.id === pick.order_id);
            const vehicleRow =
              vehicleQueries[rowIndex]?.data?.items.find(
                (v) => v.vehicle_number === pick.vehicle_number,
              ) ?? null;
            const badge = vehicleRow
              ? progressStatusBadge(vehicleRow)
              : { label: "Chưa xong", tone: DEFAULT_TONE };
            return (
              <DrillPickCard
                key={pick.key}
                tier={tier}
                active={selectedVehiclePickKey === pick.key}
                label={`Xe ${String(index + 1).padStart(2, "0")}`}
                title={displayVehicle(pick.vehicle_number)}
                subtitle={`Đơn ${pick.order_code} · ${vehicleRow?.customer_count ?? "—"} KH · ${vehicleRow ? formatProgressMeta(vehicleRow) : "—"}`}
                badgeLabel={badge.label}
                tone={badge.tone}
                icon={
                  <TruckDockIcon
                    className={tier === "tv" ? "h-6 w-9" : "h-5 w-7"}
                    color={
                      selectedVehiclePickKey === pick.key
                        ? "#168C87"
                        : "#3AAFA9"
                    }
                  />
                }
                drillHint="Nhấp đúp để chọn khách hàng"
                onSelect={() => setSelectedVehiclePickKey(pick.key)}
                onDrill={() => {
                  setSelectedVehiclePickKey(pick.key);
                  setSelectedCustomerName(null);
                  setSelectedTripCode(null);
                  setLevel("customer");
                }}
              />
            );
          })}
        </PickGrid>
      );
    }

    if (level === "customer" && selectedOrderId && selectedVehicleNumber) {
      if (customersQuery.isLoading) {
        return (
          <EmptyPickState tier={tier}>Đang tải khách hàng...</EmptyPickState>
        );
      }
      if (customersQuery.isError) {
        return (
          <div
            className={cn(
              "rounded-xl border border-error-200 bg-error-50 px-4 py-10 text-center text-error-600",
              tier === "tv" ? "text-base" : "text-sm",
            )}
          >
            Không tải được danh sách khách hàng
          </div>
        );
      }
      if (customers.length === 0) {
        return (
          <EmptyPickState tier={tier}>
            Không có khách hàng trên xe này
          </EmptyPickState>
        );
      }
      return (
        <PickGrid tier={tier}>
          {customers.map((customer, index) => {
            const badge = progressStatusBadge(customer);
            return (
              <DrillPickCard
                key={customer.customer_name}
                tier={tier}
                active={selectedCustomerName === customer.customer_name}
                label={`KH ${String(index + 1).padStart(2, "0")}`}
                title={customer.customer_name}
                subtitle={`${customer.trip_count} trip · ${formatProgressMeta(customer)}`}
                badgeLabel={badge.label}
                tone={badge.tone}
                icon={
                  <UserOutlined
                    className={cn(
                      tier === "tv" ? "text-2xl" : "text-lg",
                      selectedCustomerName === customer.customer_name
                        ? "text-brand-primary"
                        : "text-[#5bb8b8]",
                    )}
                  />
                }
                drillHint="Nhấp đúp để chọn trip"
                onSelect={() => setSelectedCustomerName(customer.customer_name)}
                onDrill={() => {
                  setSelectedCustomerName(customer.customer_name);
                  setSelectedTripCode(null);
                  setLevel("trip");
                }}
              />
            );
          })}
        </PickGrid>
      );
    }

    if (
      level === "trip" &&
      selectedOrderId &&
      selectedVehicleNumber &&
      selectedCustomerName
    ) {
      if (tripsQuery.isLoading) {
        return <EmptyPickState tier={tier}>Đang tải trip...</EmptyPickState>;
      }
      if (tripsQuery.isError) {
        return (
          <div
            className={cn(
              "rounded-xl border border-error-200 bg-error-50 px-4 py-10 text-center text-error-600",
              tier === "tv" ? "text-base" : "text-sm",
            )}
          >
            Không tải được danh sách trip
          </div>
        );
      }
      if (trips.length === 0) {
        return (
          <EmptyPickState tier={tier}>Không có trip nào</EmptyPickState>
        );
      }
      return (
        <PickGrid tier={tier}>
          {trips.map((trip, index) => {
            const tripRaw = trip.trip;
            const badge = progressStatusBadge(trip);
            return (
              <DrillPickCard
                key={operatorBoardTripPathKey(tripRaw)}
                tier={tier}
                active={selectedTripCode === tripRaw}
                label={`Trip ${String(index + 1).padStart(2, "0")}`}
                title={displayTrip(tripRaw)}
                subtitle={formatProgressMeta(trip)}
                badgeLabel={badge.label}
                tone={badge.tone}
                icon={
                  <span
                    className={cn(
                      "font-mono font-bold text-brand-primary",
                      tier === "tv" ? "text-lg" : "text-sm",
                    )}
                  >
                    TR
                  </span>
                }
                drillHint="Trip là lớp cuối — nhấp để chọn"
                onSelect={() => setSelectedTripCode(tripRaw)}
                onDrill={() => setSelectedTripCode(tripRaw)}
              />
            );
          })}
        </PickGrid>
      );
    }

    return null;
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={modalWidth}
      styles={modalStyles}
      className={cn(
        tier === "tv" && "[&_.ant-modal-content]:!p-1",
        "[&_.ant-modal-body]:!px-3 sm:[&_.ant-modal-body]:!px-6",
      )}
      title={
        <span
          className={cn(
            tier === "tv" ? "text-2xl" : tier === "narrow" ? "text-base" : "text-lg",
          )}
        >
          Chia lại hàng ·{" "}
          <span className="font-semibold text-brand-primary">{locationLabel}</span>
        </span>
      }
      zIndex={zIndex}
      destroyOnHidden
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p
            className={cn(
              "text-slate-500",
              tier === "tv" ? "text-sm" : "text-xs",
            )}
          >
            {selectionReady ? (
              <>
                Ô{" "}
                <span className="font-semibold text-brand-primary">
                  {locationLabel}
                </span>
                {" · "}
                <span className="font-semibold text-brand-dark">
                  {selectionSummary}
                </span>
              </>
            ) : (
              <>
                Ô{" "}
                <span className="font-semibold text-brand-primary">
                  {locationLabel}
                </span>
                {" — "}
                {footerHint} (1 nhấp chọn)
              </>
            )}
          </p>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={onClose}
              className={cn(tier === "tv" && "!h-12 !min-w-[120px] !text-base")}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={!selectionReady}
              className={cn(
                "disabled:!cursor-not-allowed disabled:!border-slate-200 disabled:!bg-slate-200 disabled:!text-slate-500 disabled:!opacity-100 disabled:!shadow-none",
                tier === "tv" && "!h-12 !min-w-[160px] !text-base",
              )}
            >
              Xác nhận chia lại
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col gap-3 sm:gap-4">
        <LocationBanner locationName={locationLabel} tier={tier} />

        <div className="flex min-w-0 items-center gap-2">
          {backLabel ? (
            <Button
              variant="secondary"
              icon={<ArrowLeftOutlined />}
              className={cn(
                "shrink-0 !px-2.5",
                tier === "tv" ? "!h-11 !text-base" : "!h-9 !text-sm",
              )}
              onClick={goBack}
            >
              {backLabel}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className={cn(
                "shrink-0 !px-2.5",
                tier === "tv" ? "!h-11 !text-base" : "!h-9 !text-sm",
              )}
              onClick={resetDrill}
              disabled={level === "vehicle" && !selectedVehiclePickKey}
            >
              Làm mới
            </Button>
          )}
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate font-bold text-brand-dark",
                tier === "tv" ? "text-lg" : "text-sm",
              )}
            >
              {headerTitle}
            </p>
            <p
              className={cn(
                "text-slate-500",
                tier === "tv" ? "text-sm" : "text-xs",
              )}
            >
              {headerSubtitle}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1">{listBody()}</div>
      </div>
    </Modal>
  );
}
