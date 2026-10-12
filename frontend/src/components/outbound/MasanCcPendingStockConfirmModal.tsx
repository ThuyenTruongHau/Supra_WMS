/**
 * Xác nhận số lượng lấy hàng tại VT — nhiều dòng theo ô CC (allocation / stock_ready).
 */
import { useEffect, useMemo, useState } from "react";
import { Slider } from "antd";
import { Button, Modal, message } from "@/components/ui";
import { masanConfirmAllocationOutboundApi } from "@/api/masan";
import type { MasanPendingAllocationWithCc } from "@/types/masan";
import { getApiErrorDetail } from "@/types/apiError";
import { ccLabelForPendingRow } from "@/utils/masanPendingStockOverlay";
import { toDisplayInteger } from "@/utils/number";
import {
  operatorModalWidthForTier,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";

type Props = {
  open: boolean;
  onClose: () => void;
  warehouseId: number;
  ccBucketZoneCode: string;
  vtLocationId: number;
  vtLocationCode?: string | null;
  vtLocationName?: string | null;
  lines: MasanPendingAllocationWithCc[];
  onConfirmed?: () => void;
  zIndex?: number;
};

export default function MasanVtPendingStockConfirmModal({
  open,
  onClose,
  warehouseId,
  ccBucketZoneCode,
  vtLocationId,
  vtLocationCode = null,
  vtLocationName = null,
  lines,
  onConfirmed,
  zIndex,
}: Props) {
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

  const [qtyByAllocationId, setQtyByAllocationId] = useState<
    Record<number, number>
  >({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setQtyByAllocationId({});
      return;
    }
    const initial: Record<number, number> = {};
    for (const row of lines) {
      initial[row.id] = Math.round(Number(row.quantity || 0));
    }
    setQtyByAllocationId(initial);
  }, [open, lines]);

  const titleLabel =
    (vtLocationName ?? "").trim() ||
    (vtLocationCode ?? "").trim() ||
    `#${vtLocationId}`;

  const handleConfirmAll = async () => {
    if (warehouseId <= 0 || !ccBucketZoneCode.trim()) {
      message.error("Thiếu thông tin xác nhận");
      return;
    }
    const quantities: Record<number, number> = {};
    for (const row of lines) {
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

    setSubmitting(true);
    try {
      await masanConfirmAllocationOutboundApi({
        warehouse_id: warehouseId,
        zone: ccBucketZoneCode.trim(),
        quantities,
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
      [...lines].sort((a, b) =>
        ccLabelForPendingRow(a).localeCompare(
          ccLabelForPendingRow(b),
          undefined,
          { numeric: true },
        ),
      ),
    [lines],
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Xác nhận lấy hàng tại VT"
      width={modalWidth}
      centered
      destroyOnHidden
      zIndex={zIndex}
      footer={null}
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700/70">
            Vị trí VT
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-brand-dark">
            {titleLabel}
          </p>
        </div>

        {sortedLines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-base text-slate-400">
            Không còn hàng chờ xác nhận tại VT này.
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
                        Ô CC
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

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="secondary" size="large" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="primary"
            size="large"
            loading={submitting}
            onClick={() => void handleConfirmAll()}
            disabled={sortedLines.length === 0}
          >
            Xác nhận tất cả
          </Button>
        </div>
      </div>
    </Modal>
  );
}
