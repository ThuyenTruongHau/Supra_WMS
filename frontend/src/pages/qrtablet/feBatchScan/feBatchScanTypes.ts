export type FeBatchQrKind = "product" | "pack";

export type FeBatchEntry = {
  qr_code_id: number;
  code: string;
  item_id: number;
  item_sku: string;
  item_name: string;
  qr_type: string;
};

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
