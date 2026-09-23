import { useEffect, useState } from "react";
import { Tag } from "antd";
import { Card, Table } from "@/components/ui";
import type { ColumnsType } from "antd/es/table";
import { useAppStore } from "@/store/useAppStore";
import { useNotifications } from "@/hooks/useNotification";
import type { Notification, NotificationType } from "@/types/notification";
import dayjs from "dayjs";

function renderSeverityTag(type: NotificationType | string) {
  if (type === "alert") {
    return (
      <Tag color="gold" className="!m-0">
        Cảnh báo
      </Tag>
    );
  }
  if (type === "significant") {
    return (
      <Tag color="red" className="!m-0">
        Nghiêm trọng
      </Tag>
    );
  }
  return (
    <Tag className="!m-0">{type === "info" ? "Thông tin" : String(type)}</Tag>
  );
}

function rowClassName(record: Notification) {
  if (record.notification_type === "alert") return "bg-amber-50/50";
  if (record.notification_type === "significant") return "bg-red-50/50";
  return "";
}

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

  useEffect(() => {
    setPage(1);
  }, [warehouseId]);

  const { data, isLoading } = useNotifications({
    warehouse_id: warehouseId,
    page,
    page_size: PAGE_SIZE,
  });

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
      title: "Mức độ",
      key: "severity",
      width: 130,
      render: (_value, record) => renderSeverityTag(record.notification_type),
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
            onRow={(record) => ({ className: rowClassName(record) })}
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
