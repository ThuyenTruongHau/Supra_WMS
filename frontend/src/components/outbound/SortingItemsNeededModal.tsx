import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayCircleOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Modal, Loading, Table, cn, message } from "@/components/ui";
import OutboundStatusTag from "@/components/shared/OutboundStatusTag";
import { OPERATOR_DESKTOP } from "@/constants/operatorDesktopSizes";
import { useMasanSortingItemsNeeded } from "@/hooks/useMasanSortingItemsNeeded";
import { useMasanSortingZoneReturnTasks } from "@/hooks/useMasanSortingZoneReturnTasks";
import { useExecuteOutboundRobotTask } from "@/hooks/useOutbound";
import type { MasanSortingItemNeededRow } from "@/types/masan";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";
import {
  buildReturnExecuteBody,
  displayTaskLocationName,
  type MasanSortingReturnTaskRow,
} from "@/utils/masanSortingReturnTasks";
import { toDisplayInteger } from "@/utils/number";
import { getRobotTaskDisplayStatus } from "@/utils/outboundRobotTaskDisplay";
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

const RETURN_TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50 [&_.ant-table-cell]:!text-center";

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
  const [executingOrderId, setExecutingOrderId] = useState<string | null>(null);
  const executeReturnMutation = useExecuteOutboundRobotTask();

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

  const {
    rows: returnRows,
    isLoading: returnLoading,
    isError: returnError,
    refetch: refetchReturnTasks,
  } = useMasanSortingZoneReturnTasks(warehouseId, ccBucketZoneCode, open);

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

  const handleExecuteReturn = useCallback(
    async (row: MasanSortingReturnTaskRow) => {
      const body = buildReturnExecuteBody(row.task);
      if (!body) {
        message.warning("Lệnh trả thiếu vị trí đầu hoặc đích");
        return;
      }
      setExecutingOrderId(row.task.order_id);
      message.loading({ content: "Đang gửi lệnh trả...", key: "return-exec" });
      try {
        await executeReturnMutation.mutateAsync({
          orderId: row.outboundOrderId,
          body,
          detailType: "auto",
        });
        message.success({ content: "Đã gửi lệnh trả", key: "return-exec" });
        await refetchReturnTasks();
      } catch (err) {
        message.error({
          content: getApiErrorMessage(err),
          key: "return-exec",
        });
      } finally {
        setExecutingOrderId(null);
      }
    },
    [executeReturnMutation, refetchReturnTasks],
  );

  const bodyText = operatorPickBodyTextClass(tier);
  const titleClass = operatorPickModalTitleClass(tier);
  const footerBtn = operatorPickFooterButtonClass(tier);
  const gridClass = operatorPickSkuGridClass(tier);
  const gridMaxH = operatorPickGridMaxHeightClass(tier);
  const skuTile = operatorPickSkuTileClass(tier);
  const skuText = operatorPickSkuTextClass(tier);
  const skuQty = operatorPickSkuQtyClass(tier);
  const compact = tier === "narrow";

  const returnColumns: ColumnsType<MasanSortingReturnTaskRow> = useMemo(
    () => [
      {
        title: "Loại",
        key: "task_type",
        width: compact ? 72 : 90,
        render: () => <span className="font-semibold">TRẢ</span>,
      },
      {
        title: "Mã lệnh",
        key: "order_id",
        render: (_, record) => (
          <span className="font-medium">{record.task.order_id}</span>
        ),
      },
      {
        title: "Số lượng",
        key: "quantity",
        width: compact ? 88 : 110,
        render: (_, record) => (
          <span className="font-semibold">
            {toDisplayInteger(record.task.quantity)}
          </span>
        ),
      },
      {
        title: "Vị trí đầu",
        key: "start_location",
        render: (_, record) => {
          const first = record.task.allocations[0];
          return displayTaskLocationName(
            first?.from_location_name,
            first?.from_location_code,
            first?.from_location_id,
          );
        },
      },
      {
        title: "Vị trí cuối",
        key: "end_location",
        render: (_, record) => {
          const first = record.task.allocations[0];
          return displayTaskLocationName(
            first?.to_location_name,
            first?.to_location_code,
            first?.to_location_id,
          );
        },
      },
      {
        title: "Trạng thái",
        key: "status",
        width: compact ? 120 : 160,
        render: (_, record) => {
          const displayStatus = getRobotTaskDisplayStatus(record.task);
          const body = buildReturnExecuteBody(record.task);
          if (displayStatus === "initialize") {
            return (
              <Button
                variant="primary"
                icon={<PlayCircleOutlined />}
                loading={executingOrderId === record.task.order_id}
                disabled={!body}
                title={!body ? "Thiếu vị trí đầu hoặc đích" : undefined}
                onClick={() => void handleExecuteReturn(record)}
              >
                Execute
              </Button>
            );
          }
          return <OutboundStatusTag status={displayStatus} size="sm" />;
        },
      },
    ],
    [compact, executingOrderId, handleExecuteReturn],
  );

  const showSkuEmpty = !isLoading && !isError && sortingItems.length === 0;
  const showReturnEmpty =
    !returnLoading && !returnError && returnRows.length === 0;

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
      <div className="flex min-h-[12rem] min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain sm:gap-5">
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
        ) : showSkuEmpty ? (
          <p
            className={cn(
              "py-6 text-center font-medium text-slate-500 sm:py-8",
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

        <div className="min-w-0 border-t border-slate-200 pt-4">
          <p className={cn("mb-3 font-semibold text-brand-dark", bodyText)}>
            Hàng quay đầu
          </p>
          {returnLoading ? (
            <div className="flex justify-center py-8">
              <Loading />
            </div>
          ) : returnError ? (
            <div
              className={cn(
                "rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-red-700",
                bodyText,
              )}
            >
              <p className="font-semibold">Không tải được lệnh trả.</p>
              <Button
                variant="secondary"
                className={cn("mt-3", footerBtn)}
                onClick={() => void refetchReturnTasks()}
              >
                Thử lại
              </Button>
            </div>
          ) : showReturnEmpty ? (
            <p className={cn("py-4 text-center font-medium text-slate-500", bodyText)}>
              Chưa có pallet dư cần trả về kệ.
            </p>
          ) : (
            <Table<MasanSortingReturnTaskRow>
              columns={returnColumns}
              dataSource={returnRows}
              pagination={false}
              rowKey={(record) => record.task.order_id}
              size="middle"
              scroll={{ x: compact ? 640 : 860 }}
              className={RETURN_TABLE_CLASS}
              rowClassName={() => "bg-red-50"}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
