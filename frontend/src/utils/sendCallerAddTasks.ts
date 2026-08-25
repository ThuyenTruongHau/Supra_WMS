import type {
  InboundCallerLineItem,
  InboundCallerResponse,
  TaskAddPayload,
} from "@/types/inboundOrder";

function randomOrderId(): string {
  const hex = Math.random().toString(16).slice(2, 10);
  return `TDS_Inbound_${hex}`;
}

export function buildTaskAddPayloads(
  response: InboundCallerResponse,
  moveMode = "to_storage",
): TaskAddPayload[] {
  return response.line_items.map((item: InboundCallerLineItem) => {
    const { detail, robot_task } = item;
    return {
      order_id: robot_task?.order_id || randomOrderId(),
      start_point: detail.from_location_code || "",
      target_point: detail.to_location_code || "",
      move_mode: moveMode,
      metadata: {
        order_code: response.order.order_code,
        inbound_order_id: response.order.id,
        detail_id: detail.id,
        from_location_id: detail.from_location_id,
        to_location_id: detail.to_location_id,
        allocations: detail.allocations ?? [],
      },
    };
  });
}

/** Chỉ dùng trên /qrtablet — gọi orchestrator local, không qua WMS backend. */
export async function sendCallerAddTasks(
  response: InboundCallerResponse,
): Promise<void> {
  const url =
    import.meta.env.VITE_TASK_ADD_URL?.trim() || "/task/add-task";
  const moveMode =
    import.meta.env.VITE_TASK_ADD_MOVE_MODE?.trim() || "to_storage";
  const payloads = buildTaskAddPayloads(response, moveMode);

  for (const payload of payloads) {
    if (!payload.start_point || !payload.target_point) {
      throw new Error(
        `Thiếu start/target point cho detail ${payload.metadata.detail_id}`,
      );
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Gửi task/add-task thất bại (${res.status}): ${text || res.statusText}`,
      );
    }
  }
}
