/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_INBOUND_MANUAL_WAREHOUSES?: string;
  readonly VITE_OUTBOUND_MANUAL_WAREHOUSES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
