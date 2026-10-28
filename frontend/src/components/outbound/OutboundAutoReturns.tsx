import { Button, message } from '@/components/ui';
import { useOutboundAuto } from '@/hooks/useOutboundAuto';
import { getApiErrorMessage } from '@/utils/apiErrorMessage';
import { autoCanReturn } from '@/utils/outboundAuto';

export default function OutboundAutoReturns({ warehouseId, displayZoneId, vtLocationId }: {
  warehouseId: number; displayZoneId: number; vtLocationId?: number | null;
}) {
  const auto = useOutboundAuto(warehouseId, displayZoneId);
  const rows = auto.data?.vts.filter((vt) => vt.phase === 'ready_to_return'
    && !['manual_services', 'adopted_return'].includes(vt.execution_mode ?? '')
    && (vtLocationId == null || vt.location_id === vtLocationId)) ?? [];
  if (!rows.length) return null;
  return <div className="mb-3 space-y-2">
    {rows.map((vt) => <div key={vt.location_id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span>{vt.name} · {vt.remaining_quantity} · {vt.message ?? 'Chờ return'}</span>
      <Button disabled={!auto.data || !autoCanReturn(auto.data.enabled, vt.phase) || auto.isError}
        loading={auto.returnCycle.isPending}
        onClick={async () => {
          try {
            await auto.returnCycle.mutateAsync(vt.cycle_id!);
            message.success('Đã gửi lệnh return');
          } catch (error) { message.error(getApiErrorMessage(error)); }
        }}>
        {auto.data?.enabled ? 'Đang tự động' : 'Return'}
      </Button>
    </div>)}
  </div>;
}
