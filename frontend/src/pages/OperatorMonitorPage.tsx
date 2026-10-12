import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useOperatorShell } from "@/components/layout/OperatorShellContext";
import { useAppStore } from "@/store/useAppStore";
import MonitorZoneOverviewPicker from "@/components/outbound/MonitorZoneOverviewPicker";

export default function OperatorMonitorPage() {
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);
  const { setShellHeaderCollapsed } = useOperatorShell();
  const navigate = useNavigate();

  useEffect(() => {
    setShellHeaderCollapsed(true);
    return () => setShellHeaderCollapsed(false);
  }, [setShellHeaderCollapsed]);

  const handleEnterZone = useCallback(
    (zoneId: number) => {
      navigate(`/monitor/zone/${zoneId}`);
    },
    [navigate],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-1 sm:p-2">
      <MonitorZoneOverviewPicker
        warehouseId={selectedWarehouseId}
        onSelectZone={handleEnterZone}
        className="min-h-0 flex-1"
      />
    </div>
  );
}
