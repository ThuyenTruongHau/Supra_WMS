import {
  validateLotNumber,
  type LotNumberValidationResult,
} from "@/utils/lotNumberValidation";
import { parseLegacyLotNumber } from "@/utils/legacyLotNumber";

/** Chuẩn hóa ô LOT Excel (text hoặc số) trước khi validate / gửi API. */
export function normalizeMasanExcelLotInput(
  raw: unknown,
): string | null {
  if (raw == null || raw === "") return null;
  let s = String(raw).trim();
  if (!s) return null;
  if (/^\d+\.0+$/.test(s)) {
    s = s.split(".")[0] ?? s;
  }
  try {
    const { from, to } = parseLegacyLotNumber(s);
    if (from === to) {
      return from;
    }
  } catch {
    /* giữ chuỗi gốc để validate báo lỗi khoảng lô */
  }
  if (/^\d{5}$/.test(s)) {
    const padded = `0${s}`;
    if (validateLotNumber(padded, { format: "ddmmyy" }).valid) {
      return padded;
    }
  }
  return s;
}

export function validateMasanExcelLot(
  raw: unknown,
  options: { required?: boolean } = {},
): LotNumberValidationResult {
  const normalized = normalizeMasanExcelLotInput(raw);
  return validateLotNumber(normalized, {
    required: options.required ?? false,
    format: "ddmmyy",
    label: "LOT",
  });
}

export function collectMasanExcelLotErrors(
  rows: Array<{ row_no: number; lot?: unknown; lot_number?: unknown }>,
): string[] {
  const errors: string[] = [];
  for (const row of rows) {
    const raw = row.lot ?? row.lot_number;
    if (raw == null || String(raw).trim() === "") continue;
    const result = validateMasanExcelLot(raw);
    if (!result.valid && result.message) {
      errors.push(`Dòng ${row.row_no}: ${result.message}`);
    }
  }
  return errors;
}
