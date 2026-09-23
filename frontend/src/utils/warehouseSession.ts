import type { UserAccessSummary } from '@/types/auth';
import { useAppStore } from '@/store/useAppStore';
import { SNAPSHOT_MODE, getSnapshotConfig } from '@/snapshot/snapshotConfig';

const DEFAULT_WAREHOUSE_ID = SNAPSHOT_MODE
  ? getSnapshotConfig().defaultWarehouseId
  : 1;

/** Align selected warehouse with login access (staff → assigned list only). */
export function syncWarehouseToUserAccess(
  access: UserAccessSummary | null,
  roles: string[] = [],
): void {
  const { selectedWarehouseId, setSelectedWarehouseId } = useAppStore.getState();

  if (!access) {
    setSelectedWarehouseId(DEFAULT_WAREHOUSE_ID);
    return;
  }

  if (
    access.is_admin ||
    access.warehouse_scope === 'all' ||
    (roles.length > 0 &&
      roles.some((r) => {
        const n = r.toLowerCase();
        return n === 'admin' || n === 'a001';
      }))
  ) {
    return;
  }

  const allowed = access.warehouses ?? [];
  if (allowed.length === 0) {
    setSelectedWarehouseId(DEFAULT_WAREHOUSE_ID);
    return;
  }

  if (!allowed.some((w) => w.id === selectedWarehouseId)) {
    setSelectedWarehouseId(allowed[0].id);
  }
}
