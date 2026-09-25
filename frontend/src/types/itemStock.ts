export interface ItemStockResponse {
  id: number;
  stock_code: string;
  item_id: number;
  location_id: number;
  unit_id: number;
  quantity: number | string;
  lot_number_from?: string | null;
  lot_number_to?: string | null;
  lot_number?: string | null;
  expiry_date?: string | null;
  status: string;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ItemStockSplitListResponse {
  items: ItemStockResponse[];
  total: number;
}
