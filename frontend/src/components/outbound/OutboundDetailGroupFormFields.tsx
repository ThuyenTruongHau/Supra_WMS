import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Form, Input, Select } from "@/components/ui";
import type { Product } from "@/types/product";
import OutboundDetailGroupExtraFields from "@/components/outbound/OutboundDetailGroupExtraFields";

type OutboundDetailGroupFormFieldsProps = {
  groupName: number;
  products: Product[];
};

export default function OutboundDetailGroupFormFields({
  groupName,
  products,
}: OutboundDetailGroupFormFieldsProps) {
  return (
    <div className="mb-4 rounded-lg border border-slate-200 p-4">
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Form.Item
          name={[groupName, "customer_name"]}
          label="Tên khách hàng"
          rules={[{ required: true, message: "Bắt buộc" }]}
          className="!mb-0"
        >
          <Input placeholder="Khách hàng" />
        </Form.Item>
        <Form.Item
          name={[groupName, "vehicle_number"]}
          label="Số xe"
          rules={[{ required: true, message: "Bắt buộc" }]}
          className="!mb-0"
        >
          <Input placeholder="89H12345" />
        </Form.Item>
      </div>

      <Form.List name={[groupName, "items"]}>
        {(itemFields, { add: addItem, remove: removeItem }) => (
          <>
            {itemFields.map(({ key, name, ...restField }) => (
              <div
                key={key}
                className="mb-2 flex flex-wrap items-end gap-2 rounded border border-slate-100 p-2"
              >
                <Form.Item
                  {...restField}
                  name={[name, "product_id"]}
                  rules={[{ required: true, message: "Chọn SP" }]}
                  className="!mb-0 min-w-[200px] flex-[2]"
                  label="Sản phẩm"
                >
                  <Select
                    placeholder="Chọn sản phẩm"
                    showSearch
                    optionFilterProp="label"
                    options={products.map((p) => ({
                      value: p.id,
                      label: `${p.sku} — ${p.name}`,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  {...restField}
                  name={[name, "requested_quantity"]}
                  rules={[{ required: true, message: "SL" }]}
                  className="!mb-0 w-24"
                  label="SL"
                >
                  <Input type="number" min={1} step={1} />
                </Form.Item>
                <Form.Item
                  {...restField}
                  name={[name, "pallet_quantity"]}
                  className="!mb-0 w-24"
                  label="Pallet"
                >
                  <Input type="number" min={0} step={1} />
                </Form.Item>
                <MinusCircleOutlined
                  className="mb-2 cursor-pointer text-red-400"
                  onClick={() => removeItem(name)}
                />
              </div>
            ))}
            <Button
              variant="secondary"
              size="small"
              onClick={() => addItem({ requested_quantity: 1 })}
              icon={<PlusOutlined />}
            >
              Thêm sản phẩm
            </Button>
          </>
        )}
      </Form.List>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <OutboundDetailGroupExtraFields groupName={groupName} />
      </div>
    </div>
  );
}
