export interface OrderBrief {
  id: number;
  order_code: string;
  status: string;
  warehouse_id: number;
  note: string | null;
  details: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface ItemStockLookup {
  id: number;
  stock_code: string;
  item_id: number;
  item_sku: string | null;
  item_name: string | null;
  location_id: number | null;
  location_code: string | null;
  location_name: string | null;
  inbound_order_detail_id: number | null;
  unit_id: number;
  unit_name: string | null;
  quantity: number | string;
  available_quantity: number | string | null;
  lot_number_from: string | null;
  lot_number_to: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  status: string;
  is_active: boolean;
  qc_user: string | null;
  manufacturing_machine: string | null;
  manufacturing_user: string | null;
  packing_user: string | null;
  cavity_number: string | null;
  stock_level: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TransactionHistoryItem {
  id: number;
  from_location_id: number;
  to_location_id: number;
  from_location_code: string | null;
  from_location_name: string | null;
  to_location_code: string | null;
  to_location_name: string | null;
  transaction_type: string;
  item_stock_id: number;
  quantity: number;
  created_by_id: number;
  created_at: string | null;
}

export interface HistoryRecord {
  id: number;
  inbound_order_id: number | null;
  outbound_order_id: number | null;
  old_status: string;
  new_status: string;
  created_by_id: number;
  created_at: string | null;
  description: string;
  details: Record<string, unknown>;
}

export type TransactionHistoryLookupType = "qr_code" | "order";
export type TransactionHistoryOrderType = "inbound" | "outbound";

export interface TransactionHistoryLookupResponse {
  lookup_type: TransactionHistoryLookupType;
  qr_code?: string | null;
  order_code?: string | null;
  order_type?: TransactionHistoryOrderType | null;
  item_stock_id?: number | null;
  item_stock?: ItemStockLookup | null;
  order?: OrderBrief | null;
  transactions: TransactionHistoryItem[];
  histories: HistoryRecord[];
}

export interface GetTransactionHistoryParams {
  qr_code?: string;
  order_code?: string;
}
