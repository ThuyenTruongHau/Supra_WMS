import type { OutboundOrderCreateRequest } from "@/types/outbound";
import type { MasanOutboundParseResponse } from "@/types/masanOutbound";

export function buildMasanOutboundCreateRequest(
  parseResult: MasanOutboundParseResponse,
  options: {
    warehouseId: number;
    orderCode: string;
    note?: string | null;
  },
): OutboundOrderCreateRequest {
  const { warehouseId, orderCode, note } = options;

  return {
    order_code: orderCode,
    note: note ?? "Import BM.04",
    warehouse_id: warehouseId,
    line_items: parseResult.line_items,
  };
}
