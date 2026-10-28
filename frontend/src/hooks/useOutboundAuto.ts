import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getOutboundAutoStatus, returnOutboundAutoCycle, setOutboundAuto, verifyOutboundReturnUnsent } from '@/api/outboundAuto';

export const outboundAutoKey = (warehouseId: number, displayZoneId: number) =>
  ['outboundAuto', warehouseId, displayZoneId] as const;

export function useOutboundAuto(warehouseId: number, displayZoneId: number) {
  const queryClient = useQueryClient();
  const scope = { warehouse_id: warehouseId, display_zone_id: displayZoneId };
  const key = outboundAutoKey(warehouseId, displayZoneId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getOutboundAutoStatus(scope, signal),
    enabled: warehouseId > 0 && [8, 9].includes(displayZoneId),
    staleTime: 0,
    refetchInterval: 5000,
    retry: 1,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['masan'] });
    void queryClient.invalidateQueries({ queryKey: ['warehouseMap'] });
  };
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setOutboundAuto(scope, enabled),
    onSuccess: (data) => { queryClient.setQueryData(key, data); refresh(); },
  });
  const returnCycle = useMutation({
    mutationFn: (cycleId: number) => returnOutboundAutoCycle(scope, cycleId),
    onSuccess: (data) => { queryClient.setQueryData(key, data); refresh(); },
  });
  const verifyUnsent = useMutation({
    mutationFn: ({ taskId, note }: { taskId: number; note: string }) => verifyOutboundReturnUnsent(scope, taskId, note),
    onSuccess: (data) => { queryClient.setQueryData(key, data); refresh(); },
  });
  // A read failure must not enable manual commands while the server may be on.
  const manualBlocked = warehouseId > 0 && (!query.data || query.isError || query.data.enabled);
  return { ...query, toggle, returnCycle, verifyUnsent, manualBlocked };
}
