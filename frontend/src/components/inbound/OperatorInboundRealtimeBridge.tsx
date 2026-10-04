import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { useWarehouseWebSocket } from "@/hooks/useWarehouseWebSocket";
import { invalidateOperatorInboundAfterRobotCompleted } from "@/utils/invalidateWarehouseRealtimeQueries";

/** WebSocket → React Query invalidation while operator is on Nhập kho (/import). */
export default function OperatorInboundRealtimeBridge() {
  const warehouseId = useAppStore((s) => s.selectedWarehouseId);
  const queryClient = useQueryClient();

  useWarehouseWebSocket({
    warehouseId,
    onRobotCompleted: (id, message) => {
      if (message.flow !== "inbound") return;
      invalidateOperatorInboundAfterRobotCompleted(queryClient, id);
    },
  });

  return null;
}
