/**
 * Bản dịch loại QR in phiếu (backend qr_type → nhãn UI).
 */

export const QR_TYPE_LABELS_VI: Record<string, string> = {
  item: "Phiếu sản phẩm",
  transit: "Phiếu di chuyển",
};

export function translateQrType(qrType: string | null | undefined): string {
  if (qrType == null || qrType === "") return "—";
  return QR_TYPE_LABELS_VI[qrType] ?? qrType;
}
