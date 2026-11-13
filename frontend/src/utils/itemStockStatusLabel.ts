const ITEM_STOCK_STATUS_LABELS: Record<string, string> = {
  available: "Sẵn sàng",
  split: "Hàng lẻ",
};

export function itemStockStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const key = status.trim().toLowerCase();
  return ITEM_STOCK_STATUS_LABELS[key] ?? status;
}
