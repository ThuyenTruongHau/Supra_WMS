/**
 * Xác nhận số lượng lấy hàng — slider theo allocation.
 * Tab xuất: click VT (lọc theo đích VT). Monitor: chọn VT rồi click CC (lọc CC + VT).
 */
import { useEffect, useMemo, useState } from "react";
import { Slider } from "antd";
import { Button, Modal, message } from "@/components/ui";
import { masanConfirmAllocationOutboundApi } from "@/api/masan";
import type { MasanPendingAllocationWithCc } from "@/types/masan";
import { getApiErrorDetail } from "@/types/apiError";
import {
  allocationMatchesVtDestination,
  ccLabelForPendingRow,
  isConfirmablePendingStockAllocation,
} from "@/utils/masanPendingStockOverlay";
import { toDisplayInteger } from "@/utils/number";
import {
  operatorModalActionButtonClass,
  operatorModalWidthForTier,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";
import { useOutboundOperatorAssignees } from "@/store/useOperatorAssigneeStore";
import { formatOperatorSortingPersons } from "@/utils/operatorSortingPersons";

type Props = {
  open: boolean;
  onClose: () => void;
  warehouseId: number;
  /** Khu chia chọn (8/9) — lấy người xuất từ store operator. */
  displayZoneId: number;
  ccBucketZoneCode: string;
  /** Có giá trị thì chỉ giữ allocation `to_location_id` = VT này. */
  vtLocationId?: number | null;
  vtLocationCode?: string | null;
  vtLocationName?: string | null;
  /** Monitor: ô CC đang xác nhận (hiển thị cùng `locationKindLabel`). */
  ccLocationCode?: string | null;
  ccLocationName?: string | null;
  secondaryLocationKindLabel?: string | null;
  title?: string;
  locationKindLabel?: string;
  emptyHint?: string;
  lines: MasanPendingAllocationWithCc[];
  onConfirmed?: () => void;
  zIndex?: number;
};

export default function MasanVtPendingStockConfirmModal({
  open,
  onClose,
  warehouseId,
  displayZoneId,
  ccBucketZoneCode,
  vtLocationId = null,
  vtLocationCode = null,
  vtLocationName = null,
  ccLocationCode = null,
  ccLocationName = null,
  secondaryLocationKindLabel = null,
  title = "Xác nhận lấy hàng tại VT",
  locationKindLabel = "Vị trí VT",
  emptyHint = "Không còn hàng chờ xác nhận tại VT này.",
  lines,
  onConfirmed,
  zIndex,
}: Props) {
  const { usernames: outboundAssignees } =
    useOutboundOperatorAssignees(displayZoneId);
  const tier = useOperatorViewportTier();
  const [viewportWidth, setViewportWidth] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth : 1280),
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const modalWidth = operatorModalWidthForTier(tier, viewportWidth);
  const modalActionBtn = operatorModalActionButtonClass(tier);

  const [qtyByAllocationId, setQtyByAllocationId] = useState<
    Record<number, number>
  >({});
  const [submitting, setSubmitting] = useState(false);

  const confirmLines = useMemo(
    () =>
      lines.filter((row) => {
        if (!isConfirmablePendingStockAllocation(row)) return false;
        if (vtLocationId != null) {
          return allocationMatchesVtDestination(row, vtLocationId);
        }
        return true;
      }),
    [lines, vtLocationId],
  );

  useEffect(() => {
    if (!open) {
      setQtyByAllocationId({});
      return;
    }
    const initial: Record<number, number> = {};
    for (const row of confirmLines) {
      initial[row.id] = Math.round(Number(row.quantity || 0));
    }
    setQtyByAllocationId(initial);
  }, [open, confirmLines]);

  const primaryLocationLabel =
    (ccLocationName ?? "").trim() ||
    (ccLocationCode ?? "").trim() ||
    (vtLocationName ?? "").trim() ||
    (vtLocationCode ?? "").trim() ||
    (vtLocationId != null ? `#${vtLocationId}` : "");

  const secondaryLocationLabel =
    (ccLocationCode ?? "").trim() || (ccLocationName ?? "").trim()
      ? (vtLocationName ?? "").trim() ||
        (vtLocationCode ?? "").trim() ||
        (vtLocationId != null ? `#${vtLocationId}` : "")
      : "";

  const handleConfirmAll = async () => {
    if (warehouseId <= 0 || !ccBucketZoneCode.trim()) {
      message.error("Thiếu thông tin xác nhận");
      return;
    }
    const quantities: Record<number, number> = {};
    for (const row of confirmLines) {
      const maxQty = Math.round(Number(row.quantity || 0));
      const qty = Math.round(qtyByAllocationId[row.id] ?? 0);
      if (qty <= 0) continue;
      if (qty > maxQty) {
        message.warning(
          `Allocation #${row.id}: số lượng tối đa ${toDisplayInteger(maxQty)}`,
        );
        return;
      }
      quantities[row.id] = qty;
    }
    if (Object.keys(quantities).length === 0) {
      message.warning("Chọn số lượng > 0 cho ít nhất một dòng");
      return;
    }

    const sortingPersons = formatOperatorSortingPersons(outboundAssignees);
    if (!sortingPersons) {
      message.warning(
        "Chọn người xuất trên thanh công cụ (Monitor) trước khi xác nhận",
      );
      return;
    }

    setSubmitting(true);
    try {
      await masanConfirmAllocationOutboundApi({
        warehouse_id: warehouseId,
        zone: ccBucketZoneCode.trim(),
        quantities,
        sorting_persons: sortingPersons,
      });
      message.success("Đã xác nhận lấy hàng");
      onConfirmed?.();
      onClose();
    } catch (err: unknown) {
      message.error(getApiErrorDetail(err, "Không xác nhận được lấy hàng"));
    } finally {
      setSubmitting(false);
    }
  };

  const sortedLines = useMemo(
    () =>
      [...confirmLines].sort((a, b) =>
        ccLabelForPendingRow(a).localeCompare(
          ccLabelForPendingRow(b),
          undefined,
          { numeric: true },
        ),
      ),
    [confirmLines],
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      width={modalWidth}
      centered
      destroyOnHidden
      zIndex={zIndex}
      footer={null}
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700/70">
            {locationKindLabel}
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-brand-dark">
            {primaryLocationLabel}
          </p>
        </div>

        {secondaryLocationKindLabel && secondaryLocationLabel ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-5 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700/70">
              {secondaryLocationKindLabel}
            </p>
            <p className="mt-1 font-mono text-xl font-bold text-brand-dark">
              {secondaryLocationLabel}
            </p>
          </div>
        ) : null}

        {sortedLines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-base text-slate-400">
            {emptyHint}
          </p>
        ) : (
          <ul className="space-y-4">
            {sortedLines.map((row) => {
              const maxQty = Math.round(Number(row.quantity || 0));
              const picked = qtyByAllocationId[row.id] ?? maxQty;
              const sku =
                row.sku != null && String(row.sku).trim()
                  ? String(row.sku).trim()
                  : `#${row.item_stock_id}`;
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-slate-200 px-4 py-4"
                >
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-400">
                        Vị trí lấy hàng
                      </p>
                      <p className="font-mono text-lg font-bold text-brand-dark">
                        {ccLabelForPendingRow(row)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">SKU</p>
                      <p className="font-mono font-semibold text-slate-800">
                        {sku}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Allocation #{row.id}
                      </p>
                    </div>
                  </div>
                  {maxQty > 0 ? (
                    <div className="flex items-center gap-4">
                      <Slider
                        className="!m-0 flex-1"
                        min={0}
                        max={maxQty}
                        step={1}
                        value={picked}
                        onChange={(v) =>
                          setQtyByAllocationId((prev) => ({
                            ...prev,
                            [row.id]: v,
                          }))
                        }
                        tooltip={{ formatter: (v) => `${v ?? 0}` }}
                      />
                      <span className="w-16 shrink-0 text-right font-mono text-xl font-bold tabular-nums text-brand-primary">
                        {toDisplayInteger(picked)}
                      </span>
                    </div>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    Tối đa: {toDisplayInteger(maxQty)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-4">
          <Button
            variant="secondary"
            onClick={onClose}
            className={modalActionBtn}
          >
            Hủy
          </Button>
          <Button
            variant="primary"
            loading={submitting}
            onClick={() => void handleConfirmAll()}
            disabled={sortedLines.length === 0}
            className={modalActionBtn}
          >
            Xác nhận tất cả
          </Button>
        </div>
      </div>
    </Modal>
  );
}
