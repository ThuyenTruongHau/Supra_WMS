import { useMemo } from "react";
import { useMasanSortingZoneCcLocations } from "@/hooks/useMasanSortingZoneCcLocations";
import {
  masanCcZoneOrderIdsFromLocations,
  useMasanCcZoneOrderRobotTasks,
} from "@/hooks/useMasanCcZoneOrderRobotTasks";
import type { OutboundRobotTask } from "@/types/outbound";
import {
  pickReadyReturnTasks,
  type MasanSortingReturnTaskRow,
} from "@/utils/masanSortingReturnTasks";

export function useMasanSortingZoneReturnTasks(
  warehouseId: number,
  ccZoneCode: string | null,
  enabled: boolean,
) {
  const zoneQuery = useMasanSortingZoneCcLocations(
    warehouseId,
    ccZoneCode,
    enabled,
  );

  const orderIds = useMemo(
    () => masanCcZoneOrderIdsFromLocations(zoneQuery.data?.locations),
    [zoneQuery.data],
  );

  const robotTasks = useMasanCcZoneOrderRobotTasks(orderIds, enabled);

  const rows = useMemo((): MasanSortingReturnTaskRow[] => {
    const allTasks = robotTasks.tasks;
    const seen = new Set<string>();
    const out: MasanSortingReturnTaskRow[] = [];
    for (const orderId of orderIds) {
      const tasks = robotTasks.tasksByOrderId.get(orderId) ?? [];
      for (const row of pickReadyReturnTasks(orderId, tasks, allTasks)) {
        if (seen.has(row.task.order_id)) continue;
        seen.add(row.task.order_id);
        out.push(row);
      }
    }
    return out;
  }, [orderIds, robotTasks.tasks, robotTasks.tasksByOrderId]);

  return {
    rows,
    isLoading: zoneQuery.isLoading || robotTasks.isLoading,
    isError: zoneQuery.isError || robotTasks.isError,
    refetch: async () => {
      await zoneQuery.refetch();
      await robotTasks.refetch();
    },
  };
}
