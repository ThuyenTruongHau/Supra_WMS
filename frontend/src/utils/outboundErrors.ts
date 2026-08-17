import { isAxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";

const NO_STOCK_PATTERN = /^No enough stock for item (\d+)$/;

export type OutboundItemLabelSource = {
  item_id: number;
  sku?: string | null;
  item_name?: string | null;
};

function resolveItemLabel(
  itemId: number,
  sources: OutboundItemLabelSource[],
): string {
  const match = sources.find((s) => s.item_id === itemId);
  if (!match) return `#${itemId}`;
  if (match.sku) return match.sku;
  if (match.item_name) return match.item_name;
  return `#${itemId}`;
}

function extractApiDetail(err: unknown): string | null {
  if (!isAxiosError<ApiErrorResponse>(err)) return null;
  const detail = err.response?.data?.detail;
  return typeof detail === "string" ? detail : null;
}

export function formatOutboundCalculateError(
  err: unknown,
  itemSources: OutboundItemLabelSource[] = [],
): string {
  const message = extractApiDetail(err);
  if (!message) return "Có lỗi xảy ra khi phân bổ";

  const noStock = message.match(NO_STOCK_PATTERN);
  if (noStock) {
    const itemId = Number(noStock[1]);
    const label = resolveItemLabel(itemId, itemSources);
    return `Không đủ tồn kho khả dụng cho sản phẩm ${label}. Vui lòng kiểm tra tồn kho hoặc nhập thêm hàng.`;
  }

  return message;
}
