export const LOT_NUMBER_LEGACY_HINT =
  "DDMMYY, DDMMYY-DDMMYY, DD-DDMMYY, DD/MM/YY, DD/MM/YY-DD/MM/YY, hoặc DD-DD/MM/YY " +
  "(vd: 040526, 040526-050526, 04-050826, 19/08/26, 30/07/26-01/08/26, 09-10/04/26)";

const COMPACT6 = String.raw`\d{6}`;
const SLASH_DATE = String.raw`\d{2}/\d{2}/\d{2}`;
const COMPACT_RANGE_RE = new RegExp(`^(${COMPACT6})-(${COMPACT6})$`);
const COMPACT_DAY_RANGE_RE = /^(\d{1,2})-(\d{1,2})(\d{4})$/;
const COMPACT_SINGLE_RE = new RegExp(`^(${COMPACT6})$`);
const SLASH_RANGE_RE = new RegExp(`^(${SLASH_DATE})-(${SLASH_DATE})$`);
const SLASH_DAY_RANGE_RE = /^(\d{1,2})-(\d{1,2})\/(\d{2})\/(\d{2})$/;
const SLASH_SINGLE_RE = new RegExp(`^(${SLASH_DATE})$`);

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

function validateDdmmyy(compact: string): void {
  const day = Number.parseInt(compact.slice(0, 2), 10);
  const month = Number.parseInt(compact.slice(2, 4), 10);
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    throw new LegacyLotNumberError();
  }
}

function toCompact(dd: string, mm: string, yy: string): string {
  const compact = `${Number.parseInt(dd, 10).toString().padStart(2, "0")}${mm}${yy}`;
  validateDdmmyy(compact);
  return compact;
}

function slashToCompact(slash: string): string {
  const [dd, mm, yy] = slash.split("/");
  return toCompact(dd, mm, yy);
}

/** Mirror backend parse_legacy_lot_number — always returns compact DDMMYY. */
export function parseLegacyLotNumber(value: string): LegacyLotBounds {
  const s = value.trim();
  if (!s) {
    throw new LegacyLotNumberError();
  }

  let match = COMPACT_RANGE_RE.exec(s);
  if (match) {
    validateDdmmyy(match[1]);
    validateDdmmyy(match[2]);
    return { from: match[1], to: match[2] };
  }

  match = COMPACT_DAY_RANGE_RE.exec(s);
  if (match) {
    const mm = match[3].slice(0, 2);
    const yy = match[3].slice(2, 4);
    return {
      from: toCompact(match[1], mm, yy),
      to: toCompact(match[2], mm, yy),
    };
  }

  match = COMPACT_SINGLE_RE.exec(s);
  if (match) {
    validateDdmmyy(match[1]);
    return { from: match[1], to: match[1] };
  }

  match = SLASH_RANGE_RE.exec(s);
  if (match) {
    return {
      from: slashToCompact(match[1]),
      to: slashToCompact(match[2]),
    };
  }

  match = SLASH_DAY_RANGE_RE.exec(s);
  if (match) {
    return {
      from: toCompact(match[1], match[3], match[4]),
      to: toCompact(match[2], match[3], match[4]),
    };
  }

  match = SLASH_SINGLE_RE.exec(s);
  if (match) {
    const compact = slashToCompact(s);
    return { from: compact, to: compact };
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

function parseLotDate(value: string): Date {
  if (value.includes("/")) {
    const [dd, mm, yy] = value.split("/");
    return new Date(
      2000 + Number.parseInt(yy, 10),
      Number.parseInt(mm, 10) - 1,
      Number.parseInt(dd, 10),
    );
  }
  return new Date(
    2000 + Number.parseInt(value.slice(4, 6), 10),
    Number.parseInt(value.slice(2, 4), 10) - 1,
    Number.parseInt(value.slice(0, 2), 10),
  );
}

function compareLotDates(a: string, b: string): number {
  return parseLotDate(a).getTime() - parseLotDate(b).getTime();
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
    if (!minFrom || compareLotDates(from, minFrom) < 0) {
      minFrom = from;
    }
    if (!maxTo || compareLotDates(to, maxTo) > 0) {
      maxTo = to;
    }
  }

  const formatted = formatLotNumberDisplay(minFrom, maxTo);
  if (!formatted) {
    throw new LegacyLotNumberError("lot_number is required");
  }
  return formatted;
}

export function isValidLegacyLotNumber(value: string): boolean {
  try {
    parseLegacyLotNumber(value);
    return true;
  } catch {
    return false;
  }
}
