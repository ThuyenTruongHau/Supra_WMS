import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  EditOutlined,
} from "@ant-design/icons";
import {
  Card,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Space,
  message,
  Select,
} from "@/components/ui";
import {
  useDeactivateItem,
  useItemById,
  useUpdateItem,
} from "@/hooks/useItem";
import type { ItemStock } from "@/types/item";
import { useAppStore } from "@/store/useAppStore";
import { useZone } from "@/hooks/useZone";
import { useUnits } from "@/hooks/useUnit";
import { DetailView } from "@/components/ui/DetailView";
import dayjs from "dayjs";
import type { Item } from "@/types/item";
import type { DetailFieldSchema } from "@/components/ui/DetailView";
import { formatQuantity, parseQuantity } from "@/utils/formatQuantity";

function ItemDetailsView({ details }: { details?: Record<string, unknown> }) {
  const entries = Object.entries(details ?? {});
  if (entries.length === 0) {
    return <span className="text-gray-400">Không có</span>;
  }
  return (
    <dl className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-wrap gap-x-2 gap-y-1">
          <dt className="text-gray-500">{key}:</dt>
          <dd className="font-medium text-brand-dark">
            {value === null || value === undefined
              ? "—"
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export const itemDetailFields: DetailFieldSchema<Item>[] = [
  {
    key: "quantity",
    label: "Số lượng",
    render: (item) => {
      const amount = parseQuantity(item.quantity);
      return (
        <span
          className={
            amount < item.min_quantity
              ? "font-semibold text-orange-500"
              : "font-semibold"
          }
        >
          {formatQuantity(item.quantity)}
        </span>
      );
    },
  },
  {
    key: "min_quantity",
    label: "Số lượng tối thiểu",
    accessor: (item) => item.min_quantity,
  },
  {
    key: "max_quantity",
    label: "Số lượng tối đa",
    accessor: (item) => item.max_quantity,
  },
  {
    key: "base_quantity",
    label: "Số lượng cơ sở",
    accessor: (item) => item.base_quantity,
  },
  {
    key: "base_unit",
    label: "Đơn vị",
    accessor: (item) => item.base_unit,
  },
  {
    key: "description",
    label: "Mô tả",
    accessor: (item) => item.description,
  },
  {
    key: "created_at",
    label: "Ngày khởi tạo",
    render: (item) => formatDate(item.created_at),
  },
  {
    key: "updated_at",
    label: "Ngày cập nhật",
    render: (item) => formatDate(item.updated_at),
  },
  {
    key: "details",
    label: "Thông tin bổ sung",
    render: (item) => <ItemDetailsView details={item.details} />,
  },
];

type ItemFormValues = {
  name: string;
  sku: string; // chỉ hiển thị, disabled
  base_unit: number;
  base_quantity: number;
  description: string;
  min_quantity: number;
  max_quantity: number;
  quantity: number; // chỉ hiển thị, disabled
  detailEntries?: { key: string; value: string }[];
};

// function getLotStatus(lotDate: string): "expired" | "expiring_soon" | "normal" {
//   const lot = new Date(lotDate);
//   const today = new Date();
//   today.setHours(0, 0, 0, 0);
//   lot.setHours(0, 0, 0, 0);
//   if (lot < today) return "expired";
//   return "normal";
// }

// function LotStatusTag({ lotDate }: { lotDate: string }) {
//   const status = getLotStatus(lotDate);
//   if (status === "expired") {
//     return (
//       <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-red-100 text-red-600">
//         Quá hạn
//       </span>
//     );
//   }
//   if (status === "expiring_soon") {
//     return (
//       <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase bg-orange-100 text-orange-600">
//         Sắp hết
//       </span>
//     );
//   }
//   return null;
// }

function formatDate(date?: string | null) {
  if (!date) return "—";
  return dayjs(date).format("DD/MM/YYYY");
}

const locationColumns: ColumnsType<ItemStock> = [
  {
    title: "Mã vị trí",
    dataIndex: "location_code",
    key: "location_code",
    render: (code: string | null | undefined, row) =>
      code || row.location_id || "—",
  },
  {
    title: "Số lượng",
    dataIndex: "quantity",
    key: "quantity",
    align: "right",
    render: (qty: number | string) => (
      <span className="font-semibold text-brand-dark">
        {formatQuantity(qty)}
      </span>
    ),
  },
  {
    title: "Số Lot",
    dataIndex: "lot_number",
    key: "lot_number",
    align: "right",
    render: (lotNumber: string | null) => (
      <span className="font-semibold text-brand-dark">{lotNumber || "—"}</span>
    ),
  },
  {
    title: "Hạn sử dụng",
    dataIndex: "expiry_date",
    key: "expiry_date",
    align: "right",
    render: (date: string | null) => (
      <span className="font-semibold text-brand-dark">{formatDate(date)}</span>
    ),
  },
  {
    title: "Trạng thái",
    dataIndex: "status",
    key: "status",
  },
];

export default function ItemDetailPage() {
  const navigate = useNavigate();
  const { selectedWarehouseId } = useAppStore();
  const { data: zones = [] } = useZone();
  const { data: units = [], isLoading: isUnitsLoading } = useUnits();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [form] = Form.useForm<ItemFormValues>();
  const { id } = useParams<{ id: string }>();
  const itemId = Number(id) || 0;
  const updateMutation = useUpdateItem();
  const deactivateMutation = useDeactivateItem();
  const { data } = useItemById(itemId);
  const item = data?.item;
  const stocks = data?.stocks ?? [];

  const warehouseName =
    zones.find((z) => z.id === selectedWarehouseId)?.name ?? "Chưa chọn kho";

  const handleOpenEdit = () => {
    if (!item) return;
    form.setFieldsValue({
      name: item.name,
      sku: item.sku,
      base_unit: units.find((u) => u.name === item.base_unit)?.id,
      base_quantity: item.base_quantity,
      description: item.description ?? "",
      min_quantity: item.min_quantity,
      max_quantity: item.max_quantity,
      quantity: parseQuantity(item.quantity),
      detailEntries: Object.entries(item.details ?? {}).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    });
    setIsEditOpen(true);
  };
  const handleCloseEdit = () => {
    setIsEditOpen(false);
    form.resetFields();
  };
  const handleSubmit = (values: ItemFormValues) => {
    if (!item) return;

    const details = Object.fromEntries(
      (values.detailEntries ?? [])
        .map(({ key, value }) => [key.trim(), value.trim()])
        .filter(([key]) => key.length > 0),
    );

    updateMutation.mutate(
      {
        id: item.id,
        data: {
          name: values.name.trim(),
          description: values.description?.trim() ?? "",
          base_unit: Number(values.base_unit),
          base_quantity: Number(values.base_quantity),
          min_quantity: Number(values.min_quantity),
          max_quantity: Number(values.max_quantity),
          // Không gửi quantity — BE tính từ ItemStock
          ...(Object.keys(details).length > 0 ? { details } : {}),
        },
      },
      {
        onSuccess: () => {
          message.success("Cập nhật sản phẩm thành công!");
          handleCloseEdit();
        },
        onError: (err) => {
          message.error(
            err.response?.data?.detail ?? "Không thể cập nhật sản phẩm",
          );
        },
      },
    );
  };

  const handleDelete = () => {
    if (!item) return;

    Modal.confirmDelete({
      content: `Bạn có chắc chắn muốn xóa sản phẩm "${item.name}" (${item.sku})?`,
      onOk: () =>
        new Promise<void>((resolve, reject) => {
          deactivateMutation.mutate(item.id, {
            onSuccess: () => {
              message.success("Xóa sản phẩm thành công!");
              navigate("/items");
              resolve();
            },
            onError: (err) => {
              message.error(
                err.response?.data?.detail ?? "Không thể xóa sản phẩm",
              );
              reject();
            },
          });
        }),
    });
  };

  if (!item) {
    return (
      <div className="space-y-4">
        <Button
          variant="secondary"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/items")}
        >
          Quay lại
        </Button>
        <Card>
          <p className="text-gray-500">
            Không tìm thấy sản phẩm với id &quot;{id}&quot;.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/items")}
          >
            Quay lại
          </Button>
          <h2 className="text-2xl font-bold text-brand-dark">
            Chi tiết sản phẩm
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{warehouseName}</span>
        </div>
      </div>

      <Card className="rounded-xl">
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-brand-primary">
              {item.sku}
            </p>
            <p className="text-base text-brand-dark">{item.name}</p>
          </div>
          <Space className="shrink-0">
            <Button
              variant="edit"
              icon={<EditOutlined />}
              onClick={handleOpenEdit}
            >
              Chỉnh sửa
            </Button>
            <Button
              variant="dangerText"
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              loading={deactivateMutation.isPending}
              disabled={deactivateMutation.isPending}
              className="hover:bg-red-50 rounded-lg"
            >
              Xóa
            </Button>
          </Space>
        </div>

        <DetailView data={item} fields={itemDetailFields} className="px-5" />

        <div className="border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-brand-dark">
            Tồn kho theo vị trí
          </h3>
        </div>
        <Table<ItemStock>
          columns={locationColumns}
          dataSource={stocks || []}
          rowKey="id"
          pagination={false}
          className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      </Card>

      <Modal
        open={isEditOpen}
        onCancel={handleCloseEdit}
        footer={null}
        width={640}
        destroyOnHidden
        title={
          <div className="flex items-center justify-between gap-4 pr-8">
            <span className="text-brand-dark font-semibold">
              Chỉnh sửa thông tin sản phẩm
            </span>
            <span className="text-sm font-medium text-brand-primary">
              {item.sku}
            </span>
          </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-2"
        >
          <Form.Item
            name="name"
            label="Tên sản phẩm"
            rules={[{ required: true, message: "Vui lòng nhập tên!" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="sku"
            label="Part_number"
            rules={[{ required: true, message: "Vui lòng nhập Part_number!" }]}
          >
            <Input disabled />
          </Form.Item>
          <Form.Item
            name="quantity"
            label="Số lượng"
            rules={[{ required: true, message: "Vui lòng nhập số lượng!" }]}
          >
            <Input type="number" disabled min={0} />
          </Form.Item>
          <Form.Item
            name="base_quantity"
            label="Số lượng cơ sở"
            rules={[
              { required: true, message: "Vui lòng nhập số lượng cơ sở!" },
              { type: "number", min: 1, message: "Giá trị phải >= 1" },
            ]}
          >
            <Input type="number" min={1} />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="min_quantity"
              label="Số lượng tối thiểu"
              rules={[
                { required: true, message: "Vui lòng nhập số lượng tối thiểu!" },
                { type: "number", min: 0, message: "Giá trị phải >= 0" },
              ]}
            >
              <Input type="number" min={0} />
            </Form.Item>
            <Form.Item
              name="max_quantity"
              label="Số lượng tối đa"
              rules={[
                { required: true, message: "Vui lòng nhập số lượng tối đa!" },
                { type: "number", min: 0, message: "Giá trị phải >= 0" },
              ]}
            >
              <Input type="number" min={0} />
            </Form.Item>
          </div>
          <Form.Item
            name="base_unit"
            label="Đơn vị"
            rules={[{ required: true, message: "Vui lòng chọn đơn vị!" }]}
          >
            <Select
              showSearch
              placeholder="Chọn đơn vị"
              optionFilterProp="label"
              loading={isUnitsLoading}
              options={units.map((unit) => ({
                value: unit.id,
                label: unit.name,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="description"
            label="Mô tả"
            rules={[{ required: true, message: "Vui lòng nhập mô tả!" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item className="mb-0 flex justify-end">
            <Space>
              <Button variant="secondary" onClick={handleCloseEdit}>
                Hủy
              </Button>
              <Button
                htmlType="submit"
                variant="primary"
                loading={updateMutation.isPending}
                disabled={updateMutation.isPending}
              >
                Lưu thay đổi
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
