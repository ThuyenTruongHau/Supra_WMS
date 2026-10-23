import { useEffect, useMemo, useState } from "react";
import { Button, Loading, Modal, cn } from "@/components/ui";
import type { FullLocationDetail } from "@/types/warehouseMap";
import { getLocationDisplayLabel } from "@/utils/locationBin";
import {
  operatorCallCommandModalWidthForTier,
  operatorModalActionButtonClass,
  operatorVtLocationPickButtonClass,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";

export type MasanVtLocationPick = {
  locationId: number;
  locationCode: string;
  locationName: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string | null;
  locations: FullLocationDetail[];
  /** Zone map DB (vd. 8, 9) — hiển thị khi danh sách trống. */
  vtZoneIds?: number[];
  isLoading?: boolean;
  failedZoneIds?: number[];
  /** Parent opens the next dialog; onClose is reserved for cancelling selection. */
  onSelect: (pick: MasanVtLocationPick) => void;
  zIndex?: number;
};

export default function MasanVtLocationPickerModal({
  open,
  onClose,
  title = "Chọn vị trí VT",
  subtitle = "Chọn một trong các vị trí VT để gửi lệnh xuất",
  locations,
  vtZoneIds = [],
  isLoading = false,
  failedZoneIds = [],
  onSelect,
  zIndex,
}: Props) {
  const tier = useOperatorViewportTier();
  const [viewportWidth, setViewportWidth] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth : 1280),
  );

  useEffect(() => {
    const onResize = () => {
      const vv = window.visualViewport;
      setViewportWidth(Math.round(vv?.width ?? window.innerWidth));
    };
    onResize();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  const modalWidth = useMemo(
    () => operatorCallCommandModalWidthForTier(tier, viewportWidth),
    [tier, viewportWidth, open],
  );

  const sortedLocations = useMemo(
    () =>
      [...locations].sort((a, b) =>
        a.location_code.localeCompare(b.location_code, undefined, {
          numeric: true,
        }),
      ),
    [locations],
  );

  const emptyMessage = useMemo(() => {
    if (isLoading) return null;
    if (vtZoneIds.length === 0) {
      return "Khu chia chọn không hợp lệ (chỉ hỗ trợ display zone 8 hoặc 9).";
    }
    if (failedZoneIds.length > 0) {
      return `Không tải được map zone VT (${failedZoneIds.join(", ")}). Kiểm tra cấu hình zone trên server.`;
    }
    return `Chưa có vị trí VT trong zone map ${vtZoneIds.join(", ")}. Kiểm tra gán location vào đúng zone VT.`;
  }, [failedZoneIds, isLoading, vtZoneIds]);

  const handlePick = (loc: FullLocationDetail) => {
    const locationName =
      (loc.location_name ?? "").trim() || loc.location_code;
    onSelect({
      locationId: loc.id,
      locationCode: loc.location_code,
      locationName,
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      width={modalWidth}
      centered
      destroyOnHidden
      zIndex={zIndex}
      className="operator-call-command-modal"
      footer={
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={onClose}
            className={operatorModalActionButtonClass(tier)}
          >
            Hủy
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {subtitle ? (
          <p className="text-sm font-medium text-slate-500">{subtitle}</p>
        ) : null}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loading text="Đang tải danh sách VT..." />
          </div>
        ) : sortedLocations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-slate-400">
            {emptyMessage}
          </p>
        ) : (
          <div
            className={cn(
              "grid gap-3",
              sortedLocations.length <= 2
                ? "grid-cols-2"
                : "grid-cols-2 sm:grid-cols-4",
            )}
          >
            {sortedLocations.map((loc) => {
              const label =
                getLocationDisplayLabel(loc).trim() ||
                (loc.location_name ?? "").trim() ||
                loc.location_code;
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handlePick(loc)}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-xl border-2 border-slate-200 bg-white px-3 text-center transition hover:border-brand-primary hover:bg-sky-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40",
                    operatorVtLocationPickButtonClass(tier),
                  )}
                >
                  <span className="font-mono text-xl font-black text-brand-dark">
                    {label}
                  </span>
                  {label !== loc.location_code ? (
                    <span className="mt-1 font-mono text-xs text-slate-400">
                      {loc.location_code}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
