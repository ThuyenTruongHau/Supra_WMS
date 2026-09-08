/**
 * Modal outbound station — wizard 2 bước:
 * 1) Chọn 1 SKU đã gom từ sorting stations
 * 2) Preview lệnh pick/return → xác nhận lưu outbound_tasks
 */
import { useEffect, useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { Button, Modal, Table, message } from "@/components/ui";
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
  operatorDesktopTableWidths,
} from "@/constants/operatorDesktopSizes";
import {
  useConfirmStationStock,
  usePreviewStationStock,
  useStationProductAggregate,
} from "@/hooks/useOutboundTask";
import type {
  OutboundTaskType,
  StationProductLine,
  StationStockPreview,
  StationStockPreviewInput,
} from "@/types/outboundTask";
import { OUTBOUND_TASK_TYPE_LABELS } from "@/types/outboundTask";
import { formatDisplayBin } from "@/utils/locationBin";
import { toDisplayInteger } from "@/utils/number";

type Props = {
  open: boolean;
  zoneId: number;
  sortingWaveId: number;
  locationCode: string;
  locationId?: number | null;
  onClose: () => void;
  zIndex?: number;
};

type Step = 1 | 2;

type PreviewCommandRow = {
  key: string;
  type: OutboundTaskType;
  product_id: number;
  product_sku: string | null;
  product_name: string | null;
  outbound_order_code: string | null;
  outbound_order_id: number;
  /** Nguồn lấy hàng (pick = kho; return = station hiện tại) */
  source_bin: string | null;
  /** Vị trí hiện tại / đích (pick = station; return = kho trả về) */
  current_bin: string | null;
  quantity: number;
};

function displayBin(bin: string | null | undefined, fallback?: string | null) {
  const value = formatDisplayBin(bin, "outbound_station") || (fallback || "").trim();
  return value || "—";
}

function buildPreviewPayload(
  zoneId: number,
  sortingWaveId: number,
  product: StationProductLine,
  outboundLocationId?: number | null,
): StationStockPreviewInput {
  return {
    zone_id: zoneId,
    sorting_wave_id: sortingWaveId,
    outbound_location_id: outboundLocationId ?? undefined,
    products: [
      {
        product_id: product.product_id,
        total_quantity: Number(product.total_quantity),
        by_customer: product.by_customer.map((row) => ({
          customer_name: row.customer_name,
          quantity: Number(row.quantity),
          item_outbound_ids: row.item_outbound_ids,
        })),
      },
    ],
  };
}

