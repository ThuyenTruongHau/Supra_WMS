import { formatQuantity, parseQuantity } from "@/utils/formatQuantity";

export function formatKpiNumber(value?: number | string) {
  return formatQuantity(value);
}

export function formatInventoryValue(value?: number | string) {
  const amount = parseQuantity(value);
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}
