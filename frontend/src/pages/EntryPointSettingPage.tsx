import { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  message,
  Select,
} from "@/components/ui";
import {
  PlusOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useWarehouses } from "@/hooks/useWarehouse";
import {
  useGetEntryPoints,
  useUpdateEntryPointStatus,
  useCreateEntryPoint,
  useDeleteEntryPoint,
} from "@/hooks/useEntryPoint";
import { useDebounce } from "@/hooks/useDebounce";
import Hero from "@/components/shared/Hero";
import type { EntryPoint } from "@/types/entryPoint";
import { Switch, Popconfirm, Tooltip, Tag } from "antd";
import WarehouseMapCanvas from "@/components/shared/WarehouseMapCanvas";
import type { NodeInfo } from "@/types/warehouseMap";
import { getLocationDetailByCodeApi } from "@/api/warehouseMap";
import { useAppStore } from "@/store/useAppStore";
import { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";

const INBOUND_BUFFER = "inbound_buffer";

function errorDetail(err: unknown, fallback: string) {
  if (err instanceof AxiosError) {
    const detail = (err.response?.data as ApiErrorResponse | undefined)?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function EntryPointSettingPage() {
  const { data: warehouses, isLoading: isWarehousesLoading } = useWarehouses();
  const { selectedWarehouseId, setSelectedWarehouseId } = useAppStore();
  const [activeWarehouseId, setActiveWarehouseId] = useState<number | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!warehouses?.length || activeWarehouseId) return;
    const fromStore = warehouses.find((z) => z.id === selectedWarehouseId);
    const masanZone =
      warehouses.find((z) => z.code === "MSC_MASAN") ||
      warehouses.find((z) => (z.name || "").toLowerCase().includes("masan"));
    setActiveWarehouseId(fromStore?.id ?? masanZone?.id ?? warehouses[0].id);
  }, [warehouses, activeWarehouseId, selectedWarehouseId]);

  const handleWarehouseChange = (warehouseId: number) => {
    setActiveWarehouseId(warehouseId);
    setSelectedWarehouseId(warehouseId);
  };

  const [searchCode, setSearchCode] = useState("");
  const debouncedSearchCode = useDebounce(searchCode, 500);
  const { data: entryPoints, isLoading: isEntryPointsLoading } =
    useGetEntryPoints({
      zone_id: activeWarehouseId,
      code: debouncedSearchCode.trim() || undefined,
    });

  const updateStatusMutation = useUpdateEntryPointStatus();
  const createMutation = useCreateEntryPoint();
  const deleteMutation = useDeleteEntryPoint();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [form] = Form.useForm();

  const resetCreateForm = () => {
    form.resetFields();
  };

  const resolveLocationByCode = async (locationCode: string) => {
    const code = locationCode.trim();
    if (!code) {
      message.warning("Vui lòng nhập hoặc chọn mã location.");
      return null;
    }
    if (!activeWarehouseId) {
      message.error("Vui lòng chọn Kho trước.");
      return null;
    }

    setIsResolvingLocation(true);
    try {
      const detail = await getLocationDetailByCodeApi(code);
      const location = detail.location;

      if (!location.is_active) {
        message.error(`Location '${location.location_code}' đang inactive.`);
        return null;
      }
      if (location.location_type !== INBOUND_BUFFER) {
        message.error(
          `Location '${location.location_code}' không phải inbound_buffer (hiện là ${location.location_type}).`,
        );
        return null;
      }
      if (location.zone_id !== activeWarehouseId) {
        message.error(
          `Location '${location.location_code}' không thuộc kho đang chọn.`,
        );
        return null;
      }

      return location;
    } catch (err) {
      message.error(
        errorDetail(err, "Không tìm thấy location theo mã đã chọn."),
      );
      return null;
    } finally {
      setIsResolvingLocation(false);
    }
  };

  const handleMapNodeClick = async (node: NodeInfo | null) => {
    if (!node?.content) {
      if (node) message.warning("Node này không có mã hợp lệ.");
      return;
    }

    const location = await resolveLocationByCode(node.content);
    if (!location) return;

    form.setFieldsValue({
      warehouse_location_id: location.id,
      location_code: location.location_code,
      name:
        form.getFieldValue("name") ||
        location.bin ||
        location.node_name ||
        location.location_code,
    });
    setIsMapModalOpen(false);
    message.success(
      `Đã chọn buffer: ${location.location_code} (id ${location.id})`,
    );
  };

  const handleFinish = async (values: {
    name: string;
    description?: string;
    warehouse_location_id?: number;
    location_code?: string;
  }) => {
    if (!activeWarehouseId) {
      message.error("Vui lòng chọn Kho trước khi thêm điểm nhập.");
      return;
    }

    let warehouseLocationId = values.warehouse_location_id as
      | number
      | undefined;

    if (!warehouseLocationId && values.location_code) {
      const location = await resolveLocationByCode(values.location_code);
      if (!location) return;
      warehouseLocationId = location.id;
      form.setFieldsValue({
        warehouse_location_id: location.id,
        location_code: location.location_code,
      });
    }

    if (!warehouseLocationId) {
      message.error(
        "Vui lòng chọn inbound buffer trên bản đồ hoặc nhập mã location.",
      );
      return;
    }

    createMutation.mutate(
      {
        warehouse_location_id: warehouseLocationId,
        name: values.name.trim(),
        description: values.description?.trim() || null,
      },
      {
        onSuccess: () => {
          message.success("Thêm điểm nhập thành công!");
          setIsModalOpen(false);
          resetCreateForm();
        },
        onError: (err) => {
          message.error(errorDetail(err, "Có lỗi xảy ra khi thêm điểm nhập."));
        },
      },
    );
  };

  const columns = [
    {
      title: "Tên điểm nhập",
      dataIndex: "name",
      key: "name",
      render: (text: string) => (
        <span className="font-semibold text-brand-primary">{text}</span>
      ),
    },
    {
      title: "Mã location",
      dataIndex: "code",
      key: "code",
      className: "font-medium text-slate-700",
    },
    {
      title: "Mô tả",
      dataIndex: "description",
      key: "description",
      className: "text-slate-600",
      render: (val: string | null) => val || "-",
    },
    {
      title: "Trạng thái station",
      dataIndex: "location_status",
      key: "location_status",
      width: 140,
      render: (status: string, record: EntryPoint) => (
        <Tag color={record.is_available ? "green" : "default"}>
          {status}
          {record.is_available ? " · sẵn sàng" : ""}
        </Tag>
      ),
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      className: "text-slate-500",
      render: (val: string) =>
        val ? new Date(val).toLocaleString("vi-VN") : "-",
    },
    {
      title: "Kích hoạt",
      key: "status",
      width: 110,
      render: (_: unknown, record: EntryPoint) => (
        <Switch
          checked={record.is_active}
          loading={
            updateStatusMutation.isPending &&
            updateStatusMutation.variables?.id === record.id
          }
          onChange={(checked) => {
            updateStatusMutation.mutate(
              { id: record.id, zone_id: activeZoneId ?? 0, is_active: checked },
              {
                onError: (err) =>
                  message.error(
                    errorDetail(err, "Không thể cập nhật trạng thái."),
                  ),
              },
            );
          }}
        />
      ),
    },
    {
      title: "Hành động",
      key: "action",
      width: 80,
      render: (_: unknown, record: EntryPoint) => (
        <Space>
          <Popconfirm
            title="Vô hiệu hóa điểm nhập"
            description="Start-point sẽ được deactivate (không xóa cứng)."
            onConfirm={() => {
              deleteMutation.mutate({ id: record.id, zone_id: activeZoneId ?? 0 }, {
                onSuccess: () => message.success("Đã vô hiệu hóa điểm nhập."),
                onError: (err) =>
                  message.error(
                    errorDetail(err, "Không thể vô hiệu hóa điểm nhập."),
                  ),
              });
            }}
            okText="Xác nhận"
            cancelText="Hủy"
            okButtonProps={{
              danger: true,
              loading:
                deleteMutation.isPending &&
                deleteMutation.variables?.id === record.id,
            }}
          >
            <Tooltip title="Vô hiệu hóa">
              <Button variant="dangerText" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Hero
        title="Quản lý Điểm Nhập Kho"
        extra={
          <div className="flex items-center gap-4">
            <Select
              loading={isWarehousesLoading}
              value={activeWarehouseId}
              onChange={handleWarehouseChange}
              placeholder="Chọn kho..."
              className="w-56"
              options={
                warehouses?.map((z) => ({ label: z.name, value: z.id })) || []
              }
            />
            <Button
              onClick={() => {
                resetCreateForm();
                setIsModalOpen(true);
              }}
              icon={<PlusOutlined />}
              className="bg-brand-primary! hover:bg-stripe-primary-deep! border-none! h-10! rounded-lg! font-semibold flex items-center"
            >
              Thêm Điểm Nhập
            </Button>
          </div>
        }
      />

      <Card className="shadow-sm border-gray-100/50 rounded-xl overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
              Danh sách Điểm Nhập
            </h3>
            <Input
              allowClear
              prefix={<SearchOutlined className="text-gray-400" />}
              placeholder="Tìm theo mã location..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              className="!w-80"
            />
          </div>
        </div>
        <Table
          columns={columns}
          dataSource={entryPoints || []}
          loading={isEntryPointsLoading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          className="[&_.ant-table-thead_th]:bg-slate-50! [&_.ant-table-thead_th]:text-slate-600! [&_.ant-table-thead_th]:font-semibold! [&_.ant-table-row]:hover:bg-slate-50/50 [&_.ant-table-cell]:text-center!"
        />
      </Card>

      <Modal
        title="Thêm Điểm Nhập Mới"
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          resetCreateForm();
        }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          className="mt-4"
          onFinish={handleFinish}
        >
          <Form.Item name="warehouse_location_id" hidden>
            <Input />
          </Form.Item>

          <Form.Item
            name="name"
            label="Tên điểm nhập"
            rules={[{ required: true, message: "Vui lòng nhập tên điểm nhập" }]}
          >
            <Input placeholder="Ví dụ: Buffer nhập AIB01" />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={2} placeholder="Mô tả tùy chọn..." />
          </Form.Item>

          <Form.Item
            label="Inbound buffer (location)"
            required
            className="mb-0"
          >
            <Space.Compact className="w-full">
              <Form.Item
                name="location_code"
                noStyle
                rules={[
                  {
                    required: true,
                    message: "Vui lòng chọn hoặc nhập mã location",
                  },
                ]}
              >
                <Input
                  placeholder="Mã location / QR trên bản đồ..."
                  onChange={() => {
                    form.setFieldsValue({ warehouse_location_id: undefined });
                  }}
                />
              </Form.Item>
              <Button
                variant="primary"
                icon={<EnvironmentOutlined />}
                className="bg-brand-primary"
                loading={isResolvingLocation}
                onClick={() => {
                  if (activeWarehouseId) setSelectedWarehouseId(activeWarehouseId);
                  setIsMapModalOpen(true);
                }}
              >
                Chọn trên Map
              </Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item className="mb-0 flex justify-end mt-6">
            <Space>
              <Button
                onClick={() => {
                  setIsModalOpen(false);
                  resetCreateForm();
                }}
              >
                Hủy
              </Button>
              <Button
                variant="primary"
                htmlType="submit"
                loading={createMutation.isPending || isResolvingLocation}
                className="bg-brand-primary! hover:bg-stripe-primary-deep! border-none!"
              >
                Lưu lại
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Chọn inbound buffer trên bản đồ"
        open={isMapModalOpen}
        onCancel={() => setIsMapModalOpen(false)}
        footer={null}
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { height: "80vh", padding: 0 } }}
        destroyOnHidden
      >
        <div className="w-full h-full relative">
          {isResolvingLocation && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 text-slate-600 font-medium">
              Đang kiểm tra location...
            </div>
          )}
          <WarehouseMapCanvas
            hideToolbar={true}
            hideDrawer={true}
            onNodeClick={handleMapNodeClick}
          />
        </div>
      </Modal>
    </div>
  );
}
