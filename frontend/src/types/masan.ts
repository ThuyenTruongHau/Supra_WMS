import type { InboundSuggestAllocationRequest } from "@/types/inboundOrder";

export interface MasanInboundPreviewRow {
  row_no: number;
  inbound_datetime: string | null;
  vehicle_no: string | null;
  from_warehouse: string | null;
  to_warehouse: string | null;
  delivery: string | null;
  nvt: string | null;
  sku: string;
  item_name: string | null;
  lot: string | null;
  lot_status: string | null;
  quantity: number;
  pallet_count: string | null;
  storage_location: string | null;
  from_location_id: number | null;
  from_location_name: string | null;
  locator: string | null;
  item_id: number | null;
  unit_id: number | null;
  suggest_group_index: number | null;
  error: string | null;
}

export interface MasanInboundParseResponse {
  preview_rows: MasanInboundPreviewRow[];
  suggest_allocation: InboundSuggestAllocationRequest;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  group_count: number;
  warnings: string[];
}
