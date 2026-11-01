import type {
  MasanOutboundPreviewRow,
  MasanOutboundStockShortage,
} from "@/types/masanOutbound";

export function formatMasanOutboundStockShortageLine(
  row: MasanOutboundStockShortage,
): string {
  return `Mã ${row.sku}: trong kho còn ${row.on_hand}, file cần ${row.demanded}, thiếu ${row.shortage}`;
}

export type MasanOutboundParseBlockerInput = {
  can_import?: boolean;
  import_errors?: string[];
  stock_shortages?: MasanOutboundStockShortage[];
  preview_rows?: MasanOutboundPreviewRow[];
};

/** Lỗi chặn import từ API parse-preview (locator, tồn, …). */
export function collectMasanOutboundImportBlockers(
  parseResult: MasanOutboundParseBlockerInput,
): string[] {
  const fromApi = parseResult.import_errors ?? [];
  if (fromApi.length > 0) return fromApi;

  const shortages = parseResult.stock_shortages ?? [];
  if (shortages.length > 0) {
    return shortages.map(formatMasanOutboundStockShortageLine);
  }

  if (parseResult.can_import === false) {
    const rowErrors = (parseResult.preview_rows ?? [])
      .map((r) => r.error?.trim())
      .filter((e): e is string => Boolean(e));
    return rowErrors.length > 0 ? [...new Set(rowErrors)] : ["Không thể import file Excel."];
  }

  return [];
}

const LOCATOR_IMPORT_ERROR_PREFIX = /^Dòng \d+:/;

export function hasMasanLocatorImportErrors(
  parseResult: MasanOutboundParseBlockerInput,
): boolean {
  return (parseResult.import_errors ?? []).some((line) =>
    LOCATOR_IMPORT_ERROR_PREFIX.test(line),
  );
}

/** Chỉ thiếu tồn (không Locator) — có thể chọn Nhập phiên. */
export function isMasanStockShortageWarning(
  parseResult: MasanOutboundParseBlockerInput,
): boolean {
  return (
    (parseResult.stock_shortages?.length ?? 0) > 0 &&
    !hasMasanLocatorImportErrors(parseResult)
  );
}

export function isMasanOutboundImportBlocked(
  parseResult: MasanOutboundParseBlockerInput,
): boolean {
  if (hasMasanLocatorImportErrors(parseResult)) {
    return true;
  }
  if (parseResult.can_import === false && !isMasanStockShortageWarning(parseResult)) {
    return true;
  }
  return (
    collectMasanOutboundImportBlockers(parseResult).length > 0 &&
    !isMasanStockShortageWarning(parseResult)
  );
}
