/**
 * Modal bước chọn SKU khi chọn outbound station (giống bước 1 AssignOutboundStationModal).
 * Chỉ chọn dòng nhu cầu — không tạo outbound_tasks.
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Modal, cn, message } from "@/components/ui";
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
} from "@/constants/operatorDesktopSizes";
import { useStationProductAggregate } from "@/hooks/useOutboundTask";
import type { StationProductLine } from "@/types/outboundTask";
import { toDisplayInteger } from "@/utils/number";

type Props = {
  open: boolean;
  zoneId: number;
  sortingWaveId: number;
  locationId: number;
  locationCode: string;
  /** Nếu đã gán điểm nhập — ưu tiên/highlight SKU khớp */
  preferredProductId?: number | null;
  onClose: () => void;
  onSelected: (product: StationProductLine) => void;
};

export default function SelectDirectOutboundProductModal({
  open,
  zoneId,
  sortingWaveId,
  locationId,
  locationCode,
  preferredProductId = null,
  onClose,
  onSelected,
}: Props) {
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null,
  );

  const aggregateQuery = useStationProductAggregate(
    zoneId,
    sortingWaveId,
    locationId,
    { enabled: open && zoneId > 0 && sortingWaveId > 0 && locationId > 0 },
  );

  const products = aggregateQuery.data?.products ?? [];
  const customers = aggregateQuery.data?.customers ?? [];

  useEffect(() => {
    if (!open) {
      setSelectedProductId(null);
      return;
    }
    if (preferredProductId && products.some((p) => p.product_id === preferredProductId)) {
      setSelectedProductId(preferredProductId);
      return;
    }
    setSelectedProductId(products[0]?.product_id ?? null);
  }, [open, preferredProductId, products]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.product_id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const handleConfirm = () => {
    if (!selectedProduct) {
      message.warning("Vui lòng chọn một sản phẩm");
      return;
    }
    onSelected(selectedProduct);
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`Chọn sản phẩm xuất · ${locationCode}`}
      width={OPERATOR_DESKTOP.modal.md}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!selectedProduct}
          >
            Xác nhận chọn SKU
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Outbound station · nhu cầu từ sorting wave
          </p>
          <p className="mt-1 font-mono text-lg font-bold text-brand-dark">
            {locationCode}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {aggregateQuery.isLoading
              ? "Đang tải danh sách sản phẩm..."
              : `${products.length} SKU · ${customers.length} KH/xe`}
          </p>
        </div>

        {aggregateQuery.isError ? (
          <p className="text-sm text-error-600">
            Không tải được danh sách sản phẩm cho station này.
          </p>
        ) : null}

        {!aggregateQuery.isLoading && products.length === 0 ? (
          <p className="text-sm text-slate-500">
            Không còn nhu cầu xuất trên wave cho station này.
          </p>
        ) : (
          <div
            className={`grid ${operatorDesktopClass.listMax50vh} grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2`}
          >
            {products.map((product) => {
              const active = product.product_id === selectedProductId;
              const preferred =
                preferredProductId != null &&
                product.product_id === preferredProductId;
              return (
                <button
                  key={product.product_id}
                  type="button"
                  onClick={() => setSelectedProductId(product.product_id)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-left transition",
                    active
                      ? "border-brand-primary bg-brand-primary/5 shadow-sm"
                      : "border-stripe-hairline bg-white hover:border-brand-primary/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-sm font-bold text-brand-dark">
                      {product.product_sku || `#${product.product_id}`}
                    </p>
                    {preferred ? (
                      <span className="rounded-full bg-success-100 px-2 py-0.5 text-[10px] font-semibold text-success-700">
                        Khớp điểm nhập
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {product.product_name || "—"}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-success-700">
                    Còn cần: {toDisplayInteger(product.total_quantity)}
                  </p>
                  {product.by_customer.length > 0 ? (
                    <p className="mt-1 truncate text-[11px] text-slate-400">
                      {product.by_customer
                        .map((c) => c.customer_name)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
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
