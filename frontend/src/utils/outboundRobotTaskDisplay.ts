import type { OutboundRobotTask } from "@/types/outbound";

const QR_PENDING_STATUSES = [
  "pre_completed",
  "double_check_stock",
  "initialize",
] as const;

/** Any allocation on the task waiting for QR / confirm (Chờ quét mã). */
export function taskHasPreCompletedAllocation(task: OutboundRobotTask): boolean {
  return task.allocations.some((a) => a.status === "pre_completed");
}

export function getPreCompletedAllocationIds(task: OutboundRobotTask): number[] {
  return task.allocations
    .filter((a) => a.status === "pre_completed")
    .map((a) => a.id);
}

/** Allocation ids to send for manual QR scan — only rows in the active scan step. */
export function allocationIdsForManualQrScan(task: OutboundRobotTask): number[] {
  const preCompleted = getPreCompletedAllocationIds(task);
  if (preCompleted.length > 0) return preCompleted;

  const doubleCheck = task.allocations
    .filter((a) => a.status === "double_check_stock")
    .map((a) => a.id);
  if (doubleCheck.length > 0) return doubleCheck;

  return task.allocations
    .filter((a) => a.status === "initialize")
    .map((a) => a.id);
}

function pickAggregateAllocationStatus(
  allocations: OutboundRobotTask["allocations"],
): string | undefined {
  if (allocations.length === 0) return undefined;
  const statuses = allocations.map((a) => a.status);
  if (statuses.every((s) => s === "completed")) return "completed";
  if (statuses.some((s) => s === "pre_completed")) return "pre_completed";
  if (statuses.some((s) => s === "double_check_stock")) return "double_check_stock";
  if (statuses.some((s) => s === "issued")) return "issued";
  if (statuses.some((s) => s === "in_progress")) return "in_progress";
  if (statuses.every((s) => s === "initialize")) return "initialize";
  return statuses[0];
}

export function getRobotTaskDisplayStatus(
  record: OutboundRobotTask,
  isManualOutbound = false,
): string {
  const aggregate = pickAggregateAllocationStatus(record.allocations);

  if (aggregate === "completed") return "completed";
  if (aggregate === "pre_completed") return "pre_completed";
  if (aggregate === "double_check_stock") return "double_check_stock";

  if (isManualOutbound) {
    return aggregate || record.status;
  }

  if (record.task_type !== "return") {
    if (
      aggregate === "initialize" ||
      aggregate === "issued" ||
      QR_PENDING_STATUSES.includes(
        aggregate as (typeof QR_PENDING_STATUSES)[number],
      )
    ) {
      return aggregate ?? record.status;
    }
    return record.status;
  }

  if (record.status && record.status !== "initialize") return record.status;
  return aggregate || record.status;
}
