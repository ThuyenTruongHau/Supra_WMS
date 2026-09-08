/**
 * Modal gán sorting station — chọn theo xe / KH và gán sorting_position ngay.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { UserOutlined } from "@ant-design/icons";
import { Segmented } from "antd";
import { Button, Modal, cn, message } from "@/components/ui";
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
} from "@/constants/operatorDesktopSizes";
import {
  useAssignSortingPosition,
  useAssignableIncompleteVehicles,
} from "@/hooks/useOutbound";
import type {
  IncompleteVehicle,
  IncompleteVehicleDetail,
} from "@/types/outbound";
import { TruckDockIcon } from "@/components/outbound/iotIcons";
import { outboundStatusLabel } from "@/utils/outboundStatusLabel";

type Props = {
  open: boolean;
  zoneId: number;
  locationCode: string;
  locationId?: number | null;
  onClose: () => void;
  onAssigned?: () => void;
  zIndex?: number;
};

type ViewMode = "vehicle" | "customer";

type CustomerGroup = {
  customer_name: string;
  detail_count: number;
  vehicle_count: number;
  vehicles: string[];
  statuses: string[];
  details: IncompleteVehicleDetail[];
};

function LocationBanner({ locationCode }: { locationCode: string }) {
  return (
    <div className="rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Ô sorting / outbound station
      </p>
      <p className="mt-1 font-mono text-lg font-bold text-brand-dark">
        {locationCode}
      </p>
    </div>
  );
}

function ChoiceRow({
  active,
  onDoubleClick,
  disabled,
  icon,
  title,
  subtitle,
  meta,
}: {
  active?: boolean;
  onDoubleClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  meta: string;
}) {
  return (
    <button
      type="button"
      onDoubleClick={onDoubleClick}
      disabled={disabled}
      className={cn(
        "group w-full select-none rounded-xl border px-4 py-3.5 text-left transition-all duration-150",
        "shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
        disabled && "cursor-wait opacity-60",
        active
          ? "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary/30"
          : "border-slate-200 bg-white hover:border-brand-primary/50 hover:bg-slate-50/80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 inline-flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border transition",
              active
                ? "border-brand-primary/30 bg-brand-primary/10"
                : "border-brand-primary/15 bg-brand-primary/5 group-hover:border-brand-primary/25 group-hover:bg-brand-primary/10",
            )}
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate font-mono text-base font-bold",
                active ? "text-brand-dark" : "text-slate-800",
              )}
            >
              {title}
            </p>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              {meta}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition",
            active
              ? "border-brand-primary bg-brand-primary"
              : "border-slate-300 bg-white group-hover:border-brand-primary/60",
          )}
        />
      </div>
    </button>
  );
}

function buildCustomerGroups(vehicles: IncompleteVehicle[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>();
  for (const vehicle of vehicles) {
    for (const detail of vehicle.details) {
      const name = detail.customer_name.trim();
      if (!name) continue;
      const existing = map.get(name);
      if (!existing) {
        map.set(name, {
          customer_name: name,
          detail_count: 1,
          vehicle_count: 1,
          vehicles: [detail.vehicle_number],
          statuses: [detail.status],
          details: [detail],
        });
        continue;
      }
      existing.detail_count += 1;
      existing.details.push(detail);
      if (!existing.vehicles.includes(detail.vehicle_number)) {
        existing.vehicles.push(detail.vehicle_number);
        existing.vehicle_count += 1;
      }
      if (!existing.statuses.includes(detail.status)) {
        existing.statuses.push(detail.status);
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    a.customer_name.localeCompare(b.customer_name, "vi"),
  );
}

export default function AssignSortingStationModal({
  open,
  zoneId,
  locationCode,
  onClose,
  onAssigned,
  zIndex,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("vehicle");
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const vehiclesQuery = useAssignableIncompleteVehicles(zoneId, {
    enabled: open,
  });
  const assignMutation = useAssignSortingPosition();
  const allVehicles = vehiclesQuery.data?.vehicles ?? [];

  // Tab xe: chỉ xe chưa bắt đầu chia (gán 1 phần / full → ẩn)
  const vehicles = useMemo(
    () =>
      allVehicles.filter((vehicle) => {
        const coverage = (vehicle.assign_coverage || "none").toLowerCase();
        return coverage === "none";
      }),
    [allVehicles],
  );

  // Tab KH: mọi KH còn detail chưa gán (kể cả trên xe đang gán 1 phần)
  const customers = useMemo(
    () => buildCustomerGroups(allVehicles),
    [allVehicles],
  );
  const assigning = assignMutation.isPending;

  useEffect(() => {
    if (!open) {
      setViewMode("vehicle");
      setPendingKey(null);
    }
  }, [open]);

  const handleViewModeChange = (value: ViewMode) => {
    if (assigning) return;
    setViewMode(value);
    setPendingKey(null);
  };

  const assignParty = (mode: ViewMode, key: string) => {
    setPendingKey(key);
    assignMutation.mutate(
      {
        zone_id: zoneId,
        sorting_position: locationCode,
        mode,
        vehicle_number: mode === "vehicle" ? key : null,
        customer_name: mode === "customer" ? key : null,
      },
      {
        onSuccess: (result) => {
          message.success(
            `Đã gán vị trí ${locationCode} cho ${result.updated_count} nhóm detail (đang chia chọn)`,
          );
          onAssigned?.();
          onClose();
        },
        onError: (err) => {
          message.error(
            err.response?.data?.detail ??
              "Không gán được sorting position cho detail",
          );
          setPendingKey(null);
        },
      },
    );
  };

  const listEmpty =
    viewMode === "vehicle" ? vehicles.length === 0 : customers.length === 0;
  const emptyLabel =
    viewMode === "vehicle"
      ? "Không còn xe chưa chia (xe gán 1 phần / đã chia sẽ không hiện ở tab này)"
      : "Không còn khách hàng nào chưa gán sorting position";

  return (
    <Modal
      open={open}
      onCancel={assigning ? undefined : onClose}
      title="Gán vị trí chia chọn"
      width={OPERATOR_DESKTOP.modal.md}
      zIndex={zIndex}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={assigning}>
            Đóng
          </Button>
        </div>
      }
      destroyOnClose
    >
      <div className="space-y-4">
        <LocationBanner locationCode={locationCode} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-brand-dark">
              {viewMode === "vehicle" ? "Chọn theo xe" : "Chọn theo khách hàng"}
            </h4>
            <p className="mt-1 text-xs text-slate-500">
              Double-click để gán ngay sorting position = {locationCode} và đặt
              status đang chia chọn.
            </p>
          </div>
          <Segmented
            value={viewMode}
            disabled={assigning}
            onChange={(value) => handleViewModeChange(value as ViewMode)}
            options={[
              { label: "Theo xe", value: "vehicle" },
              { label: "Theo khách hàng", value: "customer" },
            ]}
          />
        </div>

        {vehiclesQuery.isLoading ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            Đang tải danh sách...
          </div>
        ) : vehiclesQuery.isError ? (
          <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-10 text-center text-sm text-error-600">
            Không tải được danh sách chưa hoàn tất
          </div>
        ) : listEmpty ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            {emptyLabel}
          </div>
        ) : viewMode === "vehicle" ? (
          <div
            className={`${operatorDesktopClass.listMax420} space-y-2.5 overflow-y-auto pr-1`}
          >
            {vehicles.map((vehicle) => (
              <ChoiceRow
                key={vehicle.vehicle_number}
                active={pendingKey === vehicle.vehicle_number}
                disabled={assigning}
                onDoubleClick={() =>
                  assignParty("vehicle", vehicle.vehicle_number)
                }
                icon={
                  <TruckDockIcon
                    className="h-6 w-10"
                    color={
                      pendingKey === vehicle.vehicle_number
                        ? "#168C87"
                        : "#3AAFA9"
                    }
                  />
                }
                title={vehicle.vehicle_number}
                subtitle={`${vehicle.customer_count} khách hàng · ${vehicle.detail_count} nhóm detail`}
                meta={`Trạng thái: ${vehicle.statuses.map(outboundStatusLabel).join(" / ") || outboundStatusLabel("pending")}${
                  vehicle.sorting_positions?.length
                    ? ` · Pos: ${vehicle.sorting_positions.join(", ")}`
                    : ""
                }`}
              />
            ))}
          </div>
        ) : (
          <div
            className={`${operatorDesktopClass.listMax420} space-y-2.5 overflow-y-auto pr-1`}
          >
            {customers.map((customer) => (
              <ChoiceRow
                key={customer.customer_name}
                active={pendingKey === customer.customer_name}
                disabled={assigning}
                onDoubleClick={() =>
                  assignParty("customer", customer.customer_name)
                }
                icon={
                  <UserOutlined
                    className={cn(
                      "text-lg",
                      pendingKey === customer.customer_name
                        ? "text-brand-primary"
                        : "text-[#5bb8b8]",
                    )}
                  />
                }
                title={customer.customer_name}
                subtitle={`${customer.vehicle_count} xe · ${customer.detail_count} nhóm detail`}
                meta={`Xe: ${customer.vehicles.join(", ")} · ${customer.statuses.map(outboundStatusLabel).join(" / ") || outboundStatusLabel("pending")}`}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
