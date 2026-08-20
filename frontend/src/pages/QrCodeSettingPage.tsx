import { useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { PrinterOutlined } from "@ant-design/icons";
import {
  Card,
  Table,
  Button,
  cn,
} from "@/components/ui";
import Hero from "@/components/shared/Hero";
import { SkuSearchSelect } from "@/components/shared/SkuSearchSelect";
import { useRecentQrCodes } from "@/hooks/useItem";
import { useAppStore } from "@/store/useAppStore";
import type { QRCodeRecent, QRCodeStatus } from "@/types/item";
import dayjs from "dayjs";
import QrCodeGeneratePrintModal from "@/pages/components/QrCodeGeneratePrintModal";

const SKU_BROWSE_PAGE_SIZE = 20;
const PAGE_SIZE = 20;

const TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-base [&_.ant-table-tbody_td]:!text-base [&_.ant-table-thead_th]:!py-3 [&_.ant-table-tbody_td]:!py-3 [&_.ant-table-row]:hover:bg-slate-50/50";

const QR_STATUS_LABELS: Record<QRCodeStatus, string> = {
  available: "Khả dụng",
  stocked: "Đã nhập kho",
  expired: "Hết hạn",
};

const QR_STATUS_STYLES: Record<QRCodeStatus, string> = {
  available:
    "bg-emerald-100 text-emerald-800 border-emerald-200 shadow-sm shadow-emerald-200/60",
  stocked:
    "bg-cyan-100 text-cyan-800 border-cyan-200 shadow-sm shadow-cyan-200/60",
  expired:
    "bg-slate-100 text-slate-600 border-slate-200 shadow-sm shadow-slate-200/60",
};

function formatDateTime(date?: string | null) {
  if (!date) return "—";
  return dayjs(date).format("DD/MM/YYYY HH:mm");
}

function QRCodeStatusTag({ status }: { status: QRCodeStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md border px-2.5 py-1 text-sm font-semibold tracking-normal",
        QR_STATUS_STYLES[status],
      )}
    >
      {QR_STATUS_LABELS[status]}
    </span>
  );
}

export default function QrCodeSettingPage() {
  const { selectedWarehouseId } = useAppStore();
  const [filterSku, setFilterSku] = useState<string | undefined>();
  const [filterItemId, setFilterItemId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [isPrintOpen, setIsPrintOpen] = useState(false);

  const warehouseId = selectedWarehouseId ?? 0;

  const {
    data: recentQrCodesData,
    isLoading: isRecentQrCodesLoading,
  } = useRecentQrCodes(warehouseId, {
    itemId: filterItemId,
    page,
    pageSize: PAGE_SIZE,
  });

  const tableRows = recentQrCodesData?.items ?? [];
  const total = recentQrCodesData?.total ?? 0;

  const qrCodeColumns: ColumnsType<QRCodeRecent> = [
    {
      title: "Mã sản phẩm",
      dataIndex: "item_sku",
      key: "item_sku",
      render: (sku: string | null | undefined, row) => (
        <span className="font-semibold text-brand-primary">
          {sku ?? `#${row.item_id}`}
        </span>
      ),
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      render: (date: string | null) => formatDateTime(date),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (status: QRCodeStatus) => <QRCodeStatusTag status={status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <Hero
        title="Quản lý QR"
        extra={
          <Button
            variant="primary"
            icon={<PrinterOutlined />}
            onClick={() => setIsPrintOpen(true)}
          >
            In mã QR
          </Button>
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="min-w-[280px] flex-1 max-w-3xl">
            <p className="mb-2 text-sm font-medium text-slate-600">
              Lọc theo sản phẩm
            </p>
            <SkuSearchSelect
              warehouseId={warehouseId}
              value={filterSku}
              browsePageSize={SKU_BROWSE_PAGE_SIZE}
              placeholder="Tìm Part_number, tên sản phẩm để lọc..."
              disabled={warehouseId <= 0}
              onChange={(sku) => {
                setFilterSku(sku);
                if (!sku) {
                  setFilterItemId(null);
                  setPage(1);
                }
              }}
              onSelectOption={(opt) => {
                if (!opt?.item_id) {
                  setFilterItemId(null);
                  setPage(1);
                  return;
                }
                setFilterSku(opt.value);
                setFilterItemId(opt.item_id);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-brand-dark">
            Danh sách QR (2 ngày gần nhất)
          </h3>
        </div>

        <div className="p-5">
          {warehouseId <= 0 ? (
            <div className="py-12 text-center text-slate-400 italic">
              Vui lòng chọn kho để xem danh sách mã QR
            </div>
          ) : (
            <Table<QRCodeRecent>
              columns={qrCodeColumns}
              dataSource={tableRows}
              loading={isRecentQrCodesLoading}
              rowKey="id"
              pagination={{
                current: page,
                pageSize: PAGE_SIZE,
                total,
                showSizeChanger: false,
                showTotal: (count, range) =>
                  `Hiển thị ${range[0]}–${range[1]} / ${count} mã QR`,
                onChange: (nextPage) => setPage(nextPage),
              }}
              size="middle"
              className={TABLE_CLASS}
              locale={{
                emptyText: (
                  <span className="text-slate-400 italic">
                    Chưa có mã QR trong 2 ngày gần nhất
                  </span>
                ),
              }}
            />
          )}
        </div>
      </Card>

      <QrCodeGeneratePrintModal
        open={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        warehouseId={warehouseId}
        defaultItemId={filterItemId}
        defaultSku={filterSku}
      />
    </div>
  );
}
