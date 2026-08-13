/** Parse BE quantity (number or decimal string e.g. "50.000") to integer. */
export function parseQuantity(
  value: number | string | null | undefined,
): number {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? Math.trunc(num) : 0;
}

/** Display stock quantity as integer with vi-VN grouping. */
export function formatQuantity(
  value: number | string | null | undefined,
  fallback = "—",
): string {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num).toLocaleString("vi-VN", {
    maximumFractionDigits: 0,
  });
}
