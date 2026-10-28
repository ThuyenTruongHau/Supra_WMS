import { useOutboundAuto } from '@/hooks/useOutboundAuto';
import { OUTBOUND_AUTO_PHASE_LABELS } from '@/utils/outboundAuto';
import OutboundReturnCandidates from './OutboundReturnCandidates';

export default function OutboundAutoStatus({ warehouseId, displayZoneId }: {
  warehouseId: number; displayZoneId: number;
}) {
  const { data, isError } = useOutboundAuto(warehouseId, displayZoneId);
  if (!data || (!data.enabled && data.state !== 'error' && !data.vts.some((vt) => vt.cycle_id) && !data.return_candidates?.length)) return null;
  return <div className="mt-1 text-xs text-slate-600" aria-live="polite" data-testid={`outbound-auto-status-${displayZoneId}`}>
    <p className={isError || data.state === 'error' ? 'text-red-600' : undefined}>
      {isError ? 'Chưa cập nhật được trạng thái tự động' : data.message}
    </p>
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {data.vts.map((vt) => <span key={vt.location_id} title={[vt.pick_order_id, vt.return_order_id].filter(Boolean).join(' · ')}>
        <strong>{vt.name}</strong>: {OUTBOUND_AUTO_PHASE_LABELS[vt.phase] ?? vt.phase}
        {vt.execution_mode === 'adopted_return' && ' (tiếp quản return)'}
        {vt.message && ` — ${vt.message}`}
      </span>)}
    </div>
    <OutboundReturnCandidates warehouseId={warehouseId} displayZoneId={displayZoneId} />
  </div>;
}
