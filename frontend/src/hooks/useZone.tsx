/**
 * Compat layer: pages that still import useZone for "kho" picker
 * now load warehouses from GET /api/v1/warehouses.
 */
import {
  useWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
  useDeleteWarehouse,
} from '@/hooks/useWarehouse';

export const useZone = useWarehouses;
export const useCreateZone = useCreateWarehouse;
export const useUpdateZone = useUpdateWarehouse;
export const useDeleteZone = useDeleteWarehouse;
