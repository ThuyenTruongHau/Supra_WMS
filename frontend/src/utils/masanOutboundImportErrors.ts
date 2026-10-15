import type { MasanOutboundPreviewRow } from "@/types/masanOutbound";

/** Lỗi chặn import từ API parse-preview (locator, tồn, …). */
export function collectMasanOutboundImportBlockers(
  parseResult: {
    can_import?: boolean;
    import_errors?: string[];
    preview_rows?: MasanOutboundPreviewRow[];
  },
): string[] {
  const fromApi = parseResult.import_errors ?? [];
  if (fromApi.length > 0) return fromApi;

  if (parseResult.can_import === false) {
    const rowErrors = (parseResult.preview_rows ?? [])
      .map((r) => r.error?.trim())
      .filter((e): e is string => Boolean(e));
    return rowErrors.length > 0 ? [...new Set(rowErrors)] : ["Không thể import file Excel."];
  }

  return [];
}
