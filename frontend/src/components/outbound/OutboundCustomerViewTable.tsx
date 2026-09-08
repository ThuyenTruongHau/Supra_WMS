import { DownOutlined, RightOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Table } from "@/components/ui";
import OutboundGroupMetadataPanel from "@/components/outbound/OutboundGroupMetadataPanel";
import OutboundItemTable from "@/components/outbound/OutboundItemTable";
import type {
  CustomerViewNode,
  VehicleInfoBlock,
} from "@/utils/outboundViewTransform";

type OutboundCustomerViewTableProps = {
  nodes: CustomerViewNode[];
};

export default function OutboundCustomerViewTable({
  nodes,
}: OutboundCustomerViewTableProps) {
  const customerColumns: ColumnsType<CustomerViewNode> = [
    {
      title: "Khách hàng",
      dataIndex: "customer_name",
      key: "customer_name",
    },
    {
      title: "Số xe",
      dataIndex: "vehicleCount",
      key: "vehicleCount",
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
    <Table<CustomerViewNode>
      columns={customerColumns}
      dataSource={nodes}
      rowKey="key"
      pagination={false}
      expandable={{
        expandedRowRender: (customer) => (
          <div className="space-y-4 rounded-md bg-slate-50 px-4 py-3">
            {customer.vehicles.map((vehicle: VehicleInfoBlock) => (
              <div
                key={vehicle.key}
                className="space-y-3 rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500">Số xe</p>
                    <p className="text-sm text-slate-800">
                      {vehicle.vehicle_number}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Nhà xe / NVT</p>
                    <p className="text-sm text-slate-800">
                      {vehicle.carrier_name || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Trip</p>
                    <p className="text-sm text-slate-800">
                      {vehicle.trip_code || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Số SP</p>
                    <p className="text-sm text-slate-800">
                      {vehicle.itemCount}
                    </p>
                  </div>
                </div>
                <OutboundGroupMetadataPanel group={vehicle.group} />
                <OutboundItemTable items={vehicle.items} />
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
