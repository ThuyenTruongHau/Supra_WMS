import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import OperatorPageHeader from "@/components/layout/OperatorPageHeader";
import { useOperatorShell } from "@/components/layout/OperatorShellContext";
import { useAppStore } from "@/store/useAppStore";
import { useWarehouses } from "@/hooks/useWarehouse";
import SortingWaveOverviewPicker from "@/components/outbound/SortingWaveOverviewPicker";

export default function OperatorOutboundPage() {
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);
  const { setShellHeaderCollapsed } = useOperatorShell();

  // Lấy tên Kho để hiển thị trên Header
  const { data: warehousesData } = useWarehouses();
  const warehouseName = warehousesData?.find((w) => w.id === selectedWarehouseId)?.name ?? "Kho được gán";
  const navigate = useNavigate();
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    setShellHeaderCollapsed(true);
    return () => setShellHeaderCollapsed(false);
  }, [setShellHeaderCollapsed]);

  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const clockLabel = clock.toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const handleEnterZoneDetail = useCallback((zoneId: number) => {
    navigate(`/export/zone/${zoneId}`);
  }, [navigate]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <OperatorPageHeader
        title="Đơn xuất và chia chọn"
        warehouseName={warehouseName}
        clockLabel={clockLabel}
        collapsible
        collapseShellHeader
        defaultCollapsed
        largeMetrics
      />

      <SortingWaveOverviewPicker
        onSelectZone={handleEnterZoneDetail}
        className="min-h-0 flex-1"
      />
    </div>
  );
}
