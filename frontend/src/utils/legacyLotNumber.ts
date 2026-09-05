import { LOT_NUMBER_LEGACY_HINT } from "@/utils/lotNumberValidation";

const LEGACY_DATE = String.raw`\d{2}/\d{2}/\d{2}`;
const LEGACY_RANGE_RE = new RegExp(`^(${LEGACY_DATE})-(${LEGACY_DATE})$`);
const LEGACY_DAY_RANGE_RE = /^(\d{1,2})-(\d{1,2})\/(\d{2})\/(\d{2})$/;
const LEGACY_SINGLE_RE = new RegExp(`^(${LEGACY_DATE})$`);

export interface LegacyLotBounds {
  from: string;
  to: string;
}

export class LegacyLotNumberError extends Error {
  constructor(message?: string) {
    super(
      message ??
        `lot_number không hợp lệ. Chấp nhận: ${LOT_NUMBER_LEGACY_HINT}`,
    );
    this.name = "LegacyLotNumberError";
  }
}

/** Mirror backend parse_legacy_lot_number. */
export function parseLegacyLotNumber(value: string): LegacyLotBounds {
  const s = value.trim();

  const rangeMatch = LEGACY_RANGE_RE.exec(s);
  if (rangeMatch) {
    return { from: rangeMatch[1], to: rangeMatch[2] };
  }

  const dayRangeMatch = LEGACY_DAY_RANGE_RE.exec(s);
  if (dayRangeMatch) {
    const d1 = Number.parseInt(dayRangeMatch[1], 10);
    const d2 = Number.parseInt(dayRangeMatch[2], 10);
    const mm = dayRangeMatch[3];
    const yy = dayRangeMatch[4];
    return {
      from: `${String(d1).padStart(2, "0")}/${mm}/${yy}`,
      to: `${String(d2).padStart(2, "0")}/${mm}/${yy}`,
    };
  }

  const singleMatch = LEGACY_SINGLE_RE.exec(s);
  if (singleMatch) {
    return { from: s, to: s };
  }

  throw new LegacyLotNumberError();
}

/** Mirror backend format_lot_number_display. */
export function formatLotNumberDisplay(
  lotNumberFrom: string | null | undefined,
  lotNumberTo: string | null | undefined,
): string | null {
  if (!lotNumberFrom && !lotNumberTo) {
    return null;
  }
  if (
    lotNumberFrom &&
    lotNumberTo &&
    lotNumberFrom !== lotNumberTo
  ) {
    return `${lotNumberFrom}-${lotNumberTo}`;
  }
  return lotNumberFrom || lotNumberTo || null;
}

function parseLegacyLotDate(value: string): Date {
  const [dd, mm, yy] = value.split("/");
  return new Date(
    2000 + Number.parseInt(yy, 10),
    Number.parseInt(mm, 10) - 1,
    Number.parseInt(dd, 10),
  );
}

function compareLegacyLotDates(a: string, b: string): number {
  return parseLegacyLotDate(a).getTime() - parseLegacyLotDate(b).getTime();
}

/** Min from / max to across all pack lots. */
export function aggregateLotNumbers(lots: string[]): string {
  if (lots.length === 0) {
    throw new LegacyLotNumberError("lot_number is required");
  }

  let minFrom: string | null = null;
  let maxTo: string | null = null;

  for (const lot of lots) {
    const { from, to } = parseLegacyLotNumber(lot);
    if (!minFrom || compareLegacyLotDates(from, minFrom) < 0) {
      minFrom = from;
    }
    if (!maxTo || compareLegacyLotDates(to, maxTo) > 0) {
      maxTo = to;
    }
  }

  const formatted = formatLotNumberDisplay(minFrom, maxTo);
  if (!formatted) {
    throw new LegacyLotNumberError("lot_number is required");
  }
  return formatted;
}
