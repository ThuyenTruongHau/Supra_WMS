import type { QrCodePreviewResponse } from "@/types/inboundOrder";
import type { FeBatchEntry, FeBatchQrKind, FeBatchQueues } from "./feBatchScanTypes";

export function entryFromPreview(preview: QrCodePreviewResponse): FeBatchEntry {
  return { ...preview };
}

/** Accept persisted queue rows from older sessions that stored a subset of preview fields. */
export function normalizeFeBatchEntry(raw: unknown): FeBatchEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const entry = raw as Partial<FeBatchEntry>;
  if (
    entry.qr_code_id == null ||
    !entry.code?.trim() ||
    entry.item_id == null ||
    !entry.item_sku ||
    !entry.qr_type
  ) {
    return null;
  }
  return {
    qr_code_id: entry.qr_code_id,
    code: entry.code,
    item_id: entry.item_id,
    item_sku: entry.item_sku,
    item_name: entry.item_name ?? "",
    quantity: entry.quantity ?? 1,
    unit_id: entry.unit_id ?? 0,
    unit_name: entry.unit_name ?? "",
    lot_number: entry.lot_number ?? "",
    cavity_numbers: Array.isArray(entry.cavity_numbers) ? entry.cavity_numbers : [],
    cavity_number: entry.cavity_number ?? null,
    qr_type: entry.qr_type,
    manufacturing_user: entry.manufacturing_user ?? null,
    manufacturing_machine: entry.manufacturing_machine ?? null,
    qc_user: entry.qc_user ?? null,
    packing_user: entry.packing_user ?? null,
    is_split: entry.is_split ?? false,
    linked_packs: entry.linked_packs,
  };
}

export function normalizeFeBatchQueue(raw: unknown): FeBatchEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => normalizeFeBatchEntry(item))
    .filter((item): item is FeBatchEntry => item != null);
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
