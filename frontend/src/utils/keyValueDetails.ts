export interface KeyValueEntry {
  id: string;
  key: string;
  value: string;
}

let entrySeq = 0;

export function nextKeyValueEntryId(prefix = "kv"): string {
  return `${prefix}-${Date.now()}-${entrySeq++}`;
}

export function createEmptyKeyValueEntry(): KeyValueEntry {
  return { id: nextKeyValueEntryId(), key: "", value: "" };
}

export function detailsToEntries(
  details?: Record<string, unknown> | null,
): KeyValueEntry[] {
  return Object.entries(details ?? {})
    .filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        typeof value !== "object",
    )
    .map(([key, value]) => ({
      id: nextKeyValueEntryId(),
      key,
      value: String(value),
    }));
}

export function entriesToDetails(
  entries: KeyValueEntry[],
): Record<string, string> {
  return Object.fromEntries(
    entries
      .map(({ key, value }) => [key.trim(), value.trim()] as const)
      .filter(([key]) => key.length > 0),
  );
}
