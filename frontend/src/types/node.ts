export const NODE_TYPE_INBOUND = 1;
export const NODE_TYPE_OUTBOUND = 2;

export type NodeType = typeof NODE_TYPE_INBOUND | typeof NODE_TYPE_OUTBOUND;

export interface WarehouseNode {
  id: number;
  zone_id: number;
  node_name: string;
  qr_code: string;
  type: NodeType;
  created_by: number;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateNodeInput {
  zone_id: number;
  node_name: string;
  qr_code: string;
  type: NodeType;
}

export interface UpdateNodeInput {
  node_name?: string;
  qr_code?: string;
}
