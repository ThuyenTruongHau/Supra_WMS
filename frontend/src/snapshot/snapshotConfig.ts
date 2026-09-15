/**
 * Cấu hình cho bản demo offline (folder HTML/).
 *
 * Snapshot mode được bật lúc build qua VITE_SNAPSHOT_MODE. Dữ liệu runtime đến
 * từ các thẻ <script> cổ điển trong index.html, không qua fetch, vì browser
 * chặn fetch trên giao thức file://.
 */

export type SnapshotAuth = {
  access_token: string;
  refresh_token: string | null;
  username: string;
  role: string;
  role_canonical: string;
};

export type SnapshotRuntimeConfig = {
  mode: string;
  auth: SnapshotAuth;
  defaultWarehouseId: number;
  allowMutations: boolean;
  demoMessage: string;
};

export type SnapshotMiss = {
  method: string;
  key: string;
  at: string;
};

declare global {
  interface Window {
    __WMS_CONFIG__?: Partial<SnapshotRuntimeConfig> & {
      auth?: Partial<SnapshotAuth>;
    };
    __WMS_SNAPSHOT__?: Record<string, unknown>;
    __WMS_SNAPSHOT_FALLBACK__?: Record<string, unknown>;
    __WMS_SNAPSHOT_MANIFEST__?: Record<string, unknown>;
    __WMS_SNAPSHOT_MISSES__?: SnapshotMiss[];
  }
}

export const SNAPSHOT_MODE = import.meta.env.VITE_SNAPSHOT_MODE === "true";

const DEFAULT_CONFIG: SnapshotRuntimeConfig = {
  mode: "snapshot",
  auth: {
    access_token: "demo",
    refresh_token: null,
    username: "demo.admin",
    role: "Admin",
    role_canonical: "A001",
  },
  defaultWarehouseId: 1,
  allowMutations: false,
  demoMessage: "Chế độ demo — chức năng này chưa hoạt động.",
};

export function getSnapshotConfig(): SnapshotRuntimeConfig {
  const raw = typeof window === "undefined" ? undefined : window.__WMS_CONFIG__;
  if (!raw) return DEFAULT_CONFIG;
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    auth: { ...DEFAULT_CONFIG.auth, ...(raw.auth ?? {}) },
  };
}

/** Marker do script export ghi ra cho các endpoint trả về file binary. */
export const DEMO_UNAVAILABLE_KEY = "__demo_unavailable__";

/** Marker cho các response 404 hợp lệ đã được ghi lại lúc export. */
export const DEMO_STATUS_KEY = "__demo_status__";

export function recordSnapshotMiss(method: string, key: string): void {
  if (typeof window === "undefined") return;
  const misses = (window.__WMS_SNAPSHOT_MISSES__ =
    window.__WMS_SNAPSHOT_MISSES__ || []);
  misses.push({ method, key, at: new Date().toISOString() });
  if (import.meta.env.DEV) {
    console.warn(`[snapshot] thiếu dữ liệu cho: ${key}`);
  }
}
