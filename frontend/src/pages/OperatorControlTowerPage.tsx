import OrderProgressReport from "@/components/reports/OrderProgressReport";
import { useAppStore } from "@/store/useAppStore";

export default function OperatorControlTowerPage() {
  const warehouseId = useAppStore((state) => state.selectedWarehouseId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-dark">Control Tower</h1>
      <OrderProgressReport warehouseId={warehouseId} />
    </div>
  );
}
