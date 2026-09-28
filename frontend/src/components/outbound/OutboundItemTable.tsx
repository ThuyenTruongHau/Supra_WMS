import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Table } from "@/components/ui";
import type { ItemOutbound } from "@/types/outbound";
import { toDisplayInteger } from "@/utils/number";
import { outboundStatusLabel } from "@/utils/outboundStatusLabel";

function StatusTag({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    wave_assigned: "bg-sky-100 text-sky-700",
    sorting: "bg-indigo-100 text-indigo-700",
    picking: "bg-info-100 text-info-700",
    task_created: "bg-cyan-100 text-cyan-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-600",
  };
  return (
    <span
      className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${styles[status] ?? "bg-slate-100"}`}
    >
      {outboundStatusLabel(status)}
    </span>
  );
}

function buildItemColumns(): ColumnsType<ItemOutbound> {
  return [
    { title: "SKU", dataIndex: "product_sku", key: "product_sku", width: 110 },
    {
      title: "Tên sản phẩm",
      dataIndex: "product_name",
      key: "product_name",
      ellipsis: true,
    },
    {
      title: "SL yêu cầu",
      dataIndex: "requested_quantity",
      key: "requested_quantity",
      align: "right",
      width: 90,
      render: (value: number) => toDisplayInteger(value),
    },
    {
      title: "ĐVT",
      dataIndex: "base_unit",
      key: "base_unit",
      width: 70,
    },
    {
      title: "Pallet",
      dataIndex: "pallet_quantity",
      key: "pallet_quantity",
      align: "right",
      width: 70,
      render: (value: number | null) =>
        value != null && Number(value) > 0 ? toDisplayInteger(value) : "—",
    },
    {
      title: "SL đã lấy",
      dataIndex: "picked_quantity",
      key: "picked_quantity",
      align: "right",
      width: 90,
      render: (value: number) => toDisplayInteger(value),
    },
    {
      title: "Vị trí lấy",
      dataIndex: "locator",
      key: "locator",
      width: 130,
      render: (value: string | null) => value || "—",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => <StatusTag status={status} />,
    },
  ];
}

type OutboundItemTableProps = {
  items: ItemOutbound[];
};

export default function OutboundItemTable({ items }: OutboundItemTableProps) {
  const columns = buildItemColumns();

  return (
    <Table<ItemOutbound>
      columns={columns}
      dataSource={items}
      rowKey="id"
      pagination={false}
      size="small"
      expandable={{
        expandedRowRender: (item) =>
          item.picks.length > 0 ? (
            <ul className="space-y-1 py-1 text-sm text-slate-600">
              {item.picks.map((pick) => (
                <li key={pick.id}>
                  Vị trí{" "}
                  <strong>{pick.location_code ?? pick.item_stock_id}</strong>:{" "}
                  {pick.executed_at || pick.outbound_task_id ? "đã lấy" : "giữ"}{" "}
                  {toDisplayInteger(pick.quantity)}
                  {pick.outbound_task_id ? (
                    <span className="ml-2 text-xs text-slate-400">
                      Task #{pick.outbound_task_id}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <span className="text-sm text-slate-400">Không có phân bổ tồn</span>
          ),
        expandIcon: ({ expanded, onExpand, record }) =>
          expanded ? (
            <DownOutlined
              className="cursor-pointer text-slate-500"
              onClick={(event) => onExpand(record, event)}
            />
          ) : (
            <RightOutlined
              className="cursor-pointer text-slate-500"
              onClick={(event) => onExpand(record, event)}
            />
          ),
        rowExpandable: () => true,
      }}
      className="[&_.ant-table-thead_th]:!bg-slate-100"
    />
  );
}

export { StatusTag as OutboundStatusTag };
