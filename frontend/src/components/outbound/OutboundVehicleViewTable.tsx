import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Table } from "@/components/ui";
import OutboundGroupMetadataPanel from "@/components/outbound/OutboundGroupMetadataPanel";
import OutboundItemTable from "@/components/outbound/OutboundItemTable";
import type { VehicleViewNode } from "@/utils/outboundViewTransform";

type OutboundVehicleViewTableProps = {
  nodes: VehicleViewNode[];
};

export default function OutboundVehicleViewTable({
  nodes,
}: OutboundVehicleViewTableProps) {
  const vehicleColumns: ColumnsType<VehicleViewNode> = [
    {
      title: "Số xe",
      dataIndex: "vehicle_number",
      key: "vehicle_number",
    },
    {
      title: "Nhà xe / NVT",
      dataIndex: "carrier_name",
      key: "carrier_name",
      render: (value: string | null) => value || "—",
    },
    {
      title: "Trip",
      dataIndex: "trip_code",
      key: "trip_code",
      render: (value: string | null) => value || "—",
    },
    {
      title: "Số KH",
      dataIndex: "customerCount",
      key: "customerCount",
      width: 80,
      align: "center",
    },
    {
      title: "Số SP",
      dataIndex: "itemCount",
      key: "itemCount",
      width: 80,
      align: "center",
    },
  ];

  return (
    <Table<VehicleViewNode>
      columns={vehicleColumns}
      dataSource={nodes}
      rowKey="key"
      pagination={false}
      expandable={{
        expandedRowRender: (vehicle) => (
          <div className="space-y-4 rounded-md bg-slate-50 px-4 py-3">
            {vehicle.customers.map((customer) => (
              <div
                key={customer.key}
                className="space-y-3 rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Khách hàng</p>
                    <p className="text-sm text-slate-800">
                      {customer.customer_name}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Số SP</p>
                    <p className="text-sm text-slate-800">
                      {customer.itemCount}
                    </p>
                  </div>
                </div>
                <OutboundGroupMetadataPanel group={customer.group} />
                <OutboundItemTable items={customer.items} />
              </div>
            ))}
          </div>
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
      className="[&_.ant-table-thead_th]:!bg-slate-50"
    />
  );
}
