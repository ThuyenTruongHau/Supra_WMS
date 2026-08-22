/**
 * Bản dịch message lỗi API (tiếng Anh từ backend) → tiếng Việt trên UI.
 * Key phải khớp prefix/câu backend trả về.
 */
export const API_MESSAGES_VI: Record<string, string> = {
  "Warehouse not found": "Không tìm thấy kho",
  "Warehouse id not found": "Không tìm thấy kho",
  "No stock found for the selected product codes":
    "Không có sản phẩm nào với mã sản phẩm đó",
  "Selected locations have no stock": "Tồn tại vị trí không có hàng",
  "No stock found for the selected lots": "Không có sản phẩm nào trong lô đó",
  "No stock found in this warehouse": "Không có tồn kho nào trong kho này",
  "Invalid lot number format": "Số lô không hợp lệ",
  "Database conflict": "Xung đột dữ liệu, vui lòng thử lại",
  "No suitable item stocks found": "Không tìm thấy tồn kho phù hợp",
  "Stocktake not found": "Không tìm thấy phiếu kiểm kê",
};

const API_MESSAGE_ENTRIES = Object.entries(API_MESSAGES_VI).sort(
  (a, b) => b[0].length - a[0].length,
);

export function translateApiMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  const exact = API_MESSAGES_VI[trimmed];
  if (exact) return exact;
  for (const [en, vi] of API_MESSAGE_ENTRIES) {
    if (trimmed === en || trimmed.startsWith(en)) return vi;
  }
  return trimmed;
}
