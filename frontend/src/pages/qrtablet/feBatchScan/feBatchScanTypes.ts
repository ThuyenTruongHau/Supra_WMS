import type { QrCodePreviewResponse } from "@/types/inboundOrder";

export type FeBatchQrKind = "product" | "pack";

/** Full preview payload returned by the backend when collecting QR scans. */
export type FeBatchEntry = QrCodePreviewResponse;

export type FeBatchQueues = {
  product: FeBatchEntry[];
  pack: FeBatchEntry[];
};

export const EMPTY_FE_BATCH_QUEUES: FeBatchQueues = {
  product: [],
  pack: [],
};

export type FeBatchSendProgress = {
  current: number;
  total: number;
};

export type FeBatchSubmitFailure = {
  code: string;
  error: string;
};

export type FeBatchSubmitResult = {
  succeeded: string[];
  failed: FeBatchSubmitFailure[];
};
