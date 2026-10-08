/**
 * Modal xem hàng đã chia vào ô CC (đọc từ cache Masan assigned_cc_location).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CarOutlined,
  InboxOutlined,
  PartitionOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { ModalProps } from "antd";
import { Button, Modal, Table, cn } from "@/components/ui";
import ReAssignCcSplitModal, {
  type ReAssignCcSplitSelection,
} from "@/components/outbound/ReAssignCcSplitModal";
import { OPERATOR_DESKTOP } from "@/constants/operatorDesktopSizes";
import {
  operatorModalWidthForTier,
  useOperatorViewportTier,
  type OperatorViewportTier,
} from "@/utils/operatorViewportTier";
import type {
  MasanCcLocationLine,
  MasanCcLocationResponse,
} from "@/types/masan";
import OutboundStatusTag from "@/components/shared/OutboundStatusTag";
import { toDisplayInteger } from "@/utils/number";

type Props = {
  open: boolean;
  /** Mã nội bộ — không hiển thị UI; dùng khi gọi API sau này. */
  locationCode: string | null;
  /** Nhãn ô CC (location_name). */
  locationName?: string | null;
  locationId?: number | null;
  warehouseId?: number;
  data: MasanCcLocationResponse | null;
  loading?: boolean;
  onClose: () => void;
  zIndex?: number;
};

type ViewportTier = OperatorViewportTier;

const textOrDash = (value: string | number | null | undefined) =>
  value != null && String(value).trim() !== "" ? String(value) : "—";

const displaySku = (row: MasanCcLocationLine) => {
  if (row.sku != null && String(row.sku).trim() !== "") {
    return String(row.sku);
  }
  if (row.item_id) {
    return `#${row.item_id}`;
  }
  return null;
};

