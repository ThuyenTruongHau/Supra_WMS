export interface Stocktake {
  id: number;
  warehouse_id: number;
  created_by_id: number;
  description: string | null;
  created_by_username: string | null;
  warehouse_name: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface StocktakeListResponse {
  items: Stocktake[];
  total: number;
  page: number;
  page_size: number;
}

export interface StocktakeItemStock {
  id: number;
  stocktake_id: number;
  item_stock_id: number;
  lot_number: string;
  location_id: number;
  desired_quantity: number;
  actual_quantity: number;
  location_code: string | null;
  location_name: string | null;
  item_sku: string | null;
  item_name: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface StocktakeDetail extends Stocktake {
  items: StocktakeItemStock[];
}

export interface StocktakeItemStockListResponse {
  items: StocktakeItemStock[];
  total: number;
  page: number;
  page_size: number;
}

export interface GetStocktakesParams {
  warehouse_id: number;
  page?: number;
  page_size?: number;
  q?: string;
}

export interface GetStocktakeItemsParams {
  warehouse_id: number;
  page?: number;
  page_size?: number;
  stocktake_id?: number;
}

export interface CreateStocktakeInput {
  warehouse_id: number;
  description?: string | null;
  location_ids?: number[];
  item_ids?: number[];
  lot_numbers?: string[];
}
