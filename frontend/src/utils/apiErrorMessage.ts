import { isAxiosError } from "axios";
import type { ApiErrorResponse, ValidationErrorItem } from "@/types/apiError";
import { translateApiMessage } from "@/i18n/apiMessages.vi";

const VALUE_ERROR_PREFIX = /^Value error,\s*/i;
const STATUS_CODE_MESSAGE = /^Request failed with status code \d+$/i;

const FIELD_LABELS: Record<string, string> = {
  lot_number: "Số lô",
  lot_number_from: "Số lô từ",
  lot_number_to: "Số lô đến",
  quantity: "Số lượng",
  unit_id: "Đơn vị",
  item_id: "Mã sản phẩm",
  sku: "Mã sản phẩm",
  expiry_date: "Hạn sử dụng",
  order_code: "Mã đơn",
  warehouse_id: "Kho",
  from_location_id: "Điểm cấp",
  to_location_id: "Vị trí đích",
  base_quantity: "Số lượng cơ sở",
  min_quantity: "Số lượng tối thiểu",
  max_quantity: "Số lượng tối đa",
};

function cleanMessage(message: string): string {
  return translateApiMessage(message.replace(VALUE_ERROR_PREFIX, "").trim());
}

function fieldLabelFromLoc(loc?: (string | number)[]): string | null {
  if (!loc?.length) return null;
  const meaningful = loc.filter(
    (part) => part !== "body" && part !== "query" && typeof part === "string",
  ) as string[];
  if (meaningful.length === 0) return null;
  const last = meaningful[meaningful.length - 1];
  return FIELD_LABELS[last] ?? last;
}

function formatValidationItem(item: ValidationErrorItem): string | null {
  if (!item.msg) return null;
  const message = cleanMessage(item.msg);
  const label = fieldLabelFromLoc(item.loc);
  // Lot / value errors đã tự mô tả đủ — tránh prefix loc dài kiểu line_items.[0]...
  if (
    !label ||
    message.toLowerCase().includes(label.toLowerCase()) ||
    /lot_number/i.test(message)
  ) {
    return message;
  }
  return `${label}: ${message}`;
}

function extractDetailMessages(detail: unknown): string[] {
  if (typeof detail === "string" && detail.trim()) {
    return [cleanMessage(detail)];
  }

  if (Array.isArray(detail)) {
    return detail
      .map((item) => formatValidationItem(item as ValidationErrorItem))
      .filter((message): message is string => !!message);
  }

  if (detail && typeof detail === "object") {
    const obj = detail as Record<string, unknown>;
    if (typeof obj.msg === "string") {
      return [cleanMessage(obj.msg)];
    }
    if (typeof obj.message === "string") {
      return [cleanMessage(obj.message)];
    }
  }

  return [];
}

export function getApiErrorMessage(
  err: unknown,
  fallback = "Có lỗi xảy ra",
): string {
  if (isAxiosError<ApiErrorResponse>(err)) {
    const messages = extractDetailMessages(err.response?.data?.detail);
    if (messages.length > 0) {
      return messages.join("; ");
    }

    const status = err.response?.status;
    if (status === 422) {
      return "Dữ liệu không hợp lệ. Vui lòng kiểm tra lại các trường đã nhập.";
    }
    if (status === 401) {
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    }
    if (status === 403) {
      return "Bạn không có quyền thực hiện thao tác này.";
    }
    if (status && status >= 500) {
      return "Lỗi máy chủ. Vui lòng thử lại sau.";
    }
  }

  if (
    err instanceof Error &&
    err.message &&
    !STATUS_CODE_MESSAGE.test(err.message)
  ) {
    return translateApiMessage(err.message);
  }

  return fallback;
}
