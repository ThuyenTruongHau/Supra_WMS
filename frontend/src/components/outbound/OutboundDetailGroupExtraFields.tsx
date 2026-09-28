import type { FormListFieldData } from "antd/es/form";
import { Form, Input } from "@/components/ui";

type OutboundDetailGroupExtraFieldsProps = {
  groupName: number;
};

export default function OutboundDetailGroupExtraFields({
  groupName,
}: OutboundDetailGroupExtraFieldsProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Form.Item
        name={[groupName, "trip_code"]}
        className="!mb-0"
        label="Trip"
      >
        <Input placeholder="Mã trip" />
      </Form.Item>
      <Form.Item
        name={[groupName, "carrier_name"]}
        className="!mb-0"
        label="NVT"
      >
        <Input placeholder="Nhà vận tải" />
      </Form.Item>
      <Form.Item
        name={[groupName, "lot_number"]}
        className="!mb-0"
        label="LOT"
      >
        <Input placeholder="Lot" />
      </Form.Item>
    </div>
  );
}

export type OutboundGroupRestField = Omit<FormListFieldData, "key" | "name">;
