import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useWarehouseWebSocket } from "@/hooks/useWarehouseWebSocket";
import { invalidateAfterRobotCompleted } from "@/utils/invalidateWarehouseRealtimeQueries";

/** WebSocket → React Query invalidation for admin shell (operator inbound uses its own bridge). */
export default function MainLayoutRealtimeBridge() {
  const warehouseId = useAppStore((s) => s.selectedWarehouseId);
  const queryClient = useQueryClient();
  const isAdmin = useAuthStore((s) => s.user?.access?.is_admin === true);

  useWarehouseWebSocket({
    warehouseId: isAdmin ? warehouseId : 0,
    onRobotCompleted: (id) => {
      invalidateAfterRobotCompleted(queryClient, id);
    },
  });

  return null;
}
