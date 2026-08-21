/**
 * Bản dịch trạng thái từ backend → tiếng Việt (UI).
 * Key giữ nguyên giá trị API trả về (snake_case / kebab-case).
 *
 * Nhóm:
 * - order: đơn nhập / đơn xuất / chi tiết / allocation
 * - location: trạng thái vị trí kho
 * - stock: tồn kho theo ô
 * - qr: mã QR sản phẩm
 * - robot: task robot / ICS
 * - job: job import bất đồng bộ
 * - history: lịch sử (old_status / new_status)
 */

export const STATUS_LABELS_VI: Record<string, string> = {
  // --- Đơn nhập / đơn xuất ---
  none: "Không có",
  initialize: "Khởi tạo",
  reserved: "Đã giữ chỗ",
  reversed: "Đã giữ chỗ",
  issued: "Đã phát lệnh",
  in_progress: "Đang thực hiện",
  "in-progress": "Đang thực hiện",
  in_transit: "Đang vận chuyển",
  completed: "Hoàn thành",
  failed: "Thất bại",
  cancelled: "Đã hủy",
  deleted: "Đã xóa",

  // --- Vị trí kho ---
  empty: "Trống",
  has_stock: "Có hàng",

  // --- Tồn kho (item stock) ---
  available: "Sẵn sàng",

  // --- QR code ---
  stocked: "Đã gán tồn",
  expired: "Hết hạn",

  // --- Job import item ---
  pending: "Chờ xử lý",
  running: "Đang chạy",
};

/** Alias snake_case ↔ kebab-case cho cùng một nghĩa. */
const STATUS_ALIASES: Record<string, string> = {
  "in-progress": "in_progress",
};

/**
 * Dịch mã trạng thái backend sang nhãn tiếng Việt.
 * Không khớp thì trả về mã gốc.
 */
export function translateStatus(status: string | null | undefined): string {
  if (status == null || status === "") return "—";
  const normalized = STATUS_ALIASES[status] ?? status;
  return STATUS_LABELS_VI[normalized] ?? STATUS_LABELS_VI[status] ?? status;
}
