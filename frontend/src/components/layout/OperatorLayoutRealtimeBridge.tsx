import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { useWarehouseWebSocket } from "@/hooks/useWarehouseWebSocket";
import { invalidateAfterRobotCompleted } from "@/utils/invalidateWarehouseRealtimeQueries";

/** WebSocket realtime for toàn bộ shell operator (nhập / xuất / tổng quan). */
export default function OperatorLayoutRealtimeBridge() {
  const warehouseId = useAppStore((s) => s.selectedWarehouseId);
  const queryClient = useQueryClient();

  useWarehouseWebSocket({
    warehouseId,
    onRobotCompleted: (id) => {
      invalidateAfterRobotCompleted(queryClient, id);
    },
  });

  return null;
}
