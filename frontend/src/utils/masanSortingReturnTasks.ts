import type {
  OutboundRobotTask,
  OutboundRobotTaskExecuteRequest,
} from "@/types/outbound";
import { getRobotTaskDisplayStatus } from "./outboundRobotTaskDisplay.ts";

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

/** Location label for robot task tables — `location_name` only (no code fallback). */
export function taskEndpointLocationName(
  task: OutboundRobotTask,
  endpoint: "from" | "to",
): string {
  const first = task.allocations[0];
  if (!first) return "—";
  const raw =
    endpoint === "from"
      ? first.from_location_name
      : first.to_location_name;
  const trimmed = raw?.trim();
  return trimmed || "—";
}

function outboundAllocsIncompleteOnDetails(
  allTasks: OutboundRobotTask[],
  detailIds: Set<number>,
): boolean {
  if (detailIds.size === 0) return true;
  const completedDetails = new Set<number>();
  for (const task of allTasks) {
    if (task.task_type !== "outbound") continue;
    for (const alloc of task.allocations) {
      if (!detailIds.has(alloc.outbound_order_detail_id)) continue;
      if (alloc.status === "completed") {
        completedDetails.add(alloc.outbound_order_detail_id);
      } else if (!["failed", "cancelled"].includes(alloc.status)) return true;
    }
  }
  return [...detailIds].some((id) => !completedDetails.has(id));
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

export function returnTaskFromLocationId(
  task: OutboundRobotTask,
): number | null {
  const fromId = task.allocations[0]?.from_location_id;
  return fromId != null && fromId > 0 ? fromId : null;
}

/** Giữ lệnh return có `from_location_id` trùng VT; `vtLocationId` null/undefined = không lọc. */
export function filterReturnTasksByFromLocationId(
  rows: MasanSortingReturnTaskRow[],
  vtLocationId: number | null | undefined,
): MasanSortingReturnTaskRow[] {
  if (vtLocationId == null || vtLocationId <= 0) return rows;
  return rows.filter(
    (row) => returnTaskFromLocationId(row.task) === vtLocationId,
  );
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