function SummaryTile({
  label,
  value,
  icon,
  tier,
  className,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tier: ViewportTier;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-start gap-3 rounded-xl border border-stripe-hairline bg-panel-soft px-3 py-2.5 sm:px-4 sm:py-3",
        className,
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary",
          tier === "tv" ? "h-12 w-12 text-2xl" : "h-10 w-10 text-lg",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "font-semibold uppercase tracking-[0.12em] text-slate-400",
            tier === "tv" ? "text-xs" : "text-[11px]",
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "mt-0.5 truncate font-bold text-brand-dark",
            tier === "narrow" ? "text-sm" : tier === "tv" ? "text-xl" : "text-base",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export default function CcLocationLinesModal({
  open,
  locationCode,
  locationName = null,
  locationId = null,
  warehouseId = 0,
  data,
  loading = false,
  onClose,
  zIndex,
}: Props) {
  const [reAssignOpen, setReAssignOpen] = useState(false);
  const tier = useOperatorViewportTier();

  useEffect(() => {
    if (!open) setReAssignOpen(false);
  }, [open]);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  }));

  useEffect(() => {
    const onResize = () =>
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const lines = data?.lines ?? [];
  const assigned = Boolean(data?.assigned && lines.length > 0);

  const displayLocationName = useMemo(() => {
    const name =
      locationName?.trim() || data?.location_name?.trim() || "";
    return name || "—";
  }, [locationName, data?.location_name]);

  const totalQuantity = useMemo(
    () => lines.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
    [lines],
  );

  const modalWidth = operatorModalWidthForTier(tier, viewportSize.width);
  const tableScrollY = useMemo(() => {
    const fallback =
      OPERATOR_DESKTOP.modal.ccLocationLines.tableScrollY[tier];
    const chromeReserve =
      tier === "tv" ? 420 : tier === "narrow" ? 360 : 400;
    return Math.max(160, Math.min(fallback, viewportSize.height - chromeReserve));
  }, [tier, viewportSize.height]);
  const tableSize: "small" | "middle" | "large" =
    tier === "narrow" ? "small" : tier === "tv" ? "large" : "middle";

  const cellBase =
    tier === "tv"
      ? "text-lg"
      : tier === "wide"
        ? "text-base"
        : tier === "medium"
          ? "text-sm"
          : "text-sm";
  const qtyCell =
    tier === "tv"
      ? "text-2xl font-black"
      : tier === "wide"
        ? "text-xl font-bold"
        : "text-base font-bold";

  const columns: ColumnsType<MasanCcLocationLine> = useMemo(() => {
    const cols: ColumnsType<MasanCcLocationLine> = [
      {
        title: "STT",
        width: tier === "tv" ? 72 : 56,
        align: "center",
        fixed: tier === "narrow" ? "left" : undefined,
        render: (_v, _r, index) => (
          <span className={cn("font-semibold tabular-nums text-slate-500", cellBase)}>
            {index + 1}
          </span>
        ),
      },
      {
        title: "SKU / mã hàng",
        dataIndex: "sku",
        width: tier === "tv" ? 180 : 150,
        fixed: tier === "narrow" ? "left" : undefined,
        render: (_v, row) => (
          <span className={cn("font-mono font-semibold text-brand-dark", cellBase)}>
            {textOrDash(displaySku(row))}
          </span>
        ),
      },
      {
        title: "Khách hàng",
        dataIndex: "customer_name",
        ellipsis: true,
        width: tier === "tv" ? 220 : 180,
        render: (v) => (
          <span className={cn("font-medium text-slate-800", cellBase)}>
            {textOrDash(v)}
          </span>
        ),
      },
      {
        title: "Biển số",
        dataIndex: "vehicle_no",
        width: tier === "tv" ? 140 : 120,
        render: (v) => (
          <span className={cn("font-mono text-slate-700", cellBase)}>
            {textOrDash(v)}
          </span>
        ),
      },
    ];

    if (tier !== "narrow") {
      cols.push(
        {
          title: "Chuyến",
          dataIndex: "trip",
          width: tier === "tv" ? 120 : 100,
          render: (v) => <span className={cellBase}>{textOrDash(v)}</span>,
        },
        {
          title: "NVT",
          dataIndex: "nvt",
          width: tier === "tv" ? 120 : 100,
          render: (v) => <span className={cellBase}>{textOrDash(v)}</span>,
        },
      );
    }

    cols.push(
      {
        title: "Số lô",
        dataIndex: "lot_number",
        width: tier === "tv" ? 160 : 130,
        render: (v) => (
          <span className={cn("font-mono text-slate-600", cellBase)}>
            {textOrDash(v)}
          </span>
        ),
      },
      {
        title: "Số lượng",
        dataIndex: "quantity",
        width: tier === "tv" ? 120 : 100,
        align: "right",
        render: (v: number) => (
          <span className={cn("tabular-nums text-brand-primary", qtyCell)}>
            {toDisplayInteger(v)}
          </span>
        ),
      },
      {
        title: "ĐVT",
        dataIndex: "unit",
        width: tier === "tv" ? 88 : 72,
        align: "center",
        render: (v) => <span className={cellBase}>{textOrDash(v)}</span>,
      },
      {
        title: "Pallet",
        dataIndex: "pallet_count",
        width: tier === "tv" ? 100 : 88,
        align: "right",
        render: (v) => <span className={cellBase}>{textOrDash(v)}</span>,
      },
      {
        title: "Trạng thái",
        dataIndex: "status",
        width: tier === "tv" ? 140 : 120,
        align: "center",
        render: (status: string | null | undefined) => (
          <OutboundStatusTag
            status={status?.trim() || "initialize"}
            className={cellBase}
          />
        ),
      },
    );

    return cols;
  }, [tier, cellBase, qtyCell]);

  const tableClassName = cn(
    "[&_.ant-table-thead>tr>th]:!bg-slate-50 [&_.ant-table-thead>tr>th]:!font-bold [&_.ant-table-thead>tr>th]:!uppercase [&_.ant-table-thead>tr>th]:!tracking-wide",
    tier === "tv"
      ? "[&_.ant-table-thead>tr>th]:!py-4 [&_.ant-table-thead>tr>th]:!text-sm [&_.ant-table-tbody>tr>td]:!py-4"
      : tier === "wide"
        ? "[&_.ant-table-thead>tr>th]:!py-3 [&_.ant-table-thead>tr>th]:!text-xs [&_.ant-table-tbody>tr>td]:!py-3"
        : "[&_.ant-table-thead>tr>th]:!py-2.5 [&_.ant-table-thead>tr>th]:!text-[11px] [&_.ant-table-tbody>tr>td]:!py-2.5",
    "[&_.ant-table-tbody>tr:hover>td]:!bg-brand-primary/[0.04]",
    "[&_.ant-table-body]:!overflow-y-auto [&_.ant-table-body]:overscroll-contain [&_.ant-table-body]:touch-pan-y",
  );

  const handleReAssignConfirm = (selection: ReAssignCcSplitSelection) => {
    // TODO: gọi API re_assign_cc_zone khi backend sẵn sàng
    console.info("[ReAssignCcSplit] pending API", selection);
  };

  const reAssignZIndex = zIndex != null ? zIndex + 10 : undefined;

  const modalStyles: ModalProps["styles"] = {
    body: {
      maxHeight: OPERATOR_DESKTOP.modal.ccLocationLines.bodyMaxHeight,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      paddingTop: tier === "narrow" ? 12 : 16,
    },
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={modalWidth}
      styles={modalStyles}
      getContainer={() => document.body}
      className={cn(
        tier === "tv" && "[&_.ant-modal-content]:!p-1",
        "[&_.ant-modal-body]:!flex [&_.ant-modal-body]:!min-h-0 [&_.ant-modal-body]:!flex-col",
        "[&_.ant-modal-body]:!px-3 sm:[&_.ant-modal-body]:!px-6",
      )}
      destroyOnHidden
      zIndex={zIndex}
      title={
        <div className="flex items-start justify-between gap-3 pr-6 sm:pr-10">
          <div className="min-w-0">
            <p
              className={cn(
                "font-black text-brand-dark",
                tier === "tv"
                  ? "text-3xl"
                  : tier === "wide"
                    ? "text-2xl"
                    : tier === "narrow"
                      ? "text-lg"
                      : "text-xl",
              )}
            >
              Chi tiết hàng đã chia
            </p>
            <p
              className={cn(
                "mt-1 font-normal text-slate-500",
                tier === "tv" ? "text-lg" : tier === "narrow" ? "text-xs" : "text-sm",
              )}
            >
              Ô vị trí{" "}
              <span className="font-semibold text-brand-primary">
                {displayLocationName}
              </span>
            </p>
          </div>
          <Button
            variant="primary"
            className={cn(
              "shrink-0",
              tier === "tv" ? "!h-12 !text-base" : tier === "narrow" && "!h-9 !text-sm",
            )}
            onClick={() => setReAssignOpen(true)}
          >
            Chia lại
          </Button>
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 px-0 sm:px-1">
          {assigned ? (
            <p
              className={cn(
                "text-slate-600",
                tier === "tv" ? "text-lg" : tier === "narrow" ? "text-xs" : "text-sm",
              )}
            >
              <span className="font-semibold text-brand-dark">
                {lines.length}
              </span>{" "}
              dòng · Tổng SL{" "}
              <span className="font-bold tabular-nums text-brand-primary">
                {toDisplayInteger(totalQuantity)}
              </span>
            </p>
          ) : (
            <span />
          )}
          <Button
            variant="secondary"
            onClick={onClose}
            className={cn(
              tier === "tv" ? "!h-12 !min-w-[140px] !text-lg" : "!min-w-[120px]",
              tier === "narrow" && "!h-9 !text-sm",
            )}
          >
            Đóng
          </Button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 sm:gap-4">
        <div
          className={cn(
            "grid gap-2 sm:gap-3",
            tier === "narrow"
              ? "grid-cols-1"
              : tier === "medium"
                ? "grid-cols-2"
                : "grid-cols-2 lg:grid-cols-4",
          )}
        >
          <SummaryTile
            label="Vị trí ô CC"
            value={displayLocationName}
            icon={<PartitionOutlined />}
            tier={tier}
          />
          <SummaryTile
            label="Khu CC (zone)"
            value={textOrDash(data?.zone)}
            icon={<InboxOutlined />}
            tier={tier}
          />
          <SummaryTile
            label="Xe được gán"
            value={textOrDash(data?.vehicle_number)}
            icon={<CarOutlined />}
            tier={tier}
          />
          <SummaryTile
            label="Số dòng hàng"
            value={
              loading
                ? "…"
                : assigned
                  ? toDisplayInteger(lines.length)
                  : "0"
            }
            icon={<InboxOutlined />}
            tier={tier}
          />
        </div>

        {!loading && !assigned ? (
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-10 text-center sm:px-6 sm:py-14",
            )}
          >
            <InboxOutlined
              className={cn(
                "mb-3 text-slate-300",
                tier === "tv" ? "text-5xl" : "text-4xl",
              )}
            />
            <p
              className={cn(
                "font-semibold text-slate-600",
                tier === "tv" ? "text-xl" : "text-base",
              )}
            >
              Chưa có hàng được chia vào ô này
            </p>
            <p
              className={cn(
                "mt-1 max-w-md text-slate-400",
                tier === "tv" ? "text-base" : "text-sm",
              )}
            >
              Hệ thống sẽ tự gán khi có đơn xuất và ô CC trống. Vui lòng thử lại
              sau vài giây hoặc kiểm tra job assign.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-stripe-hairline bg-white">
            <Table<MasanCcLocationLine>
              dataSource={lines}
              columns={columns}
              rowKey="detail_id"
              loading={loading}
              pagination={false}
              scroll={{
                x: tier === "narrow" ? 720 : tier === "tv" ? 1400 : 1200,
                y: tableScrollY,
              }}
              size={tableSize}
              bordered
              className={tableClassName}
            />
          </div>
        )}
      </div>

      <ReAssignCcSplitModal
        open={reAssignOpen}
        locationCode={locationCode ?? ""}
        locationName={displayLocationName}
        locationId={locationId}
        warehouseId={warehouseId}
        onClose={() => setReAssignOpen(false)}
        onConfirm={handleReAssignConfirm}
        zIndex={reAssignZIndex}
      />
    </Modal>
  );
}
