import { useNavigate, useParams } from "react-router-dom";
import { Card, Table, Button } from "@/components/ui";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined } from "@ant-design/icons";
import InboundStatusTag from "@/components/shared/InboundStatusTag";
import { useGetStocktakeDetail } from "@/hooks/useStocktake";
import type { StocktakeItemStock } from "@/types/stocktake";
import dayjs from "dayjs";

const TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-base [&_.ant-table-tbody_td]:!text-base [&_.ant-table-thead_th]:!py-3 [&_.ant-table-tbody_td]:!py-3 [&_.ant-table-row]:hover:bg-slate-50/50";

function formatDate(date?: string | null) {
  if (!date) return "—";
  return dayjs(date).format("DD/MM/YYYY HH:mm");
}

export default function StocktakeDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const stocktakeId = Number(id) || 0;

  const { data: detail, isLoading } = useGetStocktakeDetail(stocktakeId);
  const items = detail?.items ?? [];

  const columns: ColumnsType<StocktakeItemStock> = [
    {
      title: "Mã sản phẩm",
      dataIndex: "item_sku",
      key: "item_sku",
      width: 140,
      render: (sku: string | null) => sku || "—",
    },
    {
      title: "Sản phẩm",
      dataIndex: "item_name",
      key: "item_name",
      ellipsis: true,
      render: (name: string | null) => name || "—",
    },
    {
      title: "Vị trí",
      dataIndex: "location_code",
      key: "location_code",
      width: 180,
      render: (_: string | null, record) =>
        record.location_code || record.location_name || `#${record.location_id}`,
    },
    {
      title: "ID lô",
      dataIndex: "item_stock_id",
      key: "item_stock_id",
      width: 110,
      render: (lotId: number) => `#${lotId}`,
    },
    {
      title: "Lot",
      dataIndex: "lot_number",
      key: "lot_number",
      width: 180,
    },
    {
      title: "SL hệ thống",
      dataIndex: "desired_quantity",
      key: "desired_quantity",
      width: 130,
      align: "right",
    },
    {
      title: "SL thực tế",
      dataIndex: "actual_quantity",
      key: "actual_quantity",
      width: 130,
      align: "right",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 160,
      render: (status: string | null) =>
        status ? <InboundStatusTag status={status} size="sm" /> : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/inventory")}
          >
            Quay lại
          </Button>
          <h2 className="text-2xl font-bold text-brand-dark">
            Chi tiết sự kiện #{stocktakeId || "—"}
          </h2>
          {detail?.status ? (
            <InboundStatusTag status={detail.status} size="sm" />
          ) : null}
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-slate-500">Mô tả</p>
            <p className="mt-1 font-semibold text-brand-dark">
              {detail?.description || "—"}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Người tạo</p>
            <p className="mt-1 font-semibold text-brand-dark">
              {detail?.created_by_username ||
                (detail ? `#${detail.created_by_id}` : "—")}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Kho</p>
            <p className="mt-1 font-semibold text-brand-dark">
              {detail?.warehouse_name || "—"}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Ngày tạo</p>
            <p className="mt-1 font-semibold text-brand-dark">
              {formatDate(detail?.created_at)}
            </p>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-brand-dark">
            Checklist kiểm kê ({items.length})
          </h3>
        </div>
        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 20,
            showSizeChanger: false,
            showTotal: (t, range) =>
              `Hiển thị ${range[0]}–${range[1]} / ${t} dòng`,
          }}
          className={TABLE_CLASS}
          size="middle"
          locale={{ emptyText: "Phiếu này chưa có dòng kiểm kê." }}
        />
      </Card>
    </div>
  );
}
