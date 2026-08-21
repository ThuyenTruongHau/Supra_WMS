/** Định dạng số lô — ddmmyy khớp logic FEFO outbound (6 chữ số). */
export type LotNumberFormat = "ddmmyy" | "legacy" | "any";

const LEGACY_DATE = String.raw`\d{2}/\d{2}/\d{2}`;
const LEGACY_RANGE_RE = new RegExp(
  `^(${LEGACY_DATE})-(${LEGACY_DATE})$`,
);
const LEGACY_DAY_RANGE_RE = /^(\d{1,2})-(\d{1,2})\/(\d{2}\/\d{2})$/;
const LEGACY_SINGLE_RE = new RegExp(`^(${LEGACY_DATE})$`);

export const LOT_NUMBER_LEGACY_HINT =
  "DD/MM/YY, DD/MM/YY-DD/MM/YY, hoặc DD-DD/MM/YY (vd: 19/08/26, 30/07/26-01/08/26, 09-10/04/26)";

export interface LotNumberValidationOptions {
  /** Bắt buộc nhập số lô. Mặc định false — tắt khi bài toán không cần lô. */
  required?: boolean;
  /** Kiểm tra định dạng khi có giá trị. Mặc định any (chỉ trim, không ràng buộc pattern). */
  format?: LotNumberFormat;
  /** Nhãn trong thông báo lỗi. */
  label?: string;
}

export interface LotNumberValidationResult {
  valid: boolean;
  message?: string;
}

export function normalizeLotNumber(
  value?: string | null,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isValidLegacyLotNumber(value: string): boolean {
  return (
    LEGACY_RANGE_RE.test(value) ||
    LEGACY_DAY_RANGE_RE.test(value) ||
    LEGACY_SINGLE_RE.test(value)
  );
}

export function validateLotNumber(
  value: string | undefined | null,
  options: LotNumberValidationOptions = {},
): LotNumberValidationResult {
  const { required = false, format = "any", label = "Số lô" } = options;
  const normalized = normalizeLotNumber(value);

  if (!normalized) {
    if (required) {
      return { valid: false, message: `${label} là bắt buộc` };
    }
    return { valid: true };
  }

  if (format === "ddmmyy") {
    if (!/^\d{6}$/.test(normalized)) {
      return {
        valid: false,
        message: `${label} phải đúng định dạng DDMMYY (6 chữ số)`,
      };
    }
    const day = Number.parseInt(normalized.slice(0, 2), 10);
    const month = Number.parseInt(normalized.slice(2, 4), 10);
    if (day < 1 || day > 31 || month < 1 || month > 12) {
      return { valid: false, message: `${label} không hợp lệ (DDMMYY)` };
    }
  }

  if (format === "legacy" && !isValidLegacyLotNumber(normalized)) {
    return {
      valid: false,
      message: `${label} không hợp lệ. Chấp nhận: ${LOT_NUMBER_LEGACY_HINT}`,
    };
  }

  return { valid: true };
}

export function validateItemsLotNumbers(
  items: Array<{ lot_number?: string | null }>,
  options: LotNumberValidationOptions = {},
  context?: string,
): LotNumberValidationResult {
  for (const [index, item] of items.entries()) {
    const result = validateLotNumber(item.lot_number, options);
    if (!result.valid) {
      const prefix =
        context ??
        (items.length > 1 ? `Dòng ${index + 1}` : undefined);
      return {
        valid: false,
        message: prefix ? `${prefix}: ${result.message}` : result.message,
      };
    }
  }
  return { valid: true };
}

export function validateGroupsLotNumbers(
  groups: Array<{ items: Array<{ lot_number?: string | null }> }>,
  options: LotNumberValidationOptions = {},
): LotNumberValidationResult {
  for (const [index, group] of groups.entries()) {
    const result = validateItemsLotNumbers(
      group.items,
      options,
      `Nhóm ${index + 1}`,
    );
    if (!result.valid) return result;
  }
  return { valid: true };
}
