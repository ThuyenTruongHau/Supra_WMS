import type { MasanOutboundStockShortage } from "@/types/masanOutbound";

export function MasanOutboundImportBlocker({
  lines,
  shortages: _shortages,
  confirmOnly = false,
  listClassName = "mt-2 max-h-64 list-disc space-y-1 overflow-y-auto pl-5 text-left text-sm",
}: {
  lines: string[];
  shortages?: MasanOutboundStockShortage[];
  /** Modal xác nhận thiếu tồn — không liệt kê chi tiết (file BM.06 đã tải tự động). */
  confirmOnly?: boolean;
  listClassName?: string;
}) {
  return (
    <div className="text-sm text-slate-700">
      {confirmOnly ? (
        <p>
          File import có mã thiếu tồn kho. File nhập phần thiếu (BM.06) đã được
          tải xuống. Chọn <strong>Xác nhận</strong> để tiếp tục phiên xuất.
        </p>
      ) : (
        <ul className={listClassName}>
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
