import InboundStatusTag from "@/components/shared/InboundStatusTag";
import type {
  ItemStockLookup,
  OrderBrief,
  TransactionHistoryLookupResponse,
} from "@/types/transactionHistory";
import { formatQuantity } from "@/utils/formatQuantity";
import {
  formatDateTime,
  formatFieldValue,
  formatLocation,
  objectToPreviewRows,
  type PreviewRow,
} from "./backlogFormatters";

function PreviewGrid({ rows }: { rows: PreviewRow[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {row.label}
          </dt>
          {row.isJson ? (
            <dd className="mt-1">
              <pre className="max-h-40 overflow-auto rounded-md bg-white p-2 text-xs text-slate-700 ring-1 ring-slate-200">
                {row.value}
              </pre>
            </dd>
          ) : (
            <dd className="truncate text-sm text-slate-800">{row.value}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

function buildItemStockRows(stock: ItemStockLookup): PreviewRow[] {
  const rows: PreviewRow[] = [
    { label: "SKU", value: stock.item_sku ?? "—" },
    { label: "Tên hàng", value: stock.item_name ?? "—" },
    {
      label: "Vị trí",
      value: formatLocation(stock.location_code, stock.location_name),
    },
    { label: "Đơn vị", value: stock.unit_name ?? "—" },
    {
      label: "Số lượng",
      value: `${formatQuantity(stock.quantity)}${stock.unit_name ? ` ${stock.unit_name}` : ""}`,
    },
    { label: "Khả dụng", value: formatQuantity(stock.available_quantity) },
    { label: "Số lô", value: stock.lot_number ?? "—" },
    { label: "Lô từ", value: stock.lot_number_from ?? "—" },
    { label: "Lô đến", value: stock.lot_number_to ?? "—" },
    { label: "Hạn sử dụng", value: stock.expiry_date ?? "—" },
    { label: "Trạng thái", value: formatFieldValue(stock.status, "status") },
    {
      label: "Đang hoạt động",
      value: formatFieldValue(stock.is_active, "is_active"),
    },
    { label: "QC", value: stock.qc_user ?? "—" },
    { label: "Máy SX", value: stock.manufacturing_machine ?? "—" },
    { label: "Người SX", value: stock.manufacturing_user ?? "—" },
    { label: "Người đóng gói", value: stock.packing_user ?? "—" },
    { label: "Số cavity", value: stock.cavity_number ?? "—" },
    {
      label: "Tầng tồn",
      value:
        stock.stock_level != null ? String(stock.stock_level) : "—",
    },
    { label: "Tạo lúc", value: formatDateTime(stock.created_at) },
    { label: "Cập nhật", value: formatDateTime(stock.updated_at) },
  ];

  return rows;
}

function buildOrderRows(
  order: OrderBrief,
  meta: {
    order_type?: string | null;
    order_code?: string | null;
  },
): PreviewRow[] {
  const scalarRows: PreviewRow[] = [
    { label: "Mã đơn", value: order.order_code },
    {
      label: "Trạng thái",
      value: formatFieldValue(order.status, "status"),
    },
    { label: "Ghi chú", value: order.note?.trim() ? order.note : "—" },
    { label: "Tạo lúc", value: formatDateTime(order.created_at) },
    { label: "Cập nhật", value: formatDateTime(order.updated_at) },
  ];

  if (meta.order_type) {
    scalarRows.unshift({
      label: "Loại đơn",
      value: formatFieldValue(meta.order_type, "order_type"),
    });
  }

  const detailRows = objectToPreviewRows(
    { details: order.details },
    [],
  );

  return [...scalarRows, ...detailRows];
}

type BacklogLookupPreviewProps = {
  data: TransactionHistoryLookupResponse;
};

export default function BacklogLookupPreview({
  data,
}: BacklogLookupPreviewProps) {
  if (data.lookup_type === "qr_code" && data.item_stock) {
    const rows = buildItemStockRows(data.item_stock);

    return (
      <section className="rounded-xl border border-slate-200 border-l-4 border-l-brand-primary bg-slate-50/60 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-brand-dark">
            Thông tin tồn kho
          </h3>
          <InboundStatusTag status={data.item_stock.status} size="sm" />
          {data.qr_code ? (
            <span className="rounded-full bg-brand-primary/10 px-3 py-0.5 text-xs font-medium text-brand-dark">
              Mã QR: {data.qr_code}
            </span>
          ) : null}
        </div>
        <PreviewGrid rows={rows} />
      </section>
    );
  }

  if (data.lookup_type === "order" && data.order) {
    const orderTypeLabel =
      data.order_type === "outbound" ? "Đơn xuất" : "Đơn nhập";
    const rows = buildOrderRows(data.order, {
      order_type: data.order_type,
      order_code: data.order_code,
    });

    return (
      <section className="rounded-xl border border-slate-200 border-l-4 border-l-brand-primary bg-slate-50/60 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-brand-dark">
            {orderTypeLabel}: {data.order.order_code}
          </h3>
          <InboundStatusTag status={data.order.status} />
        </div>
        <PreviewGrid rows={rows} />
      </section>
    );
  }

  return null;
}
