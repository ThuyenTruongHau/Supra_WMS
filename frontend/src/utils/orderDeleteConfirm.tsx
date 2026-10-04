import type { ReactNode } from "react";

export const COMPLETED_ORDER_DELETE_HINT = "Không thể xóa đơn đã hoàn thành";

export function isOrderDeletable(status?: string | null): boolean {
  return status !== "completed";
}

export function buildDeleteOrderContent(
  orderLabel: string,
  orderCode: string,
  status?: string | null,
): ReactNode {
  const question = `Bạn có chắc chắn muốn xóa ${orderLabel} "${orderCode}"?`;
  if (!status || status === "initialize") return question;

  return (
    <div>
      <p>{question}</p>
      <p className="mt-2 text-amber-600">
        Đơn đang thực hiện. Lệnh robot đã gửi sẽ KHÔNG tự hủy trên ICS. Phần đã
        hoàn thành được giữ nguyên tồn kho, phần chưa hoàn thành sẽ bị hủy.
      </p>
    </div>
  );
}
