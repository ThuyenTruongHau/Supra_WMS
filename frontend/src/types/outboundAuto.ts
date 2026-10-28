export interface OutboundAutoScope {
  warehouse_id: number;
  display_zone_id: number;
}

export interface OutboundAutoVt {
  location_id: number;
  name: string;
  location_status: string;
  cycle_id: number | null;
  execution_mode?: 'native' | 'manual_services' | 'adopted_return' | null;
  phase: string;
  message: string | null;
  pick_order_id: string | null;
  return_order_id: string | null;
  remaining_quantity: number;
}

export interface OutboundAutoStatus extends OutboundAutoScope {
  enabled: boolean;
  state: string;
  message: string | null;
  vts: OutboundAutoVt[];
  return_candidates?: OutboundReturnCandidate[];
}

export interface OutboundReturnCandidate {
  task_id: number;
  order_id: string;
  location_id: number;
  name: string;
  quantity: number;
  state: 'ready' | 'awaiting_verification' | 'waiting_conditions' | 'blocked';
  message: string;
  can_verify: boolean;
  business_ready: boolean;
}
