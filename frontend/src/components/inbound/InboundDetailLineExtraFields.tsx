import { DatePicker } from "antd";
import type { FormListFieldData } from "antd/es/form";
import { Form, Input } from "@/components/ui";

type InboundDetailLineExtraFieldsProps = {
  name: number;
  restField: Omit<FormListFieldData, "key" | "name">;
};

export default function InboundDetailLineExtraFields({
  name,
  restField,
}: InboundDetailLineExtraFieldsProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Form.Item
        {...restField}
        name={[name, "customer_import_time"]}
        className="!mb-0"
        label="Ngày giờ chi tiết"
      >
        <DatePicker
          showTime
          format="DD/MM/YYYY HH:mm"
          placeholder="Chọn ngày giờ"
          className="w-full"
        />
      </Form.Item>
      <Form.Item
        {...restField}
        name={[name, "vehicle_number"]}
        className="!mb-0"
        label="Số xe"
      >
        <Input placeholder="Biển số / số xe" />
      </Form.Item>
      <Form.Item
        {...restField}
        name={[name, "delivery_code"]}
        className="!mb-0"
        label="Delivery / Trip"
      >
        <Input placeholder="Mã delivery" />
      </Form.Item>
      <Form.Item
        {...restField}
        name={[name, "export_warehouse"]}
        className="!mb-0"
        label="Kho xuất"
      >
        <Input placeholder="Kho xuất" />
      </Form.Item>
      <Form.Item
        {...restField}
        name={[name, "import_warehouse"]}
        className="!mb-0"
        label="Kho nhập"
      >
        <Input placeholder="Kho nhập" />
      </Form.Item>
      <Form.Item
        {...restField}
        name={[name, "carrier_name"]}
        className="!mb-0"
        label="NVT / Lái xe"
      >
        <Input placeholder="Nhà vận tải / lái xe" />
      </Form.Item>
    </div>
  );
}
