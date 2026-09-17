/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_INBOUND_MANUAL_WAREHOUSES?: string;
  readonly VITE_OUTBOUND_MANUAL_WAREHOUSES?: string;
  readonly VITE_TASK_ADD_URL?: string;
  readonly VITE_TASK_ADD_MOVE_MODE?: string;
  /** "true" cho bản demo offline trong folder HTML/ (không gọi backend). */
  readonly VITE_SNAPSHOT_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
