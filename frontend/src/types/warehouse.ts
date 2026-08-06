export interface Warehouse {
  id: number;
  code: string;
  name: string | null;
  description: string | null;
}

export interface WarehouseListResponse {
  items: Warehouse[];
  total: number;
  page: number;
  page_size: number;
}

export type CreateWarehouseInput = {
  code: string;
  name?: string | null;
  description?: string | null;
};

export type UpdateWarehouseInput = Partial<CreateWarehouseInput>;