function TypeTag({ type }: { type: OutboundTaskType }) {
  const styles: Record<OutboundTaskType, string> = {
    pick: "bg-green-100 text-green-700",
    return: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase ${styles[type]}`}
    >
      {OUTBOUND_TASK_TYPE_LABELS[type]}
    </span>
  );
}

export default function AssignOutboundStationModal({
  open,
  zoneId,
  sortingWaveId,
  locationCode,
  locationId,
  onClose,
  zIndex,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null,
  );
  const [preview, setPreview] = useState<StationStockPreview | null>(null);
  const [payload, setPayload] = useState<StationStockPreviewInput | null>(null);

  const aggregateQuery = useStationProductAggregate(
    zoneId,
    sortingWaveId,
    locationId,
    { enabled: open && zoneId > 0 && sortingWaveId > 0 },
  );
  const previewMutation = usePreviewStationStock();
  const confirmMutation = useConfirmStationStock(sortingWaveId, zoneId);

  const aggregate = aggregateQuery.data;
  const busy = previewMutation.isPending || confirmMutation.isPending;

  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedProductId(null);
      setPreview(null);
      setPayload(null);
    }
  }, [open]);

  const customerCount = aggregate?.customers.length ?? 0;
  const productCount = aggregate?.products.length ?? 0;

  const selectedProduct = useMemo(
    () =>
      aggregate?.products.find((p) => p.product_id === selectedProductId) ??
      null,
    [aggregate?.products, selectedProductId],
  );

  const commandRows = useMemo<PreviewCommandRow[]>(() => {
    if (!preview) return [];
    const stationBin = displayBin(
      preview.current_location_bin,
      preview.current_location_code,
    );
    const stationBinOrNull = stationBin === "—" ? null : stationBin;

    const picks: PreviewCommandRow[] = preview.picks.map((pick, index) => {
      const stockBin = displayBin(pick.location_bin, pick.location_code);
      return {
        key: `pick-${pick.product_id}-${pick.location_id}-${index}`,
        type: "pick" as const,
        product_id: pick.product_id,
        product_sku: pick.product_sku,
        product_name: pick.product_name,
        outbound_order_code: pick.outbound_order_code,
        outbound_order_id: pick.outbound_order_id,
        // Pick: lấy từ kho; vị trí hiện tại = station đang thao tác
        source_bin: stockBin === "—" ? null : stockBin,
        current_bin: stationBinOrNull,
        quantity: Number(pick.quantity),
      };
    });
    const returns: PreviewCommandRow[] = preview.returns.map((row, index) => {
      const stockBin = displayBin(row.location_bin, row.location_code);
      return {
        key: `return-${row.product_id}-${row.outbound_order_id}-${row.location_id ?? "x"}-${index}`,
        type: "return" as const,
        product_id: row.product_id,
        product_sku: row.product_sku,
        product_name: row.product_name,
        outbound_order_code: row.outbound_order_code,
        outbound_order_id: row.outbound_order_id,
        // Return: vị trí lấy = vị trí kho hiện tại (điểm trả về); hiện tại = station
        source_bin: stockBin === "—" ? null : stockBin,
        current_bin: stationBinOrNull,
        quantity: Number(row.quantity),
      };
    });
    return [...picks, ...returns];
  }, [preview]);

  const tw = operatorDesktopTableWidths.assignOutboundPreview;
  const commandColumns: ColumnsType<PreviewCommandRow> = useMemo(
    () => [
      {
        title: "Loại",
        dataIndex: "type",
        key: "type",
        width: tw.type,
        render: (value: OutboundTaskType) => <TypeTag type={value} />,
      },
      {
        title: "Mã SP",
        dataIndex: "product_sku",
        key: "product_sku",
        width: tw.sku,
        render: (value: string | null, record) =>
          value || `P${record.product_id}`,
      },
      {
        title: "Tên sản phẩm",
        dataIndex: "product_name",
        key: "product_name",
        width: tw.productName,
        render: (value: string | null) => (
          <div className="min-w-[100px] max-w-[180px] whitespace-normal break-words text-sm">
            {value ?? "—"}
          </div>
        ),
      },
      {
        title: "Mã đơn xuất",
        dataIndex: "outbound_order_code",
        key: "outbound_order_code",
        width: tw.orderCode,
        render: (value: string | null, record) =>
          value || `#${record.outbound_order_id}`,
      },
      {
        title: "Vị trí lấy",
        dataIndex: "source_bin",
        key: "source_bin",
        width: tw.sourceBin,
        render: (value: string | null) => value ?? "—",
      },
      {
        title: "Vị trí hiện tại",
        dataIndex: "current_bin",
        key: "current_bin",
        width: tw.currentBin,
        render: (value: string | null) => value ?? "—",
      },
      {
        title: "SL",
        dataIndex: "quantity",
        key: "quantity",
        width: tw.qty,
        align: "right",
        render: (value: number) => toDisplayInteger(value),
      },
    ],
    [],
  );

  const stepTitle = useMemo(() => {
    if (step === 1) return "Bước 1 · Chọn 1 loại hàng";
    return "Bước 2 · Xác nhận lệnh lấy kho";
  }, [step]);

  const handleNextFromAggregate = () => {
    if (!aggregate || aggregate.products.length === 0) {
      message.warning("Chưa có mặt hàng để lấy kho từ sorting stations");
      return;
    }
    if (!selectedProduct) {
      message.warning("Vui lòng chọn 1 loại hàng");
      return;
    }
    const nextPayload = buildPreviewPayload(
      zoneId,
      sortingWaveId,
      selectedProduct,
      locationId,
    );
    setPayload(nextPayload);
    previewMutation.mutate(nextPayload, {
      onSuccess: (data) => {
        setPreview(data);
        setStep(2);
      },
      onError: (err) => {
        message.error(
          err.response?.data?.detail ?? "Không lập được kế hoạch lấy kho",
        );
      },
    });
  };

  const handleConfirm = () => {
    if (!payload) {
      message.error("Thiếu payload xác nhận");
      return;
    }
    if (!preview || preview.picks.length === 0) {
      message.warning("Không có lệnh pick để xác nhận");
      return;
    }
    confirmMutation.mutate(payload, {
      onSuccess: (result) => {
        message.success(
          `Đã tạo ${result.created_task_count} lệnh outbound task`,
        );
        onClose();
      },
      onError: (err) => {
        message.error(
          err.response?.data?.detail ?? "Không tạo được lệnh lấy hàng",
        );
      },
    });
  };

  return (
    <Modal
      open={open}
      onCancel={busy ? undefined : onClose}
      title={`Outbound station · ${locationCode}`}
      width={OPERATOR_DESKTOP.modal.xl}
      destroyOnClose
      zIndex={zIndex}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {stepTitle}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Đóng
            </Button>
            {step === 2 ? (
              <Button
                variant="secondary"
                onClick={() => setStep(1)}
                disabled={busy}
              >
                Quay lại
              </Button>
            ) : null}
            {step === 1 ? (
              <Button
                onClick={handleNextFromAggregate}
                loading={previewMutation.isPending}
                disabled={
                  !aggregate || productCount === 0 || selectedProductId == null
                }
              >
                Tiếp tục
              </Button>
            ) : null}
            {step === 2 ? (
              <Button
                onClick={handleConfirm}
                loading={confirmMutation.isPending}
                disabled={!preview || preview.picks.length === 0}
              >
                Xác nhận và gửi
              </Button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-success-200 bg-success-50/70 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-success-700/70">
            Điểm xuất · wave #{sortingWaveId}
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-brand-dark">
            {locationCode}
          </p>
          {aggregate?.outbound_location_code ? (
            <p className="mt-1 text-xs text-slate-500">
              API location: {aggregate.outbound_location_code}
            </p>
          ) : null}
        </div>

        {step === 1 ? (
          <>
            {aggregateQuery.isLoading ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                Đang gom mặt hàng từ sorting stations...
              </div>
            ) : aggregateQuery.isError ? (
              <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-10 text-center text-sm text-error-600">
                {aggregateQuery.error.response?.data?.detail ??
                  "Không tải được tổng hợp mặt hàng"}
              </div>
            ) : productCount === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                Chưa có detail nào được gán sorting trong wave này
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1">
                    {customerCount} KH
                  </span>
                  <span className="rounded-md border border-slate-200 bg-white px-2 py-1">
                    {productCount} SKU
                  </span>
                  <span className="normal-case font-medium tracking-normal text-slate-400">
                    Chọn đúng 1 loại hàng rồi bấm Tiếp tục
                  </span>
                </div>

                <div
                  className={`${operatorDesktopClass.listMax40} space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Khách hàng (sau quy tắc xe/KH)
                  </p>
                  {(aggregate?.customers ?? []).map((customer) => (
                    <div
                      key={`${customer.customer_name}-${customer.vehicle_number}-${customer.sorting_position}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <span className="font-semibold text-brand-dark">
                        {customer.customer_name}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {customer.vehicle_number || "—"} ·{" "}
                        {customer.sorting_position || "—"} ·{" "}
                        {customer.assign_mode || "—"}
                      </span>
                    </div>
                  ))}
                </div>

                <div
                  className={`${operatorDesktopClass.listMax280} space-y-2 overflow-y-auto pr-1`}
                >
                  {(aggregate?.products ?? []).map((product) => {
                    const selected = selectedProductId === product.product_id;
                    return (
                      <button
                        key={product.product_id}
                        type="button"
                        onClick={() => setSelectedProductId(product.product_id)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                          selected
                            ? "border-success-500 bg-success-50 ring-2 ring-success-200"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-mono text-sm font-bold text-brand-dark">
                              {product.product_sku ||
                                `ID ${product.product_id}`}
                            </p>
                            <p className="text-sm text-slate-600">
                              {product.product_name || "—"}
                            </p>
                          </div>
                          <p className="font-mono text-base font-black text-success-700">
                            {toDisplayInteger(product.total_quantity)}
                          </p>
                        </div>
                        <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                          {product.by_customer.map((row) => (
                            <p
                              key={`${product.product_id}-${row.customer_name}`}
                              className="flex justify-between gap-3 text-xs text-slate-600"
                            >
                              <span>{row.customer_name}</span>
                              <span className="font-mono font-semibold">
                                {toDisplayInteger(row.quantity)}
                              </span>
                            </p>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : null}

        {step === 2 && preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="rounded-md border border-green-200 bg-green-50 px-2 py-1 text-green-700">
                Pick · {preview.picks.length}
              </span>
              <span className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-red-700">
                Return · {preview.returns.length}
              </span>
            </div>

            {commandRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                Không còn nhu cầu lấy hàng (đã allocate đủ)
              </div>
            ) : (
              <>
                <Table<PreviewCommandRow>
                  columns={commandColumns}
                  dataSource={commandRows}
                  rowKey="key"
                  pagination={false}
                  scroll={{ x: 860, y: 320 }}
                  rowClassName={(record) =>
                    record.type === "return"
                      ? "[&>td]:!bg-red-100 [&>td]:!border-y [&>td]:!border-red-200 hover:[&>td]:!bg-red-200"
                      : "[&>td]:!bg-green-100 [&>td]:!border-y [&>td]:!border-green-200 hover:[&>td]:!bg-green-200"
                  }
                  className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-slate-600"
                />
                <p className="text-xs text-slate-500">
                  Bấm &quot;Xác nhận và gửi&quot; để lưu lệnh, reserve tồn kho và
                  đánh dấu mặt hàng đã tạo lệnh (không chọn lại được).
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
