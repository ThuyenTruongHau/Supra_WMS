/**
 * Admin: Quản lý chia chọn — CRUD wave (bảng + modal chọn station).
 * User dùng OperatorSortingWavePage (bản đồ).
 */
import { PartitionOutlined } from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { useWarehouses } from "@/hooks/useWarehouse";
import { useSortingWaves } from "@/hooks/useSortingWave";
import { Card, cn } from "@/components/ui";
import SortingWaveManagementPanel from "@/components/warehouse/SortingWaveManagementPanel";

export default function SortingWavePage() {
  const { selectedWarehouseId } = useAppStore();
  const { data: warehouses = [] } = useWarehouses();
  const zoneId = selectedWarehouseId ?? 0;
  const selectedWarehouseName =
    warehouses.find((warehouse) => warehouse.id === selectedWarehouseId)?.name ??
    "Chưa chọn kho";

  const { data: waves = [] } = useSortingWaves(zoneId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-brand-dark">
          Quản lý chia chọn
        </h2>
        <span className="text-sm text-gray-400">{selectedWarehouseName}</span>
      </div>

      <Card className="overflow-hidden rounded-xl border-gray-100/50 p-0 shadow-sm">
        <div className="flex items-stretch gap-0 border-b border-stripe-hairline bg-panel-soft p-0">
          <div
            className={cn(
              "relative z-10 -mb-px flex min-h-12 min-w-[200px] items-center gap-2",
              "border border-stripe-hairline border-b-white bg-white px-6 py-3.5",
              "text-sm font-semibold text-brand-dark shadow-[0_1px_0_0_#fff]",
            )}
          >
            <PartitionOutlined className="text-base text-brand-primary" />
            <span>Wave chia chọn</span>
            <span className="rounded-full bg-brand-primary/15 px-2 py-0.5 text-xs font-bold tabular-nums text-brand-primary">
              {waves.length}
            </span>
          </div>
        </div>

        <SortingWaveManagementPanel zoneId={zoneId} />
      </Card>
    </div>
  );
}
