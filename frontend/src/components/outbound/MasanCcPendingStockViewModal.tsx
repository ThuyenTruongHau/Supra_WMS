/**
 * Xem mọi allocation pending-stock tại một ô CC (mọi status; không confirm).
 */
import { Modal } from "@/components/ui";
import type { MasanPendingAllocationWithCc } from "@/types/masan";
import { toDisplayInteger } from "@/utils/number";
import {
  operatorModalWidthForTier,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";

type Props = {
  open: boolean;
  onClose: () => void;
  ccLocationCode?: string | null;
  ccLocationName?: string | null;
  lines: MasanPendingAllocationWithCc[];
  vtLocationCodeById?: Map<number, string>;
  zIndex?: number;
};

function skuLabel(row: MasanPendingAllocationWithCc): string {
  const sku = row.sku != null ? String(row.sku).trim() : "";
  if (sku) return sku;
  return `#${row.item_stock_id}`;
}

function vtLabel(
  row: MasanPendingAllocationWithCc,
  vtLocationCodeById?: Map<number, string>,
): string {
  const vtId = row.to_location_id;
  if (vtId == null || vtId <= 0) return "—";
  const code = vtLocationCodeById?.get(vtId)?.trim();
  if (code) return code;
  return `#${vtId}`;
}

export default function MasanCcPendingStockViewModal({
  open,
  onClose,
  ccLocationCode = null,
  ccLocationName = null,
  lines,
  vtLocationCodeById,
  zIndex,
}: Props) {
  const tier = useOperatorViewportTier();
  const titleCode = (ccLocationCode ?? "").trim() || `#`;
  const titleName = (ccLocationName ?? "").trim();
  const title = titleName
    ? `Hàng chờ tại ${titleCode} — ${titleName}`
    : `Hàng chờ tại ${titleCode}`;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={title}
      width={operatorModalWidthForTier(tier, "wide")}
      zIndex={zIndex}
      destroyOnClose
    >
      {lines.length === 0 ? (
        <p className="text-sm text-muted">Không có allocation chờ tại ô này.</p>
      ) : (
        <div className="max-h-[min(70vh,520px)] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-panel-soft">
              <tr className="border-b border-stripe-hairline">
                <th className="px-2 py-2 font-semibold">SKU</th>
                <th className="px-2 py-2 font-semibold">SL</th>
                <th className="px-2 py-2 font-semibold">VT đích</th>
                <th className="px-2 py-2 font-semibold">Trạng thái</th>
                <th className="px-2 py-2 font-semibold">Alloc #</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((row, index) => (
                <tr
                  key={`${row.id}-${row.ccLocationId}-${index}`}
                  className="border-b border-stripe-hairline/80"
                >
                  <td className="px-2 py-2 font-medium">{skuLabel(row)}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {toDisplayInteger(row.quantity ?? 0)}
                  </td>
                  <td className="px-2 py-2">{vtLabel(row, vtLocationCodeById)}</td>
                  <td className="px-2 py-2">{(row.status ?? "—").trim() || "—"}</td>
                  <td className="px-2 py-2 text-muted tabular-nums">{row.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Danh sách từ pending-stock (stock_ready). Double-click ô VT để xác nhận
        lấy hàng; double-click ô CC trên board xuất để xem chi tiết hàng đã
        chia (gán xe).
      </p>
    </Modal>
  );
}
