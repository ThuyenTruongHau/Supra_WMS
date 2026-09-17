import { useCallback, useEffect, useState } from "react";
import {
  addEntry,
  removeEntry,
} from "./feBatchScanUtils";
import {
  EMPTY_FE_BATCH_QUEUES,
  type FeBatchEntry,
  type FeBatchQrKind,
  type FeBatchQueues,
  type FeBatchSendProgress,
} from "./feBatchScanTypes";

const SESSION_STORAGE_KEY = "qrtablet:fe-batch-queues";

function readPersistedQueues(): FeBatchQueues {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return EMPTY_FE_BATCH_QUEUES;
    }
    const parsed = JSON.parse(raw) as FeBatchQueues;
    return {
      product: Array.isArray(parsed.product) ? parsed.product : [],
      pack: Array.isArray(parsed.pack) ? parsed.pack : [],
    };
  } catch {
    return EMPTY_FE_BATCH_QUEUES;
  }
}

function persistQueues(queues: FeBatchQueues): void {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(queues));
  } catch {
    // ignore storage failures
  }
}

export function useFeBatchScanQueue(selectedWarehouseId: number | null | undefined) {
  const [collectMode, setCollectMode] = useState(false);
  const [queues, setQueues] = useState<FeBatchQueues>(() => readPersistedQueues());
  const [sendProgress, setSendProgress] = useState<FeBatchSendProgress | null>(
    null,
  );
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    persistQueues(queues);
  }, [queues]);

  useEffect(() => {
    setQueues(EMPTY_FE_BATCH_QUEUES);
    setCollectMode(false);
    setSendProgress(null);
    setIsSending(false);
  }, [selectedWarehouseId]);

  const toggleCollectMode = useCallback(() => {
    setCollectMode((prev) => !prev);
  }, []);

  const addToQueue = useCallback((kind: FeBatchQrKind, entry: FeBatchEntry) => {
    let added = false;
    let duplicate = false;
    let newCount = 0;
    setQueues((prev) => {
      const result = addEntry(prev[kind], entry);
      added = result.added;
      duplicate = result.duplicate;
      newCount = result.queue.length;
      if (!result.added) {
        newCount = prev[kind].length;
        return prev;
      }
      return { ...prev, [kind]: result.queue };
    });
    return { added, duplicate, newCount };
  }, []);

  const removeFromQueue = useCallback((kind: FeBatchQrKind, qrCodeId: number) => {
    setQueues((prev) => ({
      ...prev,
      [kind]: removeEntry(prev[kind], qrCodeId),
    }));
  }, []);

  const clearQueue = useCallback((kind?: FeBatchQrKind) => {
    if (!kind) {
      setQueues(EMPTY_FE_BATCH_QUEUES);
      return;
    }
    setQueues((prev) => ({ ...prev, [kind]: [] }));
  }, []);

  const clearAllQueues = useCallback(() => {
    setQueues(EMPTY_FE_BATCH_QUEUES);
  }, []);

  const removeSucceededFromQueue = useCallback(
    (kind: FeBatchQrKind, codes: string[]) => {
      if (codes.length === 0) {
        return;
      }
      const codeSet = new Set(codes);
      setQueues((prev) => ({
        ...prev,
        [kind]: prev[kind].filter((entry) => !codeSet.has(entry.code)),
      }));
    },
    [],
  );

  const beginSending = useCallback((total: number) => {
    setIsSending(true);
    setSendProgress({ current: 0, total });
  }, []);

  const updateSendProgress = useCallback((progress: FeBatchSendProgress) => {
    setSendProgress(progress);
  }, []);

  const finishSending = useCallback(() => {
    setIsSending(false);
    setSendProgress(null);
  }, []);

  return {
    collectMode,
    setCollectMode,
    toggleCollectMode,
    queues,
    addToQueue,
    removeFromQueue,
    clearQueue,
    clearAllQueues,
    removeSucceededFromQueue,
    sendProgress,
    isSending,
    beginSending,
    updateSendProgress,
    finishSending,
  };
}
