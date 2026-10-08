import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";

export const WS_EVENT_ROBOT_TASK_COMPLETED = "robot.task.completed";

export type RobotTaskCompletedMessage = {
  type: typeof WS_EVENT_ROBOT_TASK_COMPLETED;
  warehouse_id: number;
  order_id: string;
  flow: "inbound" | "outbound";
  timestamp?: string;
};

function buildWarehouseWebSocketUrl(
  warehouseId: number,
  token: string,
): string {
  const configured = import.meta.env.VITE_API_URL?.trim();
  // Dev: luôn qua origin (Vite proxy ws:true) — tránh WS thẳng backend bị 403 handshake.
  const apiBase =
    import.meta.env.DEV && !configured
      ? `${window.location.protocol}//${window.location.host}`
      : configured || `${window.location.protocol}//${window.location.host}`;
  const httpUrl = new URL(apiBase);
  const wsProtocol = httpUrl.protocol === "https:" ? "wss:" : "ws:";
  const path = `/api/v1/ws/warehouse/${warehouseId}`;
  return `${wsProtocol}//${httpUrl.host}${path}?token=${encodeURIComponent(token)}`;
}

type UseWarehouseWebSocketOptions = {
  warehouseId: number;
  onRobotCompleted?: (warehouseId: number, message: RobotTaskCompletedMessage) => void;
};

export function useWarehouseWebSocket({
  warehouseId,
  onRobotCompleted,
}: UseWarehouseWebSocketOptions) {
  const accessToken = useAuthStore((s) => s.access_token);
  const onRobotCompletedRef = useRef(onRobotCompleted);
  onRobotCompletedRef.current = onRobotCompleted;

  useEffect(() => {
    if (warehouseId <= 0 || !accessToken) {
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let unmounted = false;
    let attempt = 0;

    const connect = () => {
      if (unmounted) return;
      const url = buildWarehouseWebSocketUrl(warehouseId, accessToken);
      ws = new WebSocket(url);

      ws.onopen = () => {
        attempt = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as {
            type?: string;
            warehouse_id?: number;
          };
          if (data.type === "heartbeat") {
            return;
          }
          if (
            data.type === WS_EVENT_ROBOT_TASK_COMPLETED &&
            typeof data.warehouse_id === "number"
          ) {
            onRobotCompletedRef.current?.(
              data.warehouse_id,
              data as RobotTaskCompletedMessage,
            );
          }
        } catch {
          /* ignore non-JSON */
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
  }, [warehouseId, accessToken]);
}
