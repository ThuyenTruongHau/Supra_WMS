import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import type { ExpandableConfig } from "antd/es/table/interface";
import { Table } from "@/components/ui";
import type { InboundOrderDetail, InboundVehicleGroup } from "@/types/inbound";

type InboundVehicleViewTableProps = {
  vehicles: InboundVehicleGroup[];
  detailColumns: ColumnsType<InboundOrderDetail>;
  detailExpandable?: ExpandableConfig<InboundOrderDetail>;
};

function vehicleRowKey(vehicle: InboundVehicleGroup): string {
  return vehicle.vehicle_number.trim() || "__empty__";
}

export default function InboundVehicleViewTable({
  vehicles,
  detailColumns,
  detailExpandable,
}: InboundVehicleViewTableProps) {
  const vehicleColumns: ColumnsType<InboundVehicleGroup> = [
    {
      title: "Số xe",
      dataIndex: "vehicle_number",
      key: "vehicle_number",
      render: (value: string) => value.trim() || "Không biển số",
    },
    {
      title: "Số dòng",
      dataIndex: "line_count",
      key: "line_count",
      width: 100,
      align: "center",
    },
    {
      title: "Tổng SL",
      dataIndex: "total_quantity",
      key: "total_quantity",
      width: 120,
      align: "right",
      render: (value: number) => Number(value).toLocaleString("vi-VN"),
    },
    {
      title: "Tổng pallet",
      dataIndex: "total_pallet_quantity",
      key: "total_pallet_quantity",
      width: 120,
      align: "right",
      render: (value: number) => Number(value).toLocaleString("vi-VN"),
    },
  ];

  return (
    <Table<InboundVehicleGroup>
      columns={vehicleColumns}
      dataSource={vehicles}
      rowKey={vehicleRowKey}
      pagination={false}
      size="small"
      expandable={{
        expandedRowRender: (vehicle) => (
          <div className="rounded-md bg-slate-50 px-2 py-2">
            <Table<InboundOrderDetail>
              columns={detailColumns}
              dataSource={vehicle.details}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 1050 }}
              expandable={detailExpandable}
              className="[&_.ant-table-tbody_td]:align-top [&_.ant-table-thead_th]:!bg-white"
            />
          </div>
        ),
        rowExpandable: (vehicle) => vehicle.details.length > 0,
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
      className="[&_.ant-table-tbody_td]:align-middle [&_.ant-table-thead_th]:!bg-slate-50"
    />
  );
}
