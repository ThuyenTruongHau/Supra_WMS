import axios from './axiosInstance';

export type InboundDispatchStatus = {
  warehouse_id: number;
  enabled: boolean;
  state: 'idle' | 'running' | 'paused' | 'needs_review';
  batch_id: number | null;
  batch_code: string | null;
  waiting_count: number;
  issued_count: number;
  review_count: number;
  assign_robot_id: string | null;
  sorting_persons: string | null;
  changed_by_id: number | null;
  changed_at: string | null;
  message: string | null;
  problems: { command_id: number; order_id: string | null; detail_id: number; state: string; message: string | null }[];
};

const base = '/api/v1/masan/inbound-orders/auto-dispatch';

export async function getInboundDispatchStatus(warehouseId: number, signal?: AbortSignal) {
  return (await axios.get<InboundDispatchStatus>(`${base}/status`, { params: { warehouse_id: warehouseId }, signal })).data;
}

export async function setInboundDispatch(warehouseId: number, enabled: boolean) {
  return (await axios.post<InboundDispatchStatus>(`${base}/${enabled ? 'resume' : 'pause'}`, { warehouse_id: warehouseId })).data;
}

export async function verifyInboundUnsent(warehouseId: number, commandId: number, note: string) {
  return (await axios.post<InboundDispatchStatus>(`${base}/commands/${commandId}/verify-unsent`, { warehouse_id: warehouseId, note })).data;
}
