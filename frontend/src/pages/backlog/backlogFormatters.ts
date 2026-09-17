import dayjs from "dayjs";
import { translateStatus } from "@/i18n/statusLabels.vi";
import { formatQuantity } from "@/utils/formatQuantity";

export type PreviewRow = {
  label: string;
  value: string;
  isJson?: boolean;
};

export const FIELD_LABELS_VI: Record<string, string> = {
  id: "ID",
  stock_code: "Mã tồn (UUID)",
  item_id: "Mã sản phẩm",
  item_sku: "SKU",
  item_name: "Tên hàng",
  location_id: "ID vị trí",
  location_code: "Mã vị trí",
  location_name: "Tên vị trí",
  inbound_order_detail_id: "ID chi tiết đơn nhập",
  unit_id: "ID đơn vị",
  unit_name: "Đơn vị",
  quantity: "Số lượng",
  available_quantity: "Khả dụng",
  lot_number: "Số lô",
  lot_number_from: "Lô từ",
  lot_number_to: "Lô đến",
  expiry_date: "Hạn sử dụng",
  status: "Trạng thái",
  is_active: "Đang hoạt động",
  qc_user: "QC",
  manufacturing_machine: "Máy SX",
  manufacturing_user: "Người SX",
  packing_user: "Người đóng gói",
  cavity_number: "Số cavity",
  stock_level: "Tầng tồn",
  created_at: "Tạo lúc",
  updated_at: "Cập nhật",
  qr_code: "Mã QR",
  item_stock_id: "Mã tồn",
  order_code: "Mã đơn",
  order_type: "Loại đơn",
  warehouse_id: "ID kho",
  note: "Ghi chú",
  created_by_id: "Người tạo",
  transaction_type: "Loại giao dịch",
  from_location_id: "ID vị trí nguồn",
  to_location_id: "ID vị trí đích",
  description: "Mô tả",
  old_status: "Trạng thái cũ",
  new_status: "Trạng thái mới",
  inbound_order_id: "ID đơn nhập",
  outbound_order_id: "ID đơn xuất",
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS_VI[key] ?? key;
}

/** Keys that are internal IDs / UUIDs — hide from user-facing preview. */
const HIDDEN_PREVIEW_KEYS = new Set([
  "id",
  "stock_code",
  "item_id",
  "location_id",
  "inbound_order_detail_id",
  "unit_id",
  "warehouse_id",
  "item_stock_id",
  "from_location_id",
  "to_location_id",
  "created_by_id",
  "inbound_order_id",
  "outbound_order_id",
  "qr_code_id",
]);

export function shouldHidePreviewKey(key: string): boolean {
  const baseKey = key.includes(".") ? (key.split(".").pop() ?? key) : key;
  if (HIDDEN_PREVIEW_KEYS.has(baseKey)) return true;
  if (baseKey.endsWith("_id")) return true;
  return false;
}

function stripTechnicalFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value
      .map(stripTechnicalFields)
      .filter((item) => item !== undefined);
    return items;
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (shouldHidePreviewKey(key)) continue;
      const cleaned = stripTechnicalFields(nested);
      if (cleaned === undefined) continue;
      result[key] = cleaned;
    }
    return result;
  }
  return value;
}

function isEmptyPreviewValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (isPlainObject(value) && Object.keys(value).length === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("DD/MM/YYYY HH:mm") : value;
}

export function formatLocation(
  code: string | null | undefined,
  name: string | null | undefined,
): string {
  if (code && name) return `${code} — ${name}`;
  return code ?? name ?? "—";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatScalar(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (key === "status" || key === "old_status" || key === "new_status") {
    return translateStatus(String(value));
  }
  if (key === "order_type") {
    if (value === "inbound") return "Đơn nhập";
    if (value === "outbound") return "Đơn xuất";
    return String(value);
  }
  if (
    key &&
    (key.includes("quantity") ||
      key === "stock_level" ||
      key.endsWith("_id") === false)
  ) {
    if (
      key.includes("quantity") ||
      key === "quantity" ||
      key === "available_quantity"
    ) {
      return formatQuantity(value as number | string);
    }
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatDateTime(value);
    return value;
  }
  return String(value);
}

export function formatFieldValue(
  value: unknown,
  key?: string,
): string {
  if (isPlainObject(value) || Array.isArray(value)) {
    return JSON.stringify(value, null, 2);
  }
  return formatScalar(value, key);
}

export function flattenDetailsToRows(
  details: Record<string, unknown> | null | undefined,
  prefix = "",
): PreviewRow[] {
  if (!details || Object.keys(details).length === 0) return [];

  const rows: PreviewRow[] = [];

  for (const [key, value] of Object.entries(details)) {
    if (shouldHidePreviewKey(key)) continue;

    const fullKey = prefix ? `${prefix}.${key}` : key;
    const label = fieldLabel(key);

    if (isPlainObject(value)) {
      const nested = flattenDetailsToRows(value, fullKey);
      if (nested.length > 0) {
        rows.push(...nested);
      } else {
        const cleaned = stripTechnicalFields(value);
        if (isEmptyPreviewValue(cleaned)) continue;
        rows.push({
          label,
          value: JSON.stringify(cleaned, null, 2),
          isJson: true,
        });
      }
      continue;
    }

    if (Array.isArray(value)) {
      const cleaned = stripTechnicalFields(value);
      if (isEmptyPreviewValue(cleaned)) continue;
      rows.push({
        label,
        value: JSON.stringify(cleaned, null, 2),
        isJson: true,
      });
      continue;
    }

    if (isEmptyPreviewValue(value)) continue;

    rows.push({
      label,
      value: formatScalar(value, key),
    });
  }

  return rows;
}

export function objectToPreviewRows(
  obj: Record<string, unknown>,
  excludeKeys: string[] = [],
): PreviewRow[] {
  const rows: PreviewRow[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (excludeKeys.includes(key) || shouldHidePreviewKey(key)) continue;

    if (key === "details" && isPlainObject(value)) {
      rows.push(...flattenDetailsToRows(value));
      continue;
    }

    if (isPlainObject(value) || Array.isArray(value)) {
      const cleaned = stripTechnicalFields(value);
      if (isEmptyPreviewValue(cleaned)) continue;
      rows.push({
        label: fieldLabel(key),
        value: JSON.stringify(cleaned, null, 2),
        isJson: true,
      });
      continue;
    }

    if (isEmptyPreviewValue(value)) continue;

    rows.push({
      label: fieldLabel(key),
      value: formatScalar(value, key),
    });
  }

  return rows;
}
