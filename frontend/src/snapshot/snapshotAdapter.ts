/**
 * Axios adapter cho bản demo offline: trả dữ liệu từ snapshot đã export thay vì
 * gọi mạng. Đây là điểm chặn duy nhất cần thiết, vì toàn bộ request của app đều
 * đi qua axiosInstance.
 */

import { AxiosError, AxiosHeaders } from "axios";
import type {
  AxiosAdapter,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

import {
  DEMO_STATUS_KEY,
  DEMO_UNAVAILABLE_KEY,
  getSnapshotConfig,
  recordSnapshotMiss,
} from "./snapshotConfig";
import {
  buildSnapshotKey,
  buildSnapshotPathKey,
  buildSnapshotScopeKey,
} from "./snapshotKey";

/** Độ trễ giả để UI vẫn hiện skeleton loading như bản thật. */
const SIMULATED_LATENCY_MS = 120;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Các tham số lọc mà adapter tự áp dụng phía client trên tập dữ liệu đầy đủ.
 * Chỉ lọc khi bản ghi thực sự có field tương ứng, tránh lọc oan.
 */
const EQUALITY_FILTERS = [
  "warehouse_id",
  "zone_id",
  "item_id",
  "unit_id",
  "location_id",
  "stocktake_id",
  "item_stock_id",
  "inbound_order_id",
  "outbound_order_id",
  "transaction_type",
  "status",
  "is_active",
  "code",
];

type ListShape = {
  items: unknown[];
  total: number;
  page: number;
  page_size: number;
  [key: string]: unknown;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeHeaders(): AxiosHeaders {
  const headers = new AxiosHeaders();
  headers.set("content-type", "application/json");
  headers.set("x-wms-snapshot", "1");
  return headers;
}

function makeResponse(
  config: InternalAxiosRequestConfig,
  data: unknown,
  status = 200,
): AxiosResponse {
  return {
    data,
    status,
    statusText: status === 200 ? "OK" : String(status),
    headers: makeHeaders(),
    config,
    request: null,
  };
}

function makeError(
  config: InternalAxiosRequestConfig,
  status: number,
  detail: string,
): AxiosError {
  const response = makeResponse(config, { detail }, status);
  return new AxiosError(
    detail,
    status === 404 ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_BAD_RESPONSE,
    config,
    null,
    response,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isListShape(value: unknown): value is ListShape {
  return (
    isRecord(value) &&
    Array.isArray(value.items) &&
    typeof value.total === "number"
  );
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value === "" ? null : value;
  return null;
}

function readParams(config: InternalAxiosRequestConfig): Record<string, unknown> {
  const params = isRecord(config.params) ? { ...config.params } : {};
  // url có thể đã mang sẵn query string.
  const url = config.url ?? "";
  const questionMark = url.indexOf("?");
  if (questionMark >= 0) {
    const search = new URLSearchParams(url.slice(questionMark + 1));
    search.forEach((value, key) => {
      if (!(key in params)) params[key] = value;
    });
  }
  return params;
}

function matchesSearch(row: unknown, needle: string): boolean {
  try {
    return JSON.stringify(row).toLowerCase().includes(needle);
  } catch {
    return false;
  }
}

/**
 * Cắt trang và lọc tập dữ liệu đầy đủ theo đúng tham số request, để phân trang
 * và tìm kiếm trong bản demo vẫn hoạt động thật thay vì đứng yên.
 */
function reshapeList(
  body: ListShape,
  params: Record<string, unknown>,
): ListShape {
  let items = [...body.items];
  const firstRow = items.find(isRecord);

  for (const field of EQUALITY_FILTERS) {
    const expected = toText(params[field]);
    if (expected === null) continue;
    if (!firstRow || !(field in firstRow)) continue;
    items = items.filter(
      (row) => isRecord(row) && toText(row[field]) === expected,
    );
  }

  const statuses = toText(params.statuses);
  if (statuses && firstRow && "status" in firstRow) {
    const allowed = new Set(
      statuses
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    );
    if (allowed.size > 0) {
      items = items.filter(
        (row) => isRecord(row) && allowed.has(String(row.status)),
      );
    }
  }

  const search = toText(params.q);
  if (search) {
    const needle = search.toLowerCase();
    items = items.filter((row) => matchesSearch(row, needle));
  }

  const total = items.length;
  const pageSizeText = toText(params.page_size);
  const pageText = toText(params.page);
  const pageSize = pageSizeText ? Number(pageSizeText) : body.page_size;
  const page = pageText ? Number(pageText) : 1;

  if (Number.isFinite(pageSize) && pageSize > 0) {
    const start = Math.max(0, (Math.max(1, page) - 1) * pageSize);
    items = items.slice(start, start + pageSize);
  }

  return {
    ...body,
    items,
    total,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    page_size: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : total,
  };
}

type Lookup =
  | { kind: "hit"; data: unknown; reshaped: boolean }
  | { kind: "miss" };

function lookup(
  config: InternalAxiosRequestConfig,
  method: string,
): Lookup {
  const exact = window.__WMS_SNAPSHOT__ ?? {};
  const fallback = window.__WMS_SNAPSHOT_FALLBACK__ ?? {};
  const input = {
    method,
    url: config.url,
    baseURL: config.baseURL,
    params: config.params,
  };

  // Tầng 1: khớp chính xác cả query.
  const exactKey = buildSnapshotKey(input);
  if (exactKey in exact) {
    return { kind: "hit", data: exact[exactKey], reshaped: false };
  }

  // Tầng 2: khớp theo scope (giữ warehouse_id..., bỏ phân trang và q).
  const scopeKey = buildSnapshotScopeKey(input);
  if (scopeKey in fallback) {
    return { kind: "hit", data: fallback[scopeKey], reshaped: true };
  }
  if (scopeKey in exact) {
    return { kind: "hit", data: exact[scopeKey], reshaped: true };
  }

  // Tầng 3: chỉ khớp method + path.
  const pathKey = buildSnapshotPathKey(input);
  if (pathKey in fallback) {
    return { kind: "hit", data: fallback[pathKey], reshaped: true };
  }
  if (pathKey in exact) {
    return { kind: "hit", data: exact[pathKey], reshaped: true };
  }

  recordSnapshotMiss(method, exactKey);
  return { kind: "miss" };
}

export const snapshotAdapter: AxiosAdapter = async (config) => {
  const { demoMessage } = getSnapshotConfig();
  const method = (config.method ?? "get").toUpperCase();

  await delay(SIMULATED_LATENCY_MS);

  // Upload file và tải file về không thể mô phỏng từ snapshot JSON.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    throw makeError(config, 501, demoMessage);
  }
  if (config.responseType === "blob" || config.responseType === "arraybuffer") {
    throw makeError(config, 501, demoMessage);
  }

  const found = lookup(config, method);

  if (found.kind === "hit" && isRecord(found.data)) {
    if (found.data[DEMO_UNAVAILABLE_KEY] === true) {
      throw makeError(config, 501, demoMessage);
    }
    const replayStatus = found.data[DEMO_STATUS_KEY];
    if (typeof replayStatus === "number") {
      const detail =
        toText(found.data.detail) ?? "Không tìm thấy dữ liệu trong bản demo.";
      throw makeError(config, replayStatus, detail);
    }
  }

  if (WRITE_METHODS.has(method)) {
    // Một số POST mang tính đọc đã được snapshot sẵn (vd tính toán phân bổ).
    if (found.kind === "hit" && !found.reshaped) {
      return makeResponse(config, found.data);
    }
    throw makeError(config, 501, demoMessage);
  }

  if (found.kind === "miss") {
    throw makeError(
      config,
      404,
      "Bản demo không có dữ liệu cho mục này.",
    );
  }

  if (found.reshaped && isListShape(found.data)) {
    return makeResponse(config, reshapeList(found.data, readParams(config)));
  }

  return makeResponse(config, found.data);
};
