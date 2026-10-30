import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getInboundDispatchStatus, setInboundDispatch, verifyInboundUnsent } from '@/api/inboundDispatch';

export const inboundDispatchKey = (warehouseId: number) => ['inboundDispatch', warehouseId] as const;

export function useInboundDispatch(warehouseId: number) {
  const client = useQueryClient();
  const key = inboundDispatchKey(warehouseId);
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getInboundDispatchStatus(warehouseId, signal),
    enabled: warehouseId > 0,
    staleTime: 0,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    retry: 1,
  });
  const refresh = () => void client.invalidateQueries({ queryKey: key });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setInboundDispatch(warehouseId, enabled),
    onSuccess: (data) => { client.setQueryData(key, data); refresh(); },
    onError: refresh,
  });
  const verify = useMutation({
    mutationFn: ({ commandId, note }: { commandId: number; note: string }) => verifyInboundUnsent(warehouseId, commandId, note),
    onSuccess: (data) => { client.setQueryData(key, data); refresh(); },
    onError: refresh,
  });
  const blocked = !query.data || query.isError || !query.data.enabled || toggle.isPending || query.data.batch_id != null || query.data.waiting_count > 0;
  return { ...query, toggle, verify, blocked };
}
