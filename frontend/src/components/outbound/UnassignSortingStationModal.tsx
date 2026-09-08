/**
 * Modal hủy gán sorting station — clear sorting_position + reset status đơn.
 * Có thêm Clear đơn chia: chỉ xóa số fill trên ô, không hủy gán số xe.
 */
import { useEffect, useState } from "react";
import { Button, Modal, message } from "@/components/ui";
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
} from "@/constants/operatorDesktopSizes";
import {
  useClearSortingStationFill,
  useUnassignSortingPosition,
} from "@/hooks/useOutbound";
import { getSortingStationAssignmentApi } from "@/api/outbound";
import type { SortingStationAssignment } from "@/types/outbound";
import { outboundStatusLabel } from "@/utils/outboundStatusLabel";
import { toDisplayInteger } from "@/utils/number";

type Props = {
  open: boolean;
  assignment: SortingStationAssignment | null;
  onClose: () => void;
  onUnassigned?: () => void;
  onFillCleared?: () => void;
  zIndex?: number;
};

export default function UnassignSortingStationModal({
  open,
  assignment: assignmentProp,
  onClose,
  onUnassigned,
  onFillCleared,
  zIndex,
}: Props) {
  const unassignMutation = useUnassignSortingPosition();
  const clearFillMutation = useClearSortingStationFill();
  const [assignment, setAssignment] = useState<SortingStationAssignment | null>(
    assignmentProp,
  );

  useEffect(() => {
    setAssignment(assignmentProp);
  }, [assignmentProp]);

  const details = assignment?.details ?? [];
  const fillLines = assignment?.fill_lines ?? [];
  const hasFill = Boolean(assignment?.has_fill && fillLines.length > 0);
  const locationCode = assignment?.location_code ?? "—";
  const displayLabel = assignment?.display_label?.trim() || null;
  const busy = unassignMutation.isPending || clearFillMutation.isPending;

  const handleConfirm = () => {
    if (!assignment?.zone_id || !assignment.location_code) {
      message.error("Không xác định được ô sorting để hủy gán");
      return;
    }
    unassignMutation.mutate(
      {
        zone_id: assignment.zone_id,
        sorting_position: assignment.location_code,
      },
      {
        onSuccess: (result) => {
          message.success(
            `Đã hủy gán ${result.updated_count} nhóm detail khỏi ô ${result.sorting_position}`,
          );
          onUnassigned?.();
          onClose();
        },
        onError: (err) => {
          message.error(
            err.response?.data?.detail ?? "Không hủy gán được sorting station",
          );
        },
      },
    );
  };

  const handleClearFill = () => {
    if (!assignment?.zone_id || !assignment.location_code) {
      message.error("Không xác định được ô sorting để clear đơn chia");
      return;
    }
    const zoneId = assignment.zone_id;
    const code = assignment.location_code;
    const locationId = assignment.location_id;
    clearFillMutation.mutate(
      {
        zone_id: zoneId,
        sorting_position: code,
      },
      {
        onSuccess: async (result) => {
          message.success(
            `Đã clear ${result.deleted_count} dòng đơn chia trên ô ${result.sorting_position}`,
          );
          onFillCleared?.();
          try {
            const refreshed = await getSortingStationAssignmentApi({
              zoneId,
              locationCode: code,
              locationId,
            });
            setAssignment(refreshed);
            // Giữ modal mở nếu vẫn còn gán số xe; chỉ đóng khi không còn gì
            if (!refreshed.is_assigned && !refreshed.has_fill) {
              onClose();
            }
          } catch {
            // Fill đã clear; gán vẫn còn trên map qua assignment_labels
          }
        },
        onError: (err) => {
          message.error(
            err.response?.data?.detail ?? "Không clear được đơn chia",
          );
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onCancel={busy ? undefined : onClose}
      title="Hủy gán vị trí chia chọn"
      width={OPERATOR_DESKTOP.modal.sm}
      destroyOnClose
      zIndex={zIndex}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Đóng
          </Button>
          {hasFill ? (
            <Button
              variant="secondary"
              className="!border-sky-200 !text-sky-700 hover:!border-sky-300 hover:!bg-sky-50"
              onClick={handleClearFill}
              loading={clearFillMutation.isPending}
              disabled={busy}
            >
              Clear đơn chia
            </Button>
          ) : null}
          <Button
            variant="danger"
            onClick={handleConfirm}
            loading={unassignMutation.isPending}
            disabled={busy || details.length === 0}
          >
            Xác nhận hủy gán
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-warning-700/70">
            Ô đang gán
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-brand-dark">
            {locationCode}
          </p>
          {displayLabel ? (
            <p className="mt-1 text-sm text-slate-600">
              Đang gán:{" "}
              <span className="font-semibold text-brand-dark">{displayLabel}</span>
            </p>
          ) : null}
          {hasFill ? (
            <p className="mt-1 text-sm text-sky-700">
              Đơn chia đã fill:{" "}
              <span className="font-semibold tabular-nums">
                SL {toDisplayInteger(assignment?.fill_total_quantity ?? 0)}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">
              Chưa có / đã clear lớp đơn chia — số xe gán vẫn giữ.
            </p>
          )}
        </div>

        {hasFill ? (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Số lượng đã chia theo khách hàng
            </p>
            <div
              className={`${operatorDesktopClass.listMax40} space-y-2 overflow-y-auto`}
            >
              {fillLines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2"
                >
                  <p className="text-sm font-semibold text-brand-dark">
                    {line.customer_name || "—"}
                    {line.vehicle_number ? (
                      <span className="ml-1 font-mono text-xs font-normal text-slate-500">
                        · {line.vehicle_number}
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {line.product_sku || `P${line.product_id}`}
                    {line.product_name ? ` · ${line.product_name}` : ""} ·{" "}
                    <span className="font-mono font-semibold text-sky-700">
                      SL {toDisplayInteger(line.quantity)}
                    </span>
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              <span className="font-semibold">Clear đơn chia</span> chỉ xóa các
              số fill — không hủy gán số xe trên ô.
            </p>
          </div>
        ) : null}

        <p className="text-sm text-slate-600">
          Hủy gán sẽ xóa <span className="font-semibold">sorting position</span>{" "}
          của mọi detail trên ô, đưa status về pending (nếu chưa picking), và
          đánh dấu ô trống nếu không còn ai gán.
        </p>

        {details.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
            {hasFill
              ? "Không còn detail gán — có thể Clear đơn chia."
              : "Không có detail gán trên ô này."}
          </p>
        ) : (
          <div
            className={`${operatorDesktopClass.listMax56} space-y-2 overflow-y-auto`}
          >
            {details.map((line) => (
              <div
                key={line.id}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2.5"
              >
                <p className="font-mono text-sm font-bold text-brand-dark">
                  {line.order_code} · Detail #{line.id}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {line.vehicle_number || "—"} · {line.customer_name || "—"} ·{" "}
                  {outboundStatusLabel(line.status)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
