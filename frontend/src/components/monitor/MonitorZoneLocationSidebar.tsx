import { useMemo } from "react";
import { Loading, cn } from "@/components/ui";
import type { MasanSortingZonePendingStockResponse } from "@/types/masan";
import {
  buildMonitorPendingStockSidebar,
  formatSidebarCcLabel,
  formatSidebarPickQty,
  formatSidebarPickSku,
} from "@/utils/monitorPendingStockSidebar";

type Props = {
  zoneTitle: string;
  pendingStock: MasanSortingZonePendingStockResponse | undefined;
  pendingStockLoading: boolean;
  vtLocationCodeById?: Map<number, string>;
  ccLocationIdToCode?: Map<number, string>;
  className?: string;
};

/**
 * Hiển thị pending-stock gom theo VT (to_location_id); mỗi dòng kèm nhãn CC.
 */
export default function MonitorZoneLocationSidebar({
  zoneTitle,
  pendingStock,
  pendingStockLoading,
  vtLocationCodeById,
  ccLocationIdToCode,
  className,
}: Props) {
  const sections = useMemo(
    () =>
      buildMonitorPendingStockSidebar(
        pendingStock,
        vtLocationCodeById,
        ccLocationIdToCode,
      ),
    [pendingStock, vtLocationCodeById, ccLocationIdToCode],
  );

  const loading = pendingStockLoading && sections.length === 0;

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 w-[min(100%,20rem)] shrink-0 flex-col border-l border-stripe-hairline bg-panel",
        className,
      )}
    >
      <div className="border-b border-stripe-hairline px-3 py-2.5">
        <h2 className="text-sm font-bold text-brand-dark">{zoneTitle}</h2>
        <p className="text-[11px] text-slate-500">
          Hàng chờ lấy theo VT (double-click ô VT để xác nhận)
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loading />
          </div>
        ) : null}
        {!loading && sections.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-slate-500">
            Không có hàng chờ lấy tại VT
          </p>
        ) : null}
        <div className="space-y-3">
          {sections.map((block) => (
            <section
              key={block.vtLocationId}
              className="overflow-hidden rounded-xl border border-stripe-hairline bg-panel-soft"
            >
              <header className="border-b border-stripe-hairline bg-slate-50/90 px-2.5 py-2">
                <p className="text-sm font-bold text-brand-dark">
                  VT {block.displayLabel}
                </p>
                {block.primary && block.extraCount > 0 ? (
                  <p className="mt-1 text-[11px] font-semibold text-orange-700">
                    +{block.extraCount} lô khác (ưu tiên lô cũ nhất trước)
                  </p>
                ) : null}
              </header>
              <ul className="space-y-1 px-2.5 py-2">
                {[...block.pickRows].reverse().map((row) => {
                  const isPrimary = block.primary?.id === row.id;
                  return (
                    <li
                      key={row.id}
                      className={cn(
                        "flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-xs",
                        isPrimary
                          ? "border border-orange-200 bg-orange-50/90"
                          : "bg-white",
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate font-mono font-semibold text-slate-800">
                          {formatSidebarPickSku(row)}
                        </span>
                        <span className="shrink-0 font-bold tabular-nums text-brand-primary">
                          {formatSidebarPickQty(row)}
                        </span>
                      </div>
                      <span className="text-[10px] font-medium text-slate-500">
                        CC {formatSidebarCcLabel(row)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}
