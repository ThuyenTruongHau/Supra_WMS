/**
 * Modal xác nhận SL đã lấy theo xe trên ô sorting (demo FE).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "antd";
import { Button, Modal, message } from "@/components/ui";
import type {
  SortingStationAssignment,
  SortingStationFillStation,
} from "@/types/outbound";
import {
  STATION_PICK_TOTAL_KEY,
  buildVehiclePickWithRemaining,
  resolveStationPlateHeader,
  type StationPickConfirm,
} from "@/utils/sortingStationPickRows";
import { toDisplayInteger } from "@/utils/number";

type Props = {
  open: boolean;
  assignment: SortingStationAssignment | null;
  fillStation: SortingStationFillStation | null | undefined;
  previousPicks?: StationPickConfirm;
  onClose: () => void;
  onConfirm: (locationCode: string, picks: StationPickConfirm) => void;
  zIndex?: number;
};

export default function SortingStationPickConfirmModal({
  open,
  assignment,
  fillStation,
  previousPicks,
  onClose,
  onConfirm,
  zIndex,
}: Props) {
  const locationCode =
    assignment?.location_code ?? fillStation?.location_code ?? "—";
  const plateHeader = resolveStationPlateHeader(assignment, fillStation);

  const pickSummary = useMemo(
    () =>
      buildVehiclePickWithRemaining(
        assignment,
        fillStation,
        previousPicks,
      ),
    [assignment, fillStation, previousPicks],
  );

  const [pickedQuantity, setPickedQuantity] = useState(0);
  const initSessionRef = useRef<string | null>(null);

  const initSessionKey = useMemo(
    () => `${pickSummary.remainingQuantity}:${pickSummary.productSku}`,
    [pickSummary.remainingQuantity, pickSummary.productSku],
  );

  useEffect(() => {
    if (!open) {
      initSessionRef.current = null;
      setPickedQuantity(0);
      return;
    }
    if (pickSummary.remainingQuantity <= 0) return;

    const sessionKey = `${locationCode}|${initSessionKey}`;
    if (initSessionRef.current === sessionKey) return;
    initSessionRef.current = sessionKey;
    setPickedQuantity(pickSummary.remainingQuantity);
  }, [open, locationCode, initSessionKey, pickSummary.remainingQuantity]);

  const handleConfirm = () => {
    if (!locationCode || locationCode === "—") {
      message.error("Không xác định được ô sorting");
      return;
    }
    onConfirm(locationCode, { [STATION_PICK_TOTAL_KEY]: pickedQuantity });
    message.success("Đã xác nhận số lượng lấy hàng");
    onClose();
  };

  const hasQuantity = pickSummary.remainingQuantity > 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Xác nhận lấy hàng"
      width="min(720px, 92vw)"
      centered
      destroyOnHidden
      zIndex={zIndex}
      footer={null}
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-700/70">
                Ô sorting
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-brand-dark">
                {locationCode}
              </p>
              {plateHeader ? (
                <p className="mt-1 font-mono text-base text-slate-600">
                  Xe:{" "}
                  <span className="font-semibold text-brand-dark">
                    {plateHeader}
                  </span>
                </p>
              ) : null}
              {pickSummary.productSku !== "—" ? (
                <p className="mt-1 text-sm text-slate-600">
                  {pickSummary.productSku}
                  {pickSummary.productName !== "—"
                    ? ` · ${pickSummary.productName}`
                    : ""}
                </p>
              ) : null}
            </div>
            {hasQuantity ? (
              <div className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Tổng cần lấy
                </p>
                <p className="font-mono text-2xl font-bold tabular-nums text-brand-primary">
                  {toDisplayInteger(pickSummary.remainingQuantity)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Đang chọn:{" "}
                  <span className="font-semibold text-brand-dark">
                    {toDisplayInteger(pickedQuantity)}
                  </span>
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {!hasQuantity ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-base text-slate-400">
            Không còn số lượng cần lấy trên ô này.
          </p>
        ) : (
          <div className="rounded-xl border border-slate-200 px-5 py-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Số lượng lấy
            </p>
            <div className="mt-4 flex items-center gap-4">
              <Slider
                className="!m-0 flex-1"
                min={0}
                max={pickSummary.remainingQuantity}
                step={1}
                value={pickedQuantity}
                onChange={setPickedQuantity}
                tooltip={{ formatter: (v) => `${v ?? 0}` }}
              />
              <span className="w-16 shrink-0 text-right font-mono text-2xl font-bold tabular-nums text-brand-primary">
                {toDisplayInteger(pickedQuantity)}
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="secondary" size="large" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="primary"
            size="large"
            onClick={handleConfirm}
            disabled={!hasQuantity}
          >
            Xác nhận
          </Button>
        </div>
      </div>
    </Modal>
  );
}
