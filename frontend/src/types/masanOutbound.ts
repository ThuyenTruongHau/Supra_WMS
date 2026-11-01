import type { OutboundOrderLineItemCreate } from "@/types/outbound";

export interface MasanOutboundPreviewRow {
  row_no: number;
  vehicle_no: string | null;
  customer_name: string | null;
  trip: string | null;
  nvt: string | null;
  sku: string;
  item_name: string | null;
  lot_number: string | null;
  lot_status: string | null;
  quantity: number;
  pallet_count: string | null;
  locator: string | null;
  item_id: number | null;
  unit_id: number | null;
  error: string | null;
}

export interface MasanOutboundStockShortage {
  sku: string;
  item_name: string | null;
  on_hand: number;
  demanded: number;
  shortage: number;
}

export interface MasanOutboundParseResponse {
  preview_rows: MasanOutboundPreviewRow[];
  line_items: OutboundOrderLineItemCreate[];
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  warnings: string[];
  can_import?: boolean;
  import_errors?: string[];
  stock_shortages?: MasanOutboundStockShortage[];
}
