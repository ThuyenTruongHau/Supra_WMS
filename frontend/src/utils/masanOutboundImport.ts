import type { OutboundOrderCreateRequest } from "@/types/outbound";
import type { MasanOutboundParseResponse } from "@/types/masanOutbound";
import { normalizeMasanExcelLotInput } from "@/utils/masanExcelLot";

export function buildMasanOutboundCreateRequest(
  parseResult: MasanOutboundParseResponse,
  options: {
    warehouseId: number;
    orderCode: string;
    note?: string | null;
  },
): OutboundOrderCreateRequest {
  const { warehouseId, orderCode, note } = options;

  const line_items = parseResult.line_items.map((line) => {
    const details = { ...(line.details ?? {}) };
    const rawLot = details.lot_number;
    if (rawLot != null && String(rawLot).trim() !== "") {
      const normalized = normalizeMasanExcelLotInput(rawLot);
      if (normalized) {
        details.lot_number = normalized;
      }
    }
    return { ...line, details };
  });

  return {
    order_code: orderCode,
    note: note ?? "Import BM.04",
    warehouse_id: warehouseId,
    line_items,
  };
}
