import { useEffect, useState } from "react";
import { Button, Card, Table } from "@/components/ui";
import type { ColumnsType } from "antd/es/table";
import { useAppStore } from "@/store/useAppStore";
import {
  useNotifications,
  useResolveNotification,
} from "@/hooks/useNotification";
import type { Notification } from "@/types/notification";
import dayjs from "dayjs";

const PAGE_SIZE = 20;

const TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-base [&_.ant-table-tbody_td]:!text-base [&_.ant-table-thead_th]:!py-3 [&_.ant-table-tbody_td]:!py-3 [&_.ant-table-row]:hover:bg-slate-50/50 [&_.ant-table-cell]:!text-center";

function formatDate(date?: string | null) {
  if (!date) return "—";
  return dayjs(date).format("DD/MM/YYYY HH:mm");
}

export default function NotificationPage() {
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId);
  const warehouseId = selectedWarehouseId || 0;
  const [page, setPage] = useState(1);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  useEffect(() => {
    setPage(1);
  }, [warehouseId]);

  const { data, isLoading, refetch } = useNotifications({
    warehouse_id: warehouseId,
    page,
    page_size: PAGE_SIZE,
  });

  const resolveMutation = useResolveNotification();

  const handleResolve = async (notificationId: number) => {
    setResolvingId(notificationId);
    try {
      await resolveMutation.mutateAsync(notificationId);
      await refetch();
    } finally {
      setResolvingId(null);
    }
  };

  const columns: ColumnsType<Notification> = [
    {
      title: "Tiêu đề",
      dataIndex: "title",
      key: "title",
      align: "left",
      render: (value: string) => (
        <span className="font-medium text-slate-800">{value}</span>
      ),
    },
    {
      title: "Nội dung",
      dataIndex: "message",
      key: "message",
      align: "left",
      render: (value: string) => (
        <span className="text-slate-600 whitespace-normal">{value}</span>
      ),
    },
    {
      title: "Hành động yêu cầu",
      dataIndex: "action",
      key: "action",
    },
    {
      title: "Thời gian",
      dataIndex: "created_at",
      key: "created_at",
      width: 160,
      render: (value: string | null | undefined) => formatDate(value),
    },
    {
      title: "Xử lý",
      key: "resolve",
      width: 140,
      render: (_value, record) => {
        if (record.notification_type !== "alert") {
          return "—";
        }
        return (
          <Button
            type="primary"
            size="small"
            loading={resolvingId === record.id}
            onClick={() => handleResolve(record.id)}
          >
            Đã xử lý
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Thông báo</h1>
        <p className="text-slate-500 mt-1">
          Danh sách cảnh báo chưa xử lý theo kho đang chọn
        </p>
      </div>

      {!warehouseId ? (
        <Card className="p-6 text-center text-slate-500">
          Vui lòng chọn kho để xem thông báo
        </Card>
      ) : (
        <Card>
          <Table
            rowKey="id"
            className={TABLE_CLASS}
            columns={columns}
            dataSource={data?.items ?? []}
            loading={isLoading}
            pagination={{
              current: page,
              pageSize: PAGE_SIZE,
              total: data?.total ?? 0,
              showSizeChanger: false,
              onChange: (nextPage) => setPage(nextPage),
            }}
          />
        </Card>
      )}
    </div>
  );
}
