import { useMemo } from "react";
import { Loading, cn } from "@/components/ui";
import type { MasanSortingZonePendingStockResponse } from "@/types/masan";
import {
  buildMonitorPendingStockSidebar,
  formatSidebarCcLabel,
  formatSidebarLocator,
  formatSidebarPickQty,
  summarizeSkusForVtRows,
} from "@/utils/monitorPendingStockSidebar";
import {
  monitorSidebarType,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";
type Props = {
  zoneTitle: string;
  pendingStock: MasanSortingZonePendingStockResponse | undefined;
  pendingStockLoading: boolean;
  vtLocationCodeById?: Map<number, string>;
  vtLocationDisplayLabelById?: Map<number, string>;
  ccLocationIdToCode?: Map<number, string>;
  ccLocationDisplayLabelById?: Map<number, string>;
  /** Ô VT đang chọn trên map — chỉ hiện block CC cho VT này. */
  selectedVtLocationId?: number | null;
  /** CC đã gán biển số — dòng không thuộc tập này coi như không chia tại ô đó. */
  assignedCcCodes?: Set<string>;
  onClearVtSelection?: () => void;
  className?: string;
};

/**
 * Pending-stock gom theo đích VT; mỗi dòng nguồn CC + mã lấy.
 */
export default function MonitorZoneLocationSidebar({
  zoneTitle,
  pendingStock,
  pendingStockLoading,
  vtLocationCodeById,
  vtLocationDisplayLabelById,
  ccLocationIdToCode,
  ccLocationDisplayLabelById,
  selectedVtLocationId = null,
  assignedCcCodes,
  onClearVtSelection,
  className,
}: Props) {
  const allSections = useMemo(
    () =>
      buildMonitorPendingStockSidebar(
        pendingStock,
        vtLocationCodeById,
        ccLocationIdToCode,
        vtLocationDisplayLabelById,
        ccLocationDisplayLabelById,
      ),
    [
      pendingStock,
      vtLocationCodeById,
      ccLocationIdToCode,
      vtLocationDisplayLabelById,
      ccLocationDisplayLabelById,
    ],
  );

  const sections = useMemo(() => {
    let list = allSections;
    if (selectedVtLocationId != null) {
      list = list.filter(
        (block) => block.vtLocationId === selectedVtLocationId,
      );
    }
    if (assignedCcCodes && assignedCcCodes.size > 0) {
      list = list
        .map((block) => {
          const pickRows = block.pickRows.filter((row) => {
            const code = row.ccLocationCode?.trim();
            return code ? assignedCcCodes.has(code) : false;
          });
          return {
            ...block,
            pickRows,
            stockSummary: summarizeSkusForVtRows(pickRows),
          };
        })
        .filter((block) => block.pickRows.length > 0);
    }
    return list;
  }, [allSections, selectedVtLocationId, assignedCcCodes]);

  const loading = pendingStockLoading && sections.length === 0;
  const viewportTier = useOperatorViewportTier();
  const type = monitorSidebarType(viewportTier);
  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-[40%] max-w-[40%] shrink-0 flex-col border-l border-stripe-hairline bg-panel",
        className,
      )}
    >
      <div className={cn("border-b border-stripe-hairline", type.shellHeader)}>
        <h2 className={type.zoneTitle}>{zoneTitle}</h2>
        <p className={type.hint}>
          {selectedVtLocationId != null
            ? "Các ô CC cần lấy hàng cho VT đang chọn."
            : "Click ô VT trên bản đồ để xem CC nguồn; click lại VT để bỏ lọc."}
        </p>
        {selectedVtLocationId != null && onClearVtSelection ? (
          <button
            type="button"
            onClick={onClearVtSelection}
            className="mt-2 text-sm font-semibold text-brand-primary hover:underline"
          >
            Xem tất cả VT
          </button>
        ) : null}
      </div>
      <div className={cn("operator-panel-scroll", type.list)}>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loading />
          </div>
        ) : null}
        {!loading && sections.length === 0 ? (
          <p className={type.empty}>
            {selectedVtLocationId != null
              ? "VT này chưa có hàng stock_ready từ CC"
              : "Không có hàng chờ lấy"}
          </p>
        ) : null}
        <div className={type.sectionGap}>
          {sections.map((block) => (
            <section
              key={block.vtLocationId}
              className={cn(
                "overflow-hidden rounded-2xl border bg-panel-soft",
                selectedVtLocationId === block.vtLocationId
                  ? "border-brand-primary/40 ring-1 ring-brand-primary/20"
                  : "border-stripe-hairline",
              )}
            >
              <header
                className={cn(
                  "border-b border-stripe-hairline bg-slate-50/90",
                  type.blockHeader,
                )}
              >
                <div className={type.blockHeaderRow}>
                  <p className={type.vtName} title={block.vtDisplayLabel}>
                    {block.vtDisplayLabel}
                  </p>
                  <p className={type.sku} title={block.stockSummary}>
                    {block.stockSummary}
                  </p>
                </div>
              </header>
              <div className={type.tableWrap}>
                <div className={type.tableHeader} role="row">
                  <span>CC</span>
                  <span className={type.tableHeaderQty}>Số lượng</span>
                  <span className={type.tableHeaderLocator}>Locator</span>
                </div>
                <ul className={type.rows}>
                  {block.pickRows.map((row) => {
                    const qty = formatSidebarPickQty(row);
                    const ccLabel = formatSidebarCcLabel(
                      row,
                      ccLocationDisplayLabelById,
                    );
                    const locator = formatSidebarLocator(row);
                    return (
                      <li key={row.id} className={type.row}>
                        <span className={type.rowCc}>{ccLabel}</span>
                        <span className={type.rowQty}>{qty}</span>
                        <span className={type.rowLocator}>{locator}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
