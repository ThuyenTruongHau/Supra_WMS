import type { QrCodePreviewResponse } from "@/types/inboundOrder";
import type { FeBatchEntry, FeBatchQrKind, FeBatchQueues } from "./feBatchScanTypes";

export function entryFromPreview(preview: QrCodePreviewResponse): FeBatchEntry {
  return {
    qr_code_id: preview.qr_code_id,
    code: preview.code,
    item_id: preview.item_id,
    item_sku: preview.item_sku,
    item_name: preview.item_name,
    qr_type: preview.qr_type,
  };
}

export function kindForPreview(
  preview: QrCodePreviewResponse,
): FeBatchQrKind | "transit" | "unsupported" {
  const normalized = (preview.qr_type ?? "item").trim().toLowerCase();
  if (normalized === "item") {
    return "product";
  }
  if (normalized === "pack") {
    return "pack";
  }
  if (normalized === "transit") {
    return "transit";
  }
  return "unsupported";
}

export function addEntry(
  queue: FeBatchEntry[],
  entry: FeBatchEntry,
): { queue: FeBatchEntry[]; added: boolean; duplicate: boolean } {
  if (queue.some((item) => item.qr_code_id === entry.qr_code_id)) {
    return { queue, added: false, duplicate: true };
  }
  return { queue: [...queue, entry], added: true, duplicate: false };
}

export function removeEntry(
  queue: FeBatchEntry[],
  qrCodeId: number,
): FeBatchEntry[] {
  return queue.filter((item) => item.qr_code_id !== qrCodeId);
}

export function removeEntriesByCodes(
  queues: FeBatchQueues,
  kind: FeBatchQrKind,
  codes: string[],
): FeBatchQueues {
  const codeSet = new Set(codes);
  return {
    ...queues,
    [kind]: queues[kind].filter((entry) => !codeSet.has(entry.code)),
  };
}

export function resolveBatchTargets(
  queue: FeBatchEntry[],
  currentCode?: string | null,
): string[] {
  const cachedCodes = queue.map((entry) => entry.code);
  if (cachedCodes.length === 0) {
    return currentCode?.trim() ? [currentCode.trim()] : [];
  }
  const normalizedCurrent = currentCode?.trim();
  if (!normalizedCurrent || cachedCodes.includes(normalizedCurrent)) {
    return cachedCodes;
  }
  return [...cachedCodes, normalizedCurrent];
}

export function totalQueueCount(queues: FeBatchQueues): number {
  return queues.product.length + queues.pack.length;
}

export function countBatchSubmitTargets(
  queue: FeBatchEntry[],
  currentCode?: string | null,
): number {
  return resolveBatchTargets(queue, currentCode).length;
}
