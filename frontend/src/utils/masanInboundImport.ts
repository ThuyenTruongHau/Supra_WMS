import type {
  InboundOrderCreateRequest,
  InboundSuggestAllocationResponse,
} from "@/types/inboundOrder";
import type { MasanInboundParseResponse } from "@/types/masan";
import { normalizeLotNumber } from "@/utils/lotNumberValidation";

export function buildMasanInboundCreateRequest(
  parseResult: MasanInboundParseResponse,
  suggestResult: InboundSuggestAllocationResponse,
  options: {
    warehouseId: number;
    orderCode: string;
    note?: string | null;
  },
): InboundOrderCreateRequest {
  const { warehouseId, orderCode, note } = options;
  const sourceLineItems = parseResult.suggest_allocation.line_items;

  if (suggestResult.line_items.length !== sourceLineItems.length) {
    throw new Error("Số nhóm gợi ý vị trí không khớp với dữ liệu import");
  }

  const line_items = suggestResult.line_items.map((suggested, index) => {
    const source = sourceLineItems[index];
    const toLocationId = suggested.target_location_id;
    const details = source.details ?? {};
    const fromLocationId = details.from_location_id as number | undefined;

    if (!fromLocationId) {
      throw new Error(
        `Dòng ${index + 1}: thiếu vị trí để hợp lệ trong zone nhập`,
      );
    }

    return {
      from_location_id: fromLocationId,
      to_location_id: toLocationId,
      details,
      allocations: suggested.line_items.map((item) => ({
        item_id: item.item_id,
        quantity: item.quantity,
        unit_id: item.unit_id,
        lot_number: normalizeLotNumber(item.lot_number ?? undefined),
      })),
    };
  });

  return {
    order_code: orderCode,
    note: note ?? "Import Masan",
    warehouse_id: warehouseId,
    details: {
      source: "masan_import",
      total_rows: parseResult.total_rows,
      valid_rows: parseResult.valid_rows,
      invalid_rows: parseResult.invalid_rows,
    },
    line_items,
  };
}
