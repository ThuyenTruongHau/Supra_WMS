/**
 * Trang user: Màn hình chia chọn — tab wave + bản đồ sorting/outbound.
 * Admin dùng SortingWavePage (CRUD bảng).
 */
import OperatorPageHeader from "@/components/layout/OperatorPageHeader";
import { operatorDesktopClass } from "@/constants/operatorDesktopSizes";
import { useAppStore } from "@/store/useAppStore";
import { useZone } from "@/hooks/useZone";
import SortingWaveStationBoard from "@/components/outbound/SortingWaveStationBoard";

export default function OperatorSortingWavePage() {
  const { selectedWarehouseId } = useAppStore();
  const { data: zones = [] } = useZone();
  const selectedWarehouseName =
    zones.find((zone) => zone.id === selectedWarehouseId)?.name ??
    "Chưa chọn kho";
  const zoneId = selectedWarehouseId ?? 0;

  return (
    <div
      className={`flex ${operatorDesktopClass.sortingPageMinHeight} flex-col gap-3`}
    >


      <SortingWaveStationBoard
        zoneId={zoneId}
        fillHeight
        showMapFullscreen
        className="min-h-0 flex-1"
        emptyHint={
          <p className="text-sm text-slate-500">
            Chưa có wave trong kho này. Liên hệ admin cấu hình tại{" "}
            <span className="font-semibold text-brand-dark">
              Quản lý chia chọn
            </span>
            .
          </p>
        }
      />
    </div>
  );
}
