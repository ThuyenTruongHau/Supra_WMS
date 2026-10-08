import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/useAuthStore";
import { masanSortingZonePendingStockQueryKey } from "@/hooks/useMasanSortingZonePendingStock";

export const WS_EVENT_MASAN_SORTING_STOCK_READY = "masan.sorting.stock_ready";
export const WS_EVENT_MASAN_SORTING_ALLOCATION_CONFIRMED =
  "masan.sorting.allocation_confirmed";

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

    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let unmounted = false;
    let attempt = 0;

    const invalidatePending = () => {
      void queryClient.invalidateQueries({
        queryKey: masanSortingZonePendingStockQueryKey(warehouseId, zone),
      });
    };

    const connect = () => {
      if (unmounted) return;
      const url = buildMasanSortingZoneWebSocketUrl(
        warehouseId,
        zone,
        accessToken,
      );
      ws = new WebSocket(url);

      ws.onopen = () => {
        attempt = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { type?: string };
          if (data.type === "heartbeat") return;
          if (
            data.type === WS_EVENT_MASAN_SORTING_STOCK_READY ||
            data.type === WS_EVENT_MASAN_SORTING_ALLOCATION_CONFIRMED
          ) {
            invalidatePending();
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        ws = null;
        if (unmounted) return;
        attempt += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
        reconnectTimer = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      const socket = ws;
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
    };
  }, [enabled, warehouseId, zone, accessToken, queryClient]);
}
