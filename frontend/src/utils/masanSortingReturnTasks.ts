import type {
  OutboundRobotTask,
  OutboundRobotTaskExecuteRequest,
} from "@/types/outbound";
import { getRobotTaskDisplayStatus } from "@/utils/outboundRobotTaskDisplay";

export type MasanSortingReturnTaskRow = {
  outboundOrderId: number;
  task: OutboundRobotTask;
};

export function displayTaskLocationName(
  name: string | null | undefined,
  code: string | null | undefined,
  id: number | null | undefined,
): string {
  if (name) return name;
  if (code) return code;
  if (id) return `#${id}`;
  return "—";
}

function outboundAllocsIncompleteOnDetails(
  allTasks: OutboundRobotTask[],
  detailIds: Set<number>,
): boolean {
  if (detailIds.size === 0) return true;
  for (const task of allTasks) {
    if (task.task_type !== "outbound") continue;
    for (const alloc of task.allocations) {
      if (
        detailIds.has(alloc.outbound_order_detail_id) &&
        alloc.status !== "completed"
      ) {
        return true;
      }
    }
  }
  return false;
}

export function pickReadyReturnTasks(
  outboundOrderId: number,
  tasks: OutboundRobotTask[],
  allTasks: OutboundRobotTask[],
): MasanSortingReturnTaskRow[] {
  const rows: MasanSortingReturnTaskRow[] = [];
  for (const task of tasks) {
    if (task.task_type !== "return") continue;
    if (getRobotTaskDisplayStatus(task) !== "initialize") continue;
    if (task.allocations.length === 0) continue;
    const detailIds = new Set(
      task.allocations.map((alloc) => alloc.outbound_order_detail_id),
    );
    if (outboundAllocsIncompleteOnDetails(allTasks, detailIds)) continue;
    rows.push({ outboundOrderId, task });
  }
  return rows;
}

export function buildReturnExecuteBody(
  task: OutboundRobotTask,
): OutboundRobotTaskExecuteRequest | null {
  const first = task.allocations[0];
  const fromId = first?.from_location_id;
  const toId = first?.to_location_id;
  if (!fromId || !toId) return null;
  return {
    order_id: task.order_id,
    from_location_id: fromId,
    to_location_id: toId,
    allocations: task.allocations.map((alloc) => ({
      allocation_id: alloc.id,
    })),
  };
}
