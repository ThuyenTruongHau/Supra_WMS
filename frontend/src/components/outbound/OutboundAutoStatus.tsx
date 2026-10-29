import { useId, useState, type ReactNode } from 'react';
import { useOutboundAuto } from '@/hooks/useOutboundAuto';
import { OUTBOUND_AUTO_PHASE_LABELS } from '@/utils/outboundAuto';
import OutboundReturnCandidates from './OutboundReturnCandidates';

type OutboundAutoStatusProps = {
  warehouseId: number; displayZoneId: number;
  renderToolbar?: (toggle: ReactNode) => ReactNode;
};

export default function OutboundAutoStatus(props: OutboundAutoStatusProps) {
  return <OutboundAutoStatusContent key={`${props.warehouseId}-${props.displayZoneId}`} {...props} />;
}

function OutboundAutoStatusContent({ warehouseId, displayZoneId, renderToolbar }: OutboundAutoStatusProps) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const { data, isError } = useOutboundAuto(warehouseId, displayZoneId);
  const hasStatus = data != null && (data.enabled || data.state === 'error' || data.vts.some((vt) => vt.cycle_id) || Boolean(data.return_candidates?.length));
  if (!hasStatus && !renderToolbar) return null;
  const toggleLabel = expanded ? 'Ẩn thông tin VT' : 'Hiện thông tin VT';
  const toggle = hasStatus ? <div className="flex shrink-0 items-center border-l border-slate-200"
    style={{ marginLeft: 'calc(8px / var(--operator-stage-scale, 1))', paddingLeft: 'calc(8px / var(--operator-stage-scale, 1))' }}
    data-testid={`outbound-auto-separator-${displayZoneId}`}>
    <button type="button" title={toggleLabel} aria-label={toggleLabel}
      aria-expanded={expanded} aria-controls={detailsId}
      onClick={() => setExpanded((value) => !value)}
      data-testid={`outbound-auto-toggle-${displayZoneId}`}
      style={{ width: 'calc(40px / var(--operator-stage-scale, 1))', height: 'calc(40px / var(--operator-stage-scale, 1))', fontSize: 'calc(12px / var(--operator-stage-scale, 1))' }}
      className="flex shrink-0 items-center justify-center rounded border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
      <span aria-hidden="true">{expanded ? '▼' : '▶'}</span>
    </button>
  </div> : null;
  return <div className="w-full min-w-0 max-w-full text-slate-600" data-testid={hasStatus ? `outbound-auto-status-${displayZoneId}` : undefined}>
    {renderToolbar ? renderToolbar(toggle) : toggle}
    {hasStatus && <div id={detailsId} hidden={!expanded} aria-live="polite"
      className="mt-2 max-h-[240px] min-w-0 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 [overflow-wrap:anywhere]"
      data-testid={`outbound-auto-details-${displayZoneId}`}>
      <p className={isError || data.state === 'error' ? 'text-red-600' : undefined}>
        {isError ? 'Chưa cập nhật được trạng thái tự động' : data.message}
      </p>
      <div className="divide-y divide-slate-200">
        {data.vts.map((vt) => <div key={vt.location_id} className="py-2"
          title={[vt.pick_order_id, vt.return_order_id].filter(Boolean).join(' · ')}>
          <p className={vt.phase === 'error' ? 'font-medium text-red-600' : 'font-medium text-slate-800'}>
            <strong>{vt.name}</strong> · {OUTBOUND_AUTO_PHASE_LABELS[vt.phase] ?? vt.phase}
          </p>
          {vt.execution_mode === 'adopted_return' && <p>Tiếp quản return</p>}
          {vt.message && <p>{vt.message}</p>}
        </div>)}
      </div>
      <OutboundReturnCandidates warehouseId={warehouseId} displayZoneId={displayZoneId} />
    </div>}
  </div>;
}
