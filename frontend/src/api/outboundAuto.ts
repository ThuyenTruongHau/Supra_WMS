import axiosInstance from './axiosInstance';
import type { OutboundAutoScope, OutboundAutoStatus } from '@/types/outboundAuto';

const BASE = '/api/v1/masan/outbound-orders/auto-dispatch';

export async function getOutboundAutoStatus(scope: OutboundAutoScope, signal?: AbortSignal) {
  const { data } = await axiosInstance.get<OutboundAutoStatus>(`${BASE}/status`, { params: scope, signal });
  return data;
}

export async function setOutboundAuto(scope: OutboundAutoScope, enabled: boolean) {
  const { data } = await axiosInstance.post<OutboundAutoStatus>(`${BASE}/${enabled ? 'start' : 'stop'}`, scope);
  return data;
}

export async function returnOutboundAutoCycle(scope: OutboundAutoScope, cycleId: number) {
  const { data } = await axiosInstance.post<OutboundAutoStatus>(`${BASE}/cycles/${cycleId}/return`, scope);
  return data;
}

export async function verifyOutboundReturnUnsent(scope: OutboundAutoScope, taskId: number, note: string) {
  const { data } = await axiosInstance.post<OutboundAutoStatus>(`${BASE}/returns/${taskId}/verify-unsent`, { ...scope, note });
  return data;
}
