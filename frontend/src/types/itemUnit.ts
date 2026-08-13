export interface ItemUnit {
  id: number;
  item_id: number;
  unit_id: number;
  conversion_factor: number;
  item_name: string | null;
  item_sku: string | null;
  unit_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ItemUnitListResponse {
  items: ItemUnit[];
  total: number;
  page: number;
  page_size: number;
}

export type CreateItemUnitInput = {
  item_id: number;
  unit_id: number;
  conversion_factor: number;
};

export type UpdateItemUnitInput = Partial<CreateItemUnitInput>;

export interface ItemAvailableUnitOption {
  unit_id: number;
  unit_name: string;
  conversion_factor?: number | null;
  is_base_unit: boolean;
}

export interface ItemAvailableUnitsResponse {
  item_id: number;
  base_unit_id: number;
  base_unit_name: string;
  units: ItemAvailableUnitOption[];
}

export interface ConvertQuantityInput {
  item_id: number;
  unit_id: number;
  quantity: number;
}

export interface ConvertQuantityResponse {
  converted_quantity: number;
  base_unit_id: number;
  base_unit_name: string;
}
