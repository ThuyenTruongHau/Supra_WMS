/**
 * Modal hiển thị hàng cần lấy của xe khi click ô sorting đã gán.
 */
import { useMemo } from "react";
import type { ColumnsType } from "antd/es/table";
import { Button, Modal, Table } from "@/components/ui";
import { useOutboundVehicleProducts } from "@/hooks/useOutbound";
import type {
  OutboundVehicleProductLine,
  SortingStationAssignment,
} from "@/types/outbound";
import { outboundStatusLabel } from "@/utils/outboundStatusLabel";
import { toDisplayInteger } from "@/utils/number";

type Props = {
  open: boolean;
  assignment: SortingStationAssignment | null;
  onClose: () => void;
  onManageAssignment?: () => void;
  zIndex?: number;
};

function resolveVehicleNumber(
  assignment: SortingStationAssignment | null,
): string | null {
  const details = assignment?.details ?? [];
  const plates = [
    ...new Set(
      details
        .map((d) => (d.vehicle_number || "").trim())
        .filter((plate) => plate.length > 0),
    ),
  ].sort((a, b) => a.localeCompare(b, "vi"));
  if (plates.length === 0) return null;
  return plates[0];
}

export default function SortingStationProductsModal({
  open,
  assignment,
  onClose,
  onManageAssignment,
  zIndex,
}: Props) {
  const zoneId = assignment?.zone_id ?? 0;
  const locationCode = assignment?.location_code ?? "—";
  const displayLabel = assignment?.display_label?.trim() || null;
  const vehicleNumber = resolveVehicleNumber(assignment);

  const {
    data: productsData,
    isLoading,
    isError,
  } = useOutboundVehicleProducts(
    zoneId,
    vehicleNumber,
    open && zoneId > 0 && Boolean(vehicleNumber),
  );
  const products = productsData?.products ?? [];

  const columns: ColumnsType<OutboundVehicleProductLine> = useMemo(
    () => [
      {
        title: "Khách hàng",
        dataIndex: "customer_name",
        key: "customer_name",
        width: 160,
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
        render: (_: unknown, row: OutboundVehicleProductLine) => (
          <div className="min-w-0 py-0.5">
            <p className="truncate font-mono text-sm font-semibold text-brand-dark">
              {row.product_sku?.trim() || `P${row.product_id}`}
            </p>
            <p className="truncate text-sm text-slate-500">
              {row.product_name?.trim() || "—"}
            </p>
          </div>
        ),
      },
      {
        title: "SL",
        dataIndex: "total_quantity",
        key: "total_quantity",
        width: 96,
        align: "right",
        render: (qty: number) => (
          <span className="text-base tabular-nums font-bold text-brand-dark">
            {toDisplayInteger(qty)}
          </span>
        ),
      },
      {
        title: "Trạng thái",
        key: "statuses",
        width: 140,
        render: (_: unknown, row: OutboundVehicleProductLine) => (
          <span className="text-sm font-medium leading-snug text-slate-600">
            {row.statuses?.length
              ? row.statuses.map(outboundStatusLabel).join(" / ")
              : "—"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Hàng cần lấy"
      width="min(1200px, 92vw)"
      centered
      destroyOnClose
      zIndex={zIndex}
      styles={{
        body: {
          maxHeight: "calc(100vh - 180px)",
          overflow: "hidden",
        },
      }}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {onManageAssignment ? (
            <Button variant="secondary" onClick={onManageAssignment}>
              Quản lý gán ô
            </Button>
          ) : null}
          <Button variant="primary" onClick={onClose}>
            Đóng
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-col gap-5">
        <div className="shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700/70">
            Ô sorting
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-brand-dark">
            {locationCode}
          </p>
          {displayLabel ? (
            <p className="mt-2 text-base text-slate-600">
              Đang gán:{" "}
              <span className="font-semibold text-brand-dark">{displayLabel}</span>
            </p>
          ) : null}
          {vehicleNumber ? (
            <p className="mt-1 font-mono text-base text-slate-600">
              Xe:{" "}
              <span className="text-lg font-semibold text-brand-dark">
                {vehicleNumber}
              </span>
            </p>
          ) : null}
        </div>

        {!vehicleNumber ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-base text-slate-400">
            Không xác định được biển số xe trên ô này.
          </p>
        ) : isLoading ? (
          <div className="flex min-h-[360px] items-center justify-center text-base text-slate-500">
            Đang tải hàng hóa...
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-12 text-center text-base text-error-700">
            Không tải được danh sách hàng cần lấy.
          </div>
        ) : (
          <div className="min-h-[360px] max-h-[min(68vh,760px)] overflow-auto rounded-xl border border-slate-200 bg-white">
            <Table<OutboundVehicleProductLine>
              rowKey={(row) => `${row.customer_name}-${row.product_id}`}
              pagination={false}
              columns={columns}
              dataSource={products}
              tableLayout="fixed"
              locale={{
                emptyText: "Không còn hàng chưa hoàn tất cho xe này",
              }}
              className="min-w-0 [&_.ant-table-tbody>tr>td]:!py-3.5 [&_.ant-table-tbody_td]:align-middle [&_.ant-table-thead>tr>th]:!bg-slate-50 [&_.ant-table-thead>tr>th]:!py-3 [&_.ant-table-thead>tr>th]:!text-sm [&_.ant-table-thead>tr>th]:!font-semibold"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
