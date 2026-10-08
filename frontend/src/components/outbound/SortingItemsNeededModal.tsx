import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Modal, Loading, cn, message } from "@/components/ui";
import { OPERATOR_DESKTOP } from "@/constants/operatorDesktopSizes";
import { useMasanSortingItemsNeeded } from "@/hooks/useMasanSortingItemsNeeded";
import type { MasanSortingItemNeededRow } from "@/types/masan";
import { toDisplayInteger } from "@/utils/number";
import {
  operatorModalWidthForTier,
  operatorPickBodyTextClass,
  operatorPickFooterButtonClass,
  operatorPickGridMaxHeightClass,
  operatorPickModalTitleClass,
  operatorPickSkuGridClass,
  operatorPickSkuQtyClass,
  operatorPickSkuTextClass,
  operatorPickSkuTileClass,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";

type SortingItemsNeededModalProps = {
  open: boolean;
  onClose: () => void;
  warehouseId: number;
  ccBucketZoneCode: string;
  title: string;
  subtitle?: string | null;
  zIndex?: number;
  onConfirmExport?: (items: MasanSortingItemNeededRow[]) => void | Promise<void>;
};

export default function SortingItemsNeededModal({
  open,
  onClose,
  warehouseId,
  ccBucketZoneCode,
  title,
  subtitle,
  zIndex,
  onConfirmExport,
}: SortingItemsNeededModalProps) {
  const tier = useOperatorViewportTier();
  const [viewportWidth, setViewportWidth] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth : 1280),
  );
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const modalWidth = useMemo(
    () =>
      open
        ? operatorModalWidthForTier(tier, viewportWidth)
        : OPERATOR_DESKTOP.modal.lg,
    [open, tier, viewportWidth],
  );

  const {
    data: sortingItemsData,
    isLoading,
    isError,
    refetch,
  } = useMasanSortingItemsNeeded(warehouseId, ccBucketZoneCode, open);

  const sortingItems = sortingItemsData?.items ?? [];

  useEffect(() => {
    if (open) {
      setSelectedItemId(null);
    }
  }, [open, ccBucketZoneCode]);

  const selectItem = useCallback((itemId: number) => {
    setSelectedItemId((prev) => (prev === itemId ? null : itemId));
  }, []);

  const handleConfirm = async () => {
    if (selectedItemId == null) {
      message.warning("Chọn một mã hàng");
      return;
    }
    const picked = sortingItems.filter((row) => row.item_id === selectedItemId);
    setConfirming(true);
    try {
      if (onConfirmExport) {
        await onConfirmExport(picked);
      } else {
        console.info("[SortingExport]", {
          ccZone: ccBucketZoneCode,
          itemIds: picked.map((r) => r.item_id),
          skus: picked.map((r) => r.sku),
        });
        message.success(`Đã xác nhận xuất mã ${picked[0]?.sku ?? ""}`);
      }
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  const bodyText = operatorPickBodyTextClass(tier);
  const titleClass = operatorPickModalTitleClass(tier);
  const footerBtn = operatorPickFooterButtonClass(tier);
  const gridClass = operatorPickSkuGridClass(tier);
  const gridMaxH = operatorPickGridMaxHeightClass(tier);
  const skuTile = operatorPickSkuTileClass(tier);
  const skuText = operatorPickSkuTextClass(tier);
  const skuQty = operatorPickSkuQtyClass(tier);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={modalWidth}
      destroyOnHidden
      zIndex={zIndex}
      className={cn(
        tier === "tv" && "[&_.ant-modal-content]:!p-1",
        "[&_.ant-modal-body]:!px-3 sm:[&_.ant-modal-body]:!px-6",
        "[&_.ant-modal-footer]:!px-4 sm:[&_.ant-modal-footer]:!px-6",
      )}
      styles={{
        body: {
          maxHeight: OPERATOR_DESKTOP.modal.ccLocationLines.bodyMaxHeight,
          overflow: "hidden",
        },
      }}
      title={
        <div className="min-w-0 pr-4 sm:pr-8">
          <p className={cn("font-black leading-tight text-brand-dark", titleClass)}>
            {title}
          </p>
          {subtitle ? (
            <p
              className={cn(
                "mt-1.5 font-medium text-slate-500",
                tier === "tv" ? "text-lg" : tier === "narrow" ? "text-xs" : "text-sm",
              )}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-3">
          <Button variant="secondary" onClick={onClose} className={footerBtn}>
            Hủy
          </Button>
          <Button
            variant="primary"
            loading={confirming}
            disabled={
              isLoading || sortingItems.length === 0 || selectedItemId == null
            }
            onClick={() => void handleConfirm()}
            className={footerBtn}
          >
            Xác nhận xuất
          </Button>
        </div>
      }
    >
      <div className="flex min-h-[12rem] flex-col gap-4 sm:gap-5">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-14 sm:py-16">
            <Loading />
          </div>
        ) : isError ? (
          <div
            className={cn(
              "rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center text-red-700 sm:px-6",
              bodyText,
            )}
          >
            <p className="font-semibold">Không tải được danh sách hàng.</p>
            <Button
              variant="secondary"
              className={cn("mt-4", footerBtn)}
              onClick={() => void refetch()}
            >
              Thử lại
            </Button>
          </div>
        ) : sortingItems.length === 0 ? (
          <p
            className={cn(
              "py-10 text-center font-medium text-slate-500 sm:py-12",
              bodyText,
            )}
          >
            Chưa có hàng gán cho khu vực này. Chạy phân ô CC hoặc import phiên
            xuất trước.
          </p>
        ) : (
          <>
            <p className={cn("font-medium text-slate-600", bodyText)}>
              Chọn <span className="font-bold text-brand-dark">một</span> mã
              hàng cần xuất.
            </p>
            <div
              className={cn(
                "min-h-0 overflow-y-auto overscroll-contain pr-1",
                gridMaxH,
                gridClass,
              )}
            >
              {sortingItems.map((row) => {
                const selected = selectedItemId === row.item_id;
                return (
                  <button
                    key={row.item_id}
                    type="button"
                    title={`${row.item_name} · SL ${toDisplayInteger(row.total_quantity)}`}
                    aria-pressed={selected}
                    onClick={() => selectItem(row.item_id)}
                    className={cn(
                      "w-full text-left font-mono transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 touch-manipulation",
                      skuTile,
                      selected
                        ? "border-brand-primary bg-brand-primary text-white shadow-md"
                        : "border-stripe-hairline bg-panel-soft text-brand-dark hover:border-brand-primary/40 hover:bg-sky-50 active:scale-[0.98]",
                    )}
                  >
                    <span className={cn("block truncate", skuText)}>
                      {row.sku}
                    </span>
                    <span
                      className={cn(
                        "mt-1 block truncate tabular-nums",
                        skuQty,
                        selected ? "text-white/90" : "text-slate-500",
                      )}
                    >
                      SL {toDisplayInteger(row.total_quantity)}
                    </span>
                    {tier !== "narrow" && row.item_name?.trim() ? (
                      <span
                        className={cn(
                          "mt-0.5 block truncate font-sans font-normal",
                          tier === "tv" ? "text-sm" : "text-xs",
                          selected ? "text-white/75" : "text-slate-400",
                        )}
                      >
                        {row.item_name}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
