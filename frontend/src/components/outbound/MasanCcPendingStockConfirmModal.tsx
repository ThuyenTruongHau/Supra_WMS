/**
 * Xác nhận số lượng lấy hàng tại ô CC (allocation pre_completed / stock_ready cache).
 */
import { useEffect, useMemo, useState } from "react";
import { Slider } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Button, Modal, Table, message } from "@/components/ui";
import { masanConfirmAllocationOutboundApi } from "@/api/masan";
import type { MasanSortingZonePendingAllocationRow } from "@/types/masan";
import { getApiErrorDetail } from "@/types/apiError";
import { toDisplayInteger } from "@/utils/number";
import {
  operatorModalWidthForTier,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";

type Props = {
  open: boolean;
  onClose: () => void;
  warehouseId: number;
  ccBucketZoneCode: string;
  locationId: number;
  locationName?: string | null;
  locationCode?: string | null;
  vehiclePlate?: string | null;
  allocations: MasanSortingZonePendingAllocationRow[];
  onConfirmed?: () => void;
  zIndex?: number;
};

export default function MasanCcPendingStockConfirmModal({
  open,
  onClose,
  warehouseId,
  ccBucketZoneCode,
  locationId,
  locationName = null,
  locationCode = null,
  vehiclePlate = null,
  allocations,
  onConfirmed,
  zIndex,
}: Props) {
  const tier = useOperatorViewportTier();
  const [viewportWidth, setViewportWidth] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth : 1280),
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const modalWidth = operatorModalWidthForTier(tier, viewportWidth);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickedQuantity, setPickedQuantity] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const selected = useMemo(
    () => allocations.find((a) => a.id === selectedId) ?? null,
    [allocations, selectedId],
  );

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setPickedQuantity(0);
      return;
    }
    if (allocations.length === 1) {
      setSelectedId(allocations[0].id);
    } else if (
      selectedId != null &&
      !allocations.some((a) => a.id === selectedId)
    ) {
      setSelectedId(allocations[0]?.id ?? null);
    }
  }, [open, allocations, selectedId]);

  useEffect(() => {
    if (!selected) {
      setPickedQuantity(0);
      return;
    }
    setPickedQuantity(Number(selected.quantity || 0));
  }, [selected?.id, selected?.quantity]);

  const maxQty = selected ? Number(selected.quantity || 0) : 0;
  const titleLabel =
    (locationName ?? "").trim() ||
    (locationCode ?? "").trim() ||
    `#${locationId}`;

  const handleConfirm = async () => {
    if (!selected || warehouseId <= 0 || !ccBucketZoneCode.trim()) {
      message.error("Thiếu thông tin xác nhận");
      return;
    }
    const qty = Math.round(pickedQuantity);
    if (qty <= 0 || qty > maxQty) {
      message.warning("Số lượng không hợp lệ");
      return;
    }
    setSubmitting(true);
    try {
      await masanConfirmAllocationOutboundApi({
        warehouse_id: warehouseId,
        zone: ccBucketZoneCode.trim(),
        location_id: locationId,
        allocation_id: selected.id,
        quantity: qty,
      });
      message.success("Đã xác nhận lấy hàng");
      onConfirmed?.();
      const remaining = allocations.filter((a) => a.id !== selected.id);
      if (remaining.length === 0) {
        onClose();
      } else {
        setSelectedId(remaining[0].id);
      }
    } catch (err: unknown) {
      message.error(getApiErrorDetail(err, "Không xác nhận được lấy hàng"));
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<MasanSortingZonePendingAllocationRow> = [
    {
      title: "Allocation",
      dataIndex: "id",
      width: 88,
    },
    {
      title: "SKU",
      key: "sku",
      ellipsis: true,
      render: (_: unknown, row) => {
        const sku = row.sku != null ? String(row.sku).trim() : "";
        return (
          <span className="font-mono font-semibold text-brand-dark">
            {sku || `#${row.item_stock_id}`}
          </span>
        );
      },
    },
    {
      title: "SL",
      dataIndex: "quantity",
      align: "right",
      render: (v: number) => toDisplayInteger(v),
    },
    {
      title: "TT",
      dataIndex: "status",
      ellipsis: true,
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Xác nhận lấy hàng tại ô CC"
      width={modalWidth}
      centered
      destroyOnHidden
      zIndex={zIndex}
      footer={null}
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700/70">
            Vị trí CC
          </p>
          <p className="mt-1 font-mono text-2xl font-bold text-brand-dark">
            {titleLabel}
          </p>
          {vehiclePlate ? (
            <p className="mt-1 font-mono text-base text-slate-600">
              Xe:{" "}
              <span className="font-semibold text-brand-dark">{vehiclePlate}</span>
            </p>
          ) : null}
        </div>

        {allocations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-12 text-center text-base text-slate-400">
            Không còn hàng chờ xác nhận tại ô này.
          </p>
        ) : (
          <>
            {allocations.length > 1 ? (
              <Table<MasanSortingZonePendingAllocationRow>
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={allocations}
                columns={columns}
                rowClassName={(record) =>
                  record.id === selectedId ? "bg-sky-50" : ""
                }
                onRow={(record) => ({
                  onClick: () => setSelectedId(record.id),
                  className: "cursor-pointer",
                })}
              />
            ) : null}

            {selected && maxQty > 0 ? (
              <div className="rounded-xl border border-slate-200 px-5 py-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Số lượng lấy (allocation #{selected.id})
                </p>
                <div className="mt-4 flex items-center gap-4">
                  <Slider
                    className="!m-0 flex-1"
                    min={0}
                    max={maxQty}
                    step={1}
                    value={pickedQuantity}
                    onChange={setPickedQuantity}
                    tooltip={{ formatter: (v) => `${v ?? 0}` }}
                  />
                  <span className="w-16 shrink-0 text-right font-mono text-2xl font-bold tabular-nums text-brand-primary">
                    {toDisplayInteger(pickedQuantity)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Tối đa: {toDisplayInteger(maxQty)}
                </p>
              </div>
            ) : null}
          </>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button variant="secondary" size="large" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant="primary"
            size="large"
            loading={submitting}
            onClick={() => void handleConfirm()}
            disabled={!selected || maxQty <= 0}
          >
            Xác nhận
          </Button>
        </div>
      </div>
    </Modal>
  );
}
