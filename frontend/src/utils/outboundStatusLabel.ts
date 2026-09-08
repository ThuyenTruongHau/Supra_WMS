/** Nhãn tiếng Việt cho status đơn xuất / item outbound. */
export const OUTBOUND_STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xử lý",
  wave_assigned: "Đã gán wave",
  sorting: "Đang chia chọn",
  picking: "Đang lấy hàng",
  task_created: "Đã tạo lệnh",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  draft: "Nháp",
  in_progress: "Đang xử lý",
}

export function outboundStatusLabel(status: string | null | undefined): string {
  const key = (status || "").trim().toLowerCase()
  if (!key) return "—"
  return OUTBOUND_STATUS_LABELS[key] ?? status ?? "—"
}
