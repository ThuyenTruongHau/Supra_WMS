export interface Unit {
  id: number;
  name: string;
  description: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface UnitListResponse {
  items: Unit[];
  total: number;
  page: number;
  page_size: number;
}

export type CreateUnitInput = {
  name: string;
  description?: string | null;
};

export type UpdateUnitInput = Partial<CreateUnitInput>;
