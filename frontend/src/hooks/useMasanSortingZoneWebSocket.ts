import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { masanSortingZonePendingStockQueryKey } from "@/hooks/useMasanSortingZonePendingStock";

export const WS_EVENT_MASAN_SORTING_STOCK_READY = "masan.sorting.stock_ready";
export const WS_EVENT_MASAN_SORTING_ALLOCATION_CONFIRMED =
  "masan.sorting.allocation_confirmed";

/** BE có thể bắn hàng chục event liên tiếp — gộp thành một lần refetch. */
const INVALIDATE_DEBOUNCE_MS = 500;

function buildMasanSortingZoneWebSocketUrl(
  warehouseId: number,
  zone: string,
  token: string,
): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  const apiBase =
    import.meta.env.DEV && !configured
      ? `${window.location.protocol}//${window.location.host}`
      : configured || `${window.location.protocol}//${window.location.host}`;
  const httpUrl = new URL(apiBase);
  const wsProtocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  const params = new URLSearchParams({
    warehouse_id: String(warehouseId),
    zone,
    token,
  });
  return `${wsProtocol}//${httpUrl.host}/api/v1/ws/masan/sorting-zone?${params}`;
}

type ZoneSocket = {
  refCount: number;
  ws: WebSocket | null;
  attempt: number;
  hasConnectedOnce: boolean;
  disposed: boolean;
  reconnectTimer?: number;
  debounceTimer?: number;
};

/** Một socket cho mỗi (kho, zone, token), dùng chung giữa các component cùng mount. */
const zoneSockets = new Map<string, ZoneSocket>();

function scheduleInvalidate(
  entry: ZoneSocket,
  queryClient: QueryClient,
  warehouseId: number,
  zone: string,
) {
  if (entry.debounceTimer !== undefined) return;
  entry.debounceTimer = window.setTimeout(() => {
    entry.debounceTimer = undefined;
    if (entry.disposed) return;
    void queryClient.invalidateQueries(
      {
        queryKey: masanSortingZonePendingStockQueryKey(warehouseId, zone),
        refetchType: "active",
      },
      { cancelRefetch: false },
    );
  }, INVALIDATE_DEBOUNCE_MS);
}

function openZoneSocket(
  entry: ZoneSocket,
  queryClient: QueryClient,
  warehouseId: number,
  zone: string,
  token: string,
) {
  if (entry.disposed) return;
  const ws = new WebSocket(
    buildMasanSortingZoneWebSocketUrl(warehouseId, zone, token),
  );
  entry.ws = ws;

  ws.onopen = () => {
    entry.attempt = 0;
    // Reconnect có thể đã bỏ lỡ event trong lúc mất kết nối.
    if (entry.hasConnectedOnce) {
      scheduleInvalidate(entry, queryClient, warehouseId, zone);
    }
    entry.hasConnectedOnce = true;
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data as string) as { type?: string };
      if (
        data.type === WS_EVENT_MASAN_SORTING_STOCK_READY ||
        data.type === WS_EVENT_MASAN_SORTING_ALLOCATION_CONFIRMED
      ) {
        scheduleInvalidate(entry, queryClient, warehouseId, zone);
      }
    } catch {
      /* ignore */
    }
  };

  ws.onclose = () => {
    entry.ws = null;
    if (entry.disposed) return;
    entry.attempt += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(entry.attempt, 5));
    entry.reconnectTimer = window.setTimeout(() => {
      entry.reconnectTimer = undefined;
      openZoneSocket(entry, queryClient, warehouseId, zone, token);
    }, delay);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function disposeZoneSocket(entry: ZoneSocket) {
  entry.disposed = true;
  if (entry.reconnectTimer !== undefined) {
    window.clearTimeout(entry.reconnectTimer);
  }
  if (entry.debounceTimer !== undefined) {
    window.clearTimeout(entry.debounceTimer);
  }
  const socket = entry.ws;
  entry.ws = null;
  if (!socket) return;
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.onopen = () => socket.close();
  } else if (socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
}

type UseMasanSortingZoneWebSocketOptions = {
  warehouseId: number;
  ccZoneCode: string | null;
  enabled: boolean;
};

export function useMasanSortingZoneWebSocket({
  warehouseId,
  ccZoneCode,
  enabled,
}: UseMasanSortingZoneWebSocketOptions) {
  const accessToken = useAuthStore((s) => s.access_token);
  const queryClient = useQueryClient();
  const zone = ccZoneCode?.trim() ?? "";

  useEffect(() => {
    if (!enabled || warehouseId <= 0 || !zone || !accessToken) {
      return;
    }

    const key = `${warehouseId}:${zone}:${accessToken}`;
    let entry = zoneSockets.get(key);
    if (!entry) {
      entry = {
        refCount: 0,
        ws: null,
        attempt: 0,
        hasConnectedOnce: false,
        disposed: false,
      };
      zoneSockets.set(key, entry);
      openZoneSocket(entry, queryClient, warehouseId, zone, accessToken);
    }
    entry.refCount += 1;

    return () => {
      const current = zoneSockets.get(key);
      if (!current) return;
      current.refCount -= 1;
      if (current.refCount > 0) return;
      zoneSockets.delete(key);
      disposeZoneSocket(current);
    };
  }, [enabled, warehouseId, zone, accessToken, queryClient]);
}
