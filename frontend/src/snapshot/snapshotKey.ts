/**
 * Sinh khoá tra cứu cho snapshot demo offline.
 *
 * Định dạng: "<METHOD> <pathname>" hoặc "<METHOD> <pathname>?<query đã sort>"
 *
 * Logic ở đây phải khớp từng ký tự với build_key() trong
 * Supra_WMS/backend/scripts/export_demo_snapshot.py, nếu lệch thì mọi request
 * trong bản demo sẽ miss snapshot.
 */

/** Origin giả, chỉ để URL tương đối parse được. Không bao giờ bị request. */
const DUMMY_ORIGIN = "http://snapshot.local";

type QueryPair = [string, string];

/** Giống encodeURIComponent: không escape A-Z a-z 0-9 - _ . ! ~ * ' ( ) */
function encodeComponent(value: string): string {
  return encodeURIComponent(value);
}

function scalarToString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  if (typeof value === "string") {
    return value === "" ? null : value;
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function collectPairs(params: unknown): QueryPair[] {
  if (!params || typeof params !== "object") return [];
  const pairs: QueryPair[] = [];
  for (const [key, raw] of Object.entries(params as Record<string, unknown>)) {
    if (Array.isArray(raw)) {
      for (const element of raw) {
        const text = scalarToString(element);
        if (text !== null) pairs.push([key, text]);
      }
      continue;
    }
    const text = scalarToString(raw);
    if (text !== null) pairs.push([key, text]);
  }
  return pairs;
}

function sortPairs(pairs: QueryPair[]): QueryPair[] {
  return [...pairs].sort((left, right) => {
    if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1;
    if (left[1] === right[1]) return 0;
    return left[1] < right[1] ? -1 : 1;
  });
}

function serializeQuery(pairs: QueryPair[]): string {
  return sortPairs(pairs)
    .map(([key, value]) => `${encodeComponent(key)}=${encodeComponent(value)}`)
    .join("&");
}

/** Tách url (có thể tương đối hoặc tuyệt đối) thành pathname và query pairs. */
function splitUrl(
  url: string | undefined,
  baseURL: string | undefined,
): { pathname: string; pairs: QueryPair[] } {
  const target = url ?? "/";
  let base = DUMMY_ORIGIN;
  if (baseURL) {
    try {
      base = new URL(baseURL, DUMMY_ORIGIN).toString();
    } catch {
      base = DUMMY_ORIGIN;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(target, base);
  } catch {
    return { pathname: target, pairs: [] };
  }

  const pairs: QueryPair[] = [];
  parsed.searchParams.forEach((value, key) => {
    if (value !== "") pairs.push([key, value]);
  });

  return { pathname: parsed.pathname, pairs };
}

export type SnapshotKeyInput = {
  method?: string;
  url?: string;
  baseURL?: string;
  params?: unknown;
};

/** Khoá đầy đủ, bao gồm query. */
export function buildSnapshotKey(input: SnapshotKeyInput): string {
  const method = (input.method ?? "get").toUpperCase();
  const { pathname, pairs } = splitUrl(input.url, input.baseURL);
  const query = serializeQuery([...pairs, ...collectPairs(input.params)]);
  return query ? `${method} ${pathname}?${query}` : `${method} ${pathname}`;
}

/**
 * Tham số phân trang và tìm kiếm bị loại khỏi khoá scope: snapshot lưu tập dữ
 * liệu đầy đủ theo scope, còn việc cắt trang và lọc do adapter làm phía client.
 */
const PAGINATION_PARAMS = new Set(["page", "page_size"]);
const SEARCH_PARAMS = new Set(["q"]);

/**
 * Khoá scope: giữ các tham số xác định phạm vi dữ liệu (warehouse_id,
 * stocktake_id...) nhưng bỏ phân trang và từ khoá tìm kiếm. Nhờ vậy nhiều kho
 * không ghi đè lẫn nhau trong map fallback.
 */
export function buildSnapshotScopeKey(input: SnapshotKeyInput): string {
  const method = (input.method ?? "get").toUpperCase();
  const { pathname, pairs } = splitUrl(input.url, input.baseURL);
  const scoped = [...pairs, ...collectPairs(input.params)].filter(
    ([key]) => !PAGINATION_PARAMS.has(key) && !SEARCH_PARAMS.has(key),
  );
  const query = serializeQuery(scoped);
  return query ? `${method} ${pathname}?${query}` : `${method} ${pathname}`;
}

/** Khoá rút gọn, bỏ toàn bộ query — tầng fallback cuối cùng. */
export function buildSnapshotPathKey(input: SnapshotKeyInput): string {
  const method = (input.method ?? "get").toUpperCase();
  const { pathname } = splitUrl(input.url, input.baseURL);
  return `${method} ${pathname}`;
}
