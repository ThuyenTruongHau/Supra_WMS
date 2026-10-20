import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { getOutboundRobotTasksApi } from "@/api/outboundOrder";
import type { MasanSortingZoneCcLocationRow } from "@/types/masan";
import type { OutboundRobotTask } from "@/types/outbound";

const ROBOT_TASK_REFETCH_MS = 5_000;
const ROBOT_TASK_STALE_MS = 4_000;

export function masanCcZoneOrderIdsFromLocations(
  locations: MasanSortingZoneCcLocationRow[] | undefined,
): number[] {
  const ids = new Set<number>();
  for (const loc of locations ?? []) {
    for (const line of loc.lines ?? []) {
      if (line.outbound_order_id > 0) ids.add(line.outbound_order_id);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

export function useMasanCcZoneOrderRobotTasks(
  orderIds: number[],
  enabled: boolean,
) {
  const taskQueries = useQueries({
    queries: orderIds.map((orderId) => ({
      queryKey: ["outboundRobotTasks", orderId] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getOutboundRobotTasksApi(orderId, signal),
      enabled: enabled && orderId > 0,
      staleTime: ROBOT_TASK_STALE_MS,
      refetchInterval:
        enabled && orderId > 0 ? ROBOT_TASK_REFETCH_MS : false,
    })),
  });

  const taskUpdatedAt = taskQueries.map((q) => q.dataUpdatedAt).join(",");
  const taskLoadingKey = taskQueries
    .map((q) => q.isLoading && q.data === undefined)
    .join(",");
  const taskErrorKey = taskQueries.map((q) => q.isError).join(",");

  const { tasks, tasksByOrderId } = useMemo(() => {
    const flat: OutboundRobotTask[] = [];
    const byOrder = new Map<number, OutboundRobotTask[]>();
    orderIds.forEach((orderId, index) => {
      const batch = taskQueries[index]?.data ?? [];
      byOrder.set(orderId, batch);
      flat.push(...batch);
    });
    return { tasks: flat, tasksByOrderId: byOrder };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIds, taskUpdatedAt]);

  const tasksLoading = orderIds.length > 0 && taskLoadingKey.includes("true");

  return {
    tasks,
    tasksByOrderId,
    isLoading: tasksLoading,
    isError: taskErrorKey.includes("true"),
    refetch: async () => {
      await Promise.all(taskQueries.map((q) => q.refetch()));
    },
  };
}
