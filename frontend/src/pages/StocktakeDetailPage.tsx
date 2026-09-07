import { useNavigate, useParams } from "react-router-dom";
import { Card, Table, Button, Modal, Space, message } from "@/components/ui";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeftOutlined, DeleteOutlined } from "@ant-design/icons";
import InboundStatusTag from "@/components/shared/InboundStatusTag";
import {
  useConfirmStocktakeItemQuantity,
  useDeleteStocktake,
  useGetStocktakeDetail,
} from "@/hooks/useStocktake";
import type { StocktakeItemStock } from "@/types/stocktake";
import dayjs from "dayjs";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";

const TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-base [&_.ant-table-tbody_td]:!text-base [&_.ant-table-thead_th]:!py-3 [&_.ant-table-tbody_td]:!py-3 [&_.ant-table-row]:hover:bg-slate-50/50";

function formatDate(date?: string | null) {
  if (!date) return "—";
  return dayjs(date).format("DD/MM/YYYY HH:mm");
}

function displayLocationName(record: StocktakeItemStock): string {
  return (
    record.location_name ||
    record.location_code ||
    `#${record.location_id}`
  );
}

export default function StocktakeDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const stocktakeId = Number(id) || 0;

  const { data: detail, isLoading } = useGetStocktakeDetail(stocktakeId);
  const deleteMutation = useDeleteStocktake();
  const confirmMutation = useConfirmStocktakeItemQuantity();
  const items = detail?.items ?? [];
  const canDelete = detail?.status === "initialize";

  const handleDelete = () => {
    if (!stocktakeId) return;
    const label = detail?.description?.trim() || `#${stocktakeId}`;
    Modal.confirmDelete({
      content: `Bạn có chắc chắn muốn xóa phiếu kiểm kê "${label}"?`,
      onOk: () =>
        new Promise<void>((resolve, reject) => {
          deleteMutation.mutate(stocktakeId, {
            onSuccess: () => {
              message.success("Xóa phiếu kiểm kê thành công!");
              navigate("/inventory");
              resolve();
            },
            onError: (err) => {
              message.error(getApiErrorMessage(err));
              reject();
            },
          });
        }),
    });
  };

  const handleConfirmQuantity = (record: StocktakeItemStock) => {
    Modal.confirm({
      title: "Xác nhận số lượng kiểm kê",
      content: (
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-slate-500">Sản phẩm: </span>
            <span className="font-medium">
              {record.item_sku || "—"} — {record.item_name || "—"}
            </span>
          </p>
          <p>
            <span className="text-slate-500">Vị trí: </span>
            <span>{displayLocationName(record)}</span>
          </p>
          <p>
            <span className="text-slate-500">SL hệ thống: </span>
            <span className="font-semibold">{record.desired_quantity}</span>
          </p>
          <p>
            <span className="text-slate-500">SL thực tế: </span>
            <span className="font-semibold text-brand-primary">
              {record.actual_quantity}
            </span>
          </p>
          <p className="text-slate-500">
            Xác nhận sẽ cập nhật tồn kho thực tế theo số lượng đã ghi nhận.
          </p>
        </div>
      ),
      okText: "Xác nhận",
      cancelText: "Hủy",
      onOk: () =>
        new Promise<void>((resolve, reject) => {
          confirmMutation.mutate(
            {
              stocktakeId: record.stocktake_id,
              stocktakeItemId: record.id,
            },
            {
              onSuccess: () => {
                message.success("Xác nhận số lượng thành công!");
                resolve();
              },
              onError: (err) => {
                message.error(getApiErrorMessage(err));
                reject();
              },
            },
          );
        }),
    });
  };

  const columns: ColumnsType<StocktakeItemStock> = [
    {
      title: "Vị trí",
      key: "location_name",
      width: 200,
      render: (_, record) => displayLocationName(record),
    },
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
      width: 150,
      render: (status: string | null, record) => {
        if (status === "in_progress") {
          return (
            <Button
              variant="primary"
              loading={confirmMutation.isPending}
              onClick={() => handleConfirmQuantity(record)}
            >
              Xác nhận SL
            </Button>
          );
        }
        return status ? <InboundStatusTag status={status} size="sm" /> : "—";
      },
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
        <Space className="shrink-0">
          <Button
            variant="dangerText"
            icon={<DeleteOutlined />}
            disabled={!canDelete}
            loading={deleteMutation.isPending}
            title={
              !canDelete
                ? "Chỉ phiếu ở trạng thái khởi tạo mới được xóa"
                : undefined
            }
            onClick={handleDelete}
          >
            Xóa phiếu
          </Button>
        </Space>
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
