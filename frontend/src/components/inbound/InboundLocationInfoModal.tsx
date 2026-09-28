import { Modal } from "@/components/ui";
import { useLocationDetail } from "@/hooks/useWarehouseLocation";
import { useProduct } from "@/hooks/useProduct";
import { formatDisplayBin } from "@/utils/locationBin";
import { toDisplayInteger } from "@/utils/number";

type Props = {
  open: boolean;
  zoneId: number;
  locationId: number | null;
  onClose: () => void;
};

function displayValue(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return String(value);
}

export default function InboundLocationInfoModal({
  open,
  zoneId,
  locationId,
  onClose,
}: Props) {
  const {
    data,
    isLoading,
    isError,
  } = useLocationDetail(locationId, open);
  const { data: products = [] } = useProduct(zoneId);
  const productById = new Map(products.map((product) => [product.id, product]));

  const location = data?.location;
  const locationName = location
    ? formatDisplayBin(location.bin, location.location_type) ||
      location.location_code
    : "";

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="92vw"
      style={{ maxWidth: 1200, top: 28 }}
      title={
        locationName
          ? `Thông tin vị trí ${locationName}`
          : "Thông tin vị trí và item stock"
      }
      destroyOnHidden
    >
      {isLoading ? (
        <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
          Đang tải thông tin vị trí...
        </div>
      ) : isError || !data ? (
        <div className="flex min-h-64 items-center justify-center text-sm text-error-600">
          Không tải được thông tin vị trí.
        </div>
      ) : (
        <div className="max-h-[76vh] space-y-5 overflow-y-auto pr-1">
          <div className="overflow-hidden rounded-2xl border border-stripe-hairline bg-panel px-5 py-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-stripe-ink-mute">
                  Warehouse location
                </p>
                <h3 className="mt-1 font-mono text-3xl font-extrabold text-brand-dark">
                  {locationName || data.location.location_code}
                </h3>
                <p className="mt-1 text-base font-medium text-stripe-ink-mute">
                  {data.location.node_name || data.location.location_code}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  data.item_stock.length > 0
                    ? "bg-success-100 text-success-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {data.item_stock.length > 0 ? "Có hàng" : "Đang trống"}
              </span>
            </div>
          </div>

          <div className="grid items-stretch gap-4 lg:grid-cols-2">
            <section className="flex min-h-[360px] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex min-h-7 items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
                  Thông tin vị trí
                </h4>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">
                  Location
                </span>
              </div>
              <dl className="space-y-0">
                {[
                  ["Mã location", data.location.location_code],
                  ["Loại", data.location.location_type],
                  [
                    "Hàng / Cột / Tầng",
                    [
                      data.location.row,
                      data.location.column,
                      data.location.level,
                    ]
                      .map(displayValue)
                      .join(" / "),
                  ],
                  [
                    "Bin",
                    formatDisplayBin(
                      data.location.bin,
                      data.location.location_type,
                    ),
                  ],
                  ["Sức chứa", data.location.capacity],
                  ["Trạng thái", data.location.status],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="grid grid-cols-[130px_1fr] gap-3 border-b border-slate-100 py-3 last:border-0"
                  >
                    <dt className="text-base text-slate-500">{label}</dt>
                    <dd className="break-words text-base font-semibold text-slate-700">
                      {displayValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="flex min-h-[360px] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex min-h-7 items-center justify-between border-b border-slate-100 pb-3">
                <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-500">
                  Sản phẩm tại vị trí
                </h4>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-500">
                  {data.item_stock.length} item
                </span>
              </div>

              {data.item_stock.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm font-medium text-slate-500">
                  Vị trí này chưa có item stock
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {data.item_stock.map((stock) => {
                    const product = productById.get(stock.product_id);
                    return (
                      <article
                        key={stock.id}
                        className="py-5 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold text-slate-800">
                              {product?.name || `Sản phẩm #${stock.product_id}`}
                            </p>
                            <p className="mt-1 font-mono text-base text-slate-500">
                              {product?.sku || `#${stock.product_id}`}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-2xl font-bold tabular-nums text-brand-dark">
                              {toDisplayInteger(
                                Number(stock.available_quantity || 0),
                              )}
                            </p>
                            <p className="text-sm text-slate-500">
                              {product?.base_unit || "khả dụng"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                          <div>
                            <p className="text-sm text-slate-500">Tổng SL</p>
                            <p className="mt-1 text-base font-semibold tabular-nums text-slate-700">
                              {toDisplayInteger(Number(stock.quantity || 0))}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-slate-500">Đã giữ</p>
                            <p className="mt-1 text-base font-semibold tabular-nums text-slate-700">
                              {toDisplayInteger(
                                Number(stock.reserved_quantity || 0),
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-slate-500">LOT</p>
                            <p className="mt-1 text-base font-medium text-slate-700">
                              {displayValue(stock.lot_number)}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-slate-500">Hạn dùng</p>
                            <p className="mt-1 text-base font-medium text-slate-700">
                              {displayValue(stock.expiry_date)}
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </Modal>
  );
}
