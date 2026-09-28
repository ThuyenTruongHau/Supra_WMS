/**
 * Bảng hierarchy xe operator (inbound): Số xe → Tổng SL → Số lệnh.
 * Expand → danh sách hàng (fetch products khi mở).
 */
import { useState, type Key } from "react";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Table } from "@/components/ui";
import { useInboundVehicleProducts } from "@/hooks/useInbound";
import type {
  InboundIncompleteVehicle,
  InboundVehicleProductItem,
} from "@/types/inbound";
import { toDisplayInteger } from "@/utils/number";

const DETAIL_STATUS_LABEL: Record<string, string> = {
  pending: "Chưa gán",
  partial: "Đã gán",
  assigned: "Đã gán",
  receiving: "Đang nhập",
  completed: "Đã nhập",
  cancelled: "Huỷ",
};

type OperatorInboundVehicleTableProps = {
  orderId: number;
  vehicles: InboundIncompleteVehicle[];
  loading?: boolean;
};

function vehicleRowKey(vehicle: InboundIncompleteVehicle): string {
  return vehicle.vehicle_number.trim() || "__empty__";
}

function ExpandedInboundProducts({
  orderId,
  vehicleNumber,
}: {
  orderId: number;
  vehicleNumber: string;
}) {
  const { data, isLoading, isError } = useInboundVehicleProducts(
    orderId,
    vehicleNumber,
    true,
    "incomplete",
  );
  const products = data?.products ?? [];

  const columns: ColumnsType<InboundVehicleProductItem> = [
    {
      title: "Hàng hóa",
      key: "product",
      render: (_: unknown, row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-base font-semibold text-brand-dark">
            {row.product_sku?.trim() || `P${row.product_id}`}
          </p>
          <p className="truncate text-sm text-slate-500">
            {row.product_name?.trim() || "—"}
          </p>
        </div>
      ),
    },
    {
      title: "SL",
      dataIndex: "total_quantity",
      key: "total_quantity",
      width: 88,
      align: "right",
      render: (qty: number) => (
        <span className="text-base tabular-nums font-semibold text-brand-dark">
          {toDisplayInteger(qty)}
        </span>
      ),
    },
    {
      title: "Lệnh",
      dataIndex: "line_count",
      key: "line_count",
      width: 80,
      align: "center",
      render: (value: number) => (
        <span className="text-base tabular-nums font-semibold text-brand-dark">
          {value}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      key: "statuses",
      width: 120,
      render: (_: unknown, row) => (
        <span className="text-sm font-medium leading-tight text-slate-600">
          {row.statuses?.length
            ? row.statuses.map((s) => DETAIL_STATUS_LABEL[s] ?? s).join(" / ")
            : "—"}
        </span>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="px-2 py-3 text-base text-slate-500">
        Đang tải hàng hóa...
      </div>
    );
  }
  if (isError) {
    return (
      <div className="px-2 py-3 text-base text-error-600">
        Không tải được danh sách hàng
      </div>
    );
  }

  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <Table<InboundVehicleProductItem>
        columns={columns}
        dataSource={products}
        rowKey="product_id"
        pagination={false}
        size="middle"
        locale={{ emptyText: "Xe này không còn hàng chưa hoàn tất" }}
        className="[&_.ant-table]:text-base [&_.ant-table-thead_th]:!bg-white [&_.ant-table-thead_th]:!text-sm [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-tbody_td]:align-middle [&_.ant-table-tbody_td]:!py-3"
      />
    </div>
  );
}

export default function OperatorInboundVehicleTable({
  orderId,
  vehicles,
  loading = false,
}: OperatorInboundVehicleTableProps) {
  const [expandedKeys, setExpandedKeys] = useState<readonly Key[]>([]);

  const columns: ColumnsType<InboundIncompleteVehicle> = [
    {
      title: "Số xe",
      dataIndex: "vehicle_number",
      key: "vehicle_number",
      render: (value: string) => (
        <span className="font-mono text-lg font-bold text-brand-dark">
          {value.trim() || "Không biển số"}
        </span>
      ),
    },
    {
      title: "Tổng SL",
      dataIndex: "total_quantity",
      key: "total_quantity",
      width: 120,
      align: "right",
      render: (value: number) => (
        <span className="text-lg tabular-nums font-bold text-brand-dark">
          {toDisplayInteger(value)}
        </span>
      ),
    },
    {
      title: "Số lệnh",
      dataIndex: "detail_count",
      key: "detail_count",
      width: 110,
      align: "center",
      render: (value: number) => (
        <span className="text-lg tabular-nums font-bold text-brand-dark">
          {value}
        </span>
      ),
    },
  ];

  return (
    <Table<InboundIncompleteVehicle>
      columns={columns}
      dataSource={vehicles}
      rowKey={vehicleRowKey}
      loading={loading}
      pagination={false}
      size="middle"
      expandable={{
        expandedRowKeys: expandedKeys,
        onExpandedRowsChange: setExpandedKeys,
        expandedRowRender: (vehicle) => (
          <ExpandedInboundProducts
            orderId={orderId}
            vehicleNumber={vehicle.vehicle_number}
          />
        ),
        rowExpandable: () => orderId > 0,
        expandIcon: ({ expanded, onExpand, record }) => (
          <button
            type="button"
            className="inline-flex items-center text-base text-slate-500 hover:text-brand-primary"
            onClick={(event) => onExpand(record, event)}
            aria-label={expanded ? "Thu gọn" : "Mở rộng"}
          >
            {expanded ? <DownOutlined /> : <RightOutlined />}
          </button>
        ),
      }}
      locale={{ emptyText: "Không có xe nào còn dòng chưa hoàn tất" }}
      className="[&_.ant-table]:text-base [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-sm [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-tbody_td]:align-middle [&_.ant-table-tbody_td]:!py-3.5"
    />
  );
}
