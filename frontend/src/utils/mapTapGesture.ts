/** Cửa sổ (ms) giữa hai tap cùng vùng chọn để coi là “2 click”. */
export const MAP_TAP_DOUBLE_WINDOW_MS = 450;

export function columnSelectionKey(payload: {
  columnLocationCodes?: string[];
  locationCode: string;
}): string {
  const codes = payload.columnLocationCodes?.length
    ? payload.columnLocationCodes
    : [payload.locationCode];
  return [...codes].sort().join("|");
}

/** Manual: theo từng ô · Auto: theo cả cột. */
export function mapTapSelectionKey(
  payload: {
    columnLocationCodes?: string[];
    locationCode: string;
  },
  mode: "auto" | "manual",
): string {
  if (mode === "manual") return payload.locationCode;
  return columnSelectionKey(payload);
}

export function columnCodesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((code, index) => code === sortedB[index]);
}
