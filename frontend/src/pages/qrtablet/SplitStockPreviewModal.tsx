import { Modal, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Button } from "@/components/ui";
import { formatQuantity } from "@/utils/formatQuantity";
import {
  formatSplitStockSummary,
  tQrTabletInbound,
} from "@/i18n/qrTabletInbound.vi";
import type { ItemStockResponse } from "@/types/itemStock";
import type { QrCodePreviewResponse } from "@/types/inboundOrder";
import dayjs from "dayjs";

interface SplitStockPreviewModalProps {
  open: boolean;
  preview: QrCodePreviewResponse | null;
  stocks: ItemStockResponse[];
  onClose: () => void;
  onExportSplit: () => void;
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function SplitStockPreviewModal({
  open,
  preview,
  stocks,
  onClose,
  onExportSplit,
}: SplitStockPreviewModalProps) {
  const totalQuantity = stocks.reduce(
    (sum, stock) => sum + toNumber(stock.quantity),
    0,
  );

  const columns: ColumnsType<ItemStockResponse> = [
    {
      title: tQrTabletInbound("splitStockColumnLot"),
      dataIndex: "lot_number",
      key: "lot_number",
      render: (_, record) => record.lot_number?.trim() || "—",
    },
    {
      title: tQrTabletInbound("splitStockColumnQuantity"),
      dataIndex: "quantity",
      key: "quantity",
      align: "center",
      render: (value) => formatQuantity(toNumber(value)),
    },
    {
      title: tQrTabletInbound("splitStockColumnLocation"),
      dataIndex: "location_id",
      key: "location_id",
      render: (value) => (value != null ? String(value) : "—"),
    },
    {
      title: tQrTabletInbound("splitStockColumnCreatedAt"),
      dataIndex: "created_at",
      key: "created_at",
      render: (value) =>
        value ? dayjs(value).format("DD/MM/YYYY HH:mm") : "—",
    },
  ];

  const productLabel = preview
    ? `${preview.item_sku ?? ""}${
        preview.item_name ? ` — ${preview.item_name}` : ""
      }`
    : "—";

  return (
    <Modal
      title={tQrTabletInbound("splitStockPreviewTitle")}
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={720}
      destroyOnHidden
    >
      <p className="mb-2 text-sm text-stripe-ink-mute">
        {tQrTabletInbound("splitStockPreviewHint")}
      </p>
      <p className="mb-1 text-base font-semibold text-stripe-ink">{productLabel}</p>
      <p className="mb-4 text-sm text-stripe-ink-mute">
        {formatSplitStockSummary(stocks.length, totalQuantity)}
      </p>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        columns={columns}
        dataSource={stocks}
        scroll={{ y: 280 }}
        className="[&_.ant-table-cell]:!text-center"
      />
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button variant="secondary" className="!h-12 !text-lg" onClick={onClose}>
          {tQrTabletInbound("splitStockCloseButton")}
        </Button>
        <Button variant="primary" className="!h-12 !text-lg" onClick={onExportSplit}>
          {tQrTabletInbound("splitStockExportButton")}
        </Button>
      </div>
    </Modal>
  );
}
