/**
 * Bảng hierarchy xe operator (outbound): Số xe → Tổng SL → Số lệnh.
 * Expand → danh sách hàng (fetch products khi mở).
 */
import { useState, type Key } from "react";
import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Table } from "@/components/ui";
import { useOutboundVehicleProducts } from "@/hooks/useOutbound";
import type {
  IncompleteVehicle,
  OutboundVehicleProductLine,
} from "@/types/outbound";
import { outboundStatusLabel } from "@/utils/outboundStatusLabel";
import { toDisplayInteger } from "@/utils/number";

type OperatorOutboundVehicleTableProps = {
  zoneId: number;
  vehicles: IncompleteVehicle[];
  loading?: boolean;
};

function vehicleRowKey(vehicle: IncompleteVehicle): string {
  return vehicle.vehicle_number.trim() || "__empty__";
}

function ExpandedOutboundProducts({
  zoneId,
  vehicleNumber,
}: {
  zoneId: number;
  vehicleNumber: string;
}) {
  const { data, isLoading, isError } = useOutboundVehicleProducts(
    zoneId,
    vehicleNumber,
    true,
    "incomplete",
  );
  const products = data?.products ?? [];

  const columns: ColumnsType<OutboundVehicleProductLine> = [
    {
      title: "Khách hàng",
      dataIndex: "customer_name",
      key: "customer_name",
      width: 96,
      ellipsis: true,
      render: (name: string) => (
        <span className="truncate text-xs font-semibold text-brand-dark">
          {name}
        </span>
      ),
    },
    {
      title: "Hàng hóa",
      key: "product",
      render: (_: unknown, row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold text-brand-dark">
            {row.product_sku?.trim() || `P${row.product_id}`}
          </p>
          <p className="truncate text-[11px] text-slate-500">
            {row.product_name?.trim() || "—"}
          </p>
        </div>
      ),
    },
    {
      title: "SL",
      dataIndex: "total_quantity",
      key: "total_quantity",
      width: 64,
      align: "right",
      render: (qty: number) => (
        <span className="tabular-nums font-semibold text-brand-dark">
          {toDisplayInteger(qty)}
        </span>
      ),
    },
    {
      title: "Trạng thái",
      key: "statuses",
      width: 88,
      render: (_: unknown, row) => (
        <span className="text-xs font-medium leading-tight text-slate-600">
          {row.statuses?.length
            ? row.statuses.map(outboundStatusLabel).join(" / ")
            : "—"}
        </span>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="px-2 py-3 text-sm text-slate-500">
        Đang tải hàng hóa...
      </div>
    );
  }
  if (isError) {
    return (
      <div className="px-2 py-3 text-sm text-error-600">
        Không tải được danh sách hàng
      </div>
    );
  }

  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <Table<OutboundVehicleProductLine>
        columns={columns}
        dataSource={products}
        rowKey={(row) => `${row.customer_name}-${row.product_id}`}
        pagination={false}
        size="small"
        locale={{ emptyText: "Xe này không còn hàng chưa hoàn tất" }}
        className="[&_.ant-table-tbody_td]:align-middle [&_.ant-table-thead_th]:!bg-white"
      />
    </div>
  );
}

export default function OperatorOutboundVehicleTable({
  zoneId,
  vehicles,
  loading = false,
}: OperatorOutboundVehicleTableProps) {
  const [expandedKeys, setExpandedKeys] = useState<readonly Key[]>([]);

  const columns: ColumnsType<IncompleteVehicle> = [
    {
      title: "Số xe",
      dataIndex: "vehicle_number",
      key: "vehicle_number",
      render: (value: string) => (
        <span className="font-mono text-sm font-semibold text-brand-dark">
          {value.trim() || "Không biển số"}
        </span>
      ),
    },
    {
      title: "Tổng SL",
      dataIndex: "total_quantity",
      key: "total_quantity",
      width: 100,
      align: "right",
      render: (value: number | undefined) => (
        <span className="tabular-nums font-semibold text-brand-dark">
          {toDisplayInteger(value ?? 0)}
        </span>
      ),
    },
    {
      title: "Số lệnh",
      dataIndex: "detail_count",
      key: "detail_count",
      width: 88,
      align: "center",
      render: (value: number) => (
        <span className="tabular-nums font-semibold text-brand-dark">
          {value}
        </span>
      ),
    },
  ];

  return (
    <Table<IncompleteVehicle>
      columns={columns}
      dataSource={vehicles}
      rowKey={vehicleRowKey}
      loading={loading}
      pagination={false}
      size="small"
      expandable={{
        expandedRowKeys: expandedKeys,
        onExpandedRowsChange: setExpandedKeys,
        expandedRowRender: (vehicle) => (
          <ExpandedOutboundProducts
            zoneId={zoneId}
            vehicleNumber={vehicle.vehicle_number}
          />
        ),
        rowExpandable: () => zoneId > 0,
        expandIcon: ({ expanded, onExpand, record }) => (
          <button
            type="button"
            className="inline-flex items-center text-slate-500 hover:text-brand-primary"
            onClick={(event) => onExpand(record, event)}
            aria-label={expanded ? "Thu gọn" : "Mở rộng"}
          >
            {expanded ? <DownOutlined /> : <RightOutlined />}
          </button>
        ),
      }}
      locale={{ emptyText: "Không có xe nào có detail chưa hoàn tất" }}
      className="[&_.ant-table-tbody_td]:align-middle [&_.ant-table-thead_th]:!bg-slate-50"
    />
  );
}
