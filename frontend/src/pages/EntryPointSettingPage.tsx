import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Space, message, Select } from '@/components/ui';
import { PlusOutlined, DeleteOutlined, EnvironmentOutlined, SearchOutlined } from '@ant-design/icons';
import { useZone } from '@/hooks/useZone';
import { useGetEntryPoints, useUpdateEntryPointStatus, useCreateEntryPoint, useDeleteEntryPoint } from '@/hooks/useEntryPoint';
import { useDebounce } from '@/hooks/useDebounce';
import Hero from '@/components/shared/Hero';
import { EntryPoint } from '@/types/entryPoint';
import { Switch, Popconfirm, Tooltip } from 'antd';
import WarehouseMapCanvas from '@/components/shared/WarehouseMapCanvas';
import type { NodeInfo } from '@/types/warehouseMap';
export default function EntryPointSettingPage() {
  const { data: zones, isLoading: isZonesLoading } = useZone();
  const [activeZoneId, setActiveZoneId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (zones && zones.length > 0 && !activeZoneId) {
      setActiveZoneId(zones[0].id);
    }
  }, [zones, activeZoneId]);

  // Gọi API lấy danh sách Điểm Nhập
  const [searchCode, setSearchCode] = useState('');
  const debouncedSearchCode = useDebounce(searchCode, 500);
  const { data: entryPoints, isLoading: isEntryPointsLoading } = useGetEntryPoints(
    activeZoneId,
    debouncedSearchCode.trim() || undefined
  );
  
  const updateStatusMutation = useUpdateEntryPointStatus();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [form] = Form.useForm();

  const createMutation = useCreateEntryPoint();
  const deleteMutation = useDeleteEntryPoint();

  const handleFinish = (values: any) => {
    if (!activeZoneId) {
      message.error('Vui lòng chọn Zone trước khi thêm điểm nhập.');
      return;
    }
    createMutation.mutate({
      code: values.node_code,
      description: values.description,
      zone_id: activeZoneId,
    }, {
      onSuccess: () => {
        message.success('Thêm điểm nhập thành công!');
        setIsModalOpen(false);
        form.resetFields();
      },
      onError: () => {
        message.error('Có lỗi xảy ra khi thêm điểm nhập.');
      }
    });
  };

  const columns = [
    {
      title: 'Mã Node (Code)',
      dataIndex: 'code',
      key: 'code',
      render: (text: string) => <span className="font-semibold text-brand-primary">{text}</span>,
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
      className: 'font-medium text-slate-700',
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      className: 'text-slate-500',
      render: (val: string) => val ? new Date(val).toLocaleString('vi-VN') : '-',
    },
    {
      title: 'Ngày cập nhật',
      dataIndex: 'updated_at',
      key: 'updated_at',
      className: 'text-slate-500',
      render: (val: string) => val ? new Date(val).toLocaleString('vi-VN') : '-',
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 120,
      render: (_: any, record: EntryPoint) => (
        <Switch
          checked={record.is_active}
          loading={updateStatusMutation.isPending && updateStatusMutation.variables?.id === record.id}
          onChange={(checked) => {
            if (activeZoneId) {
              updateStatusMutation.mutate({ id: record.id, zone_id: activeZoneId, is_active: checked });
            }
          }}
        />
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 80,
      render: (_: any, record: EntryPoint) => (
        <Space>
          <Popconfirm
            title="Xóa điểm nhập"
            description="Bạn có chắc chắn muốn xóa điểm nhập này?"
            onConfirm={() => {
              if (activeZoneId) {
                deleteMutation.mutate({ id: record.id, zone_id: activeZoneId }, {
                  onSuccess: () => message.success('Xóa điểm nhập thành công!'),
                  onError: (err) => message.error(err.response?.data?.detail || err.message || 'Có lỗi xảy ra')
                });
              }
            }}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true, loading: deleteMutation.isPending && deleteMutation.variables?.id === record.id }}
          >
            <Tooltip title="Xóa">
              <Button
                variant="dangerText"
                icon={<DeleteOutlined />}
              />
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
              loading={isZonesLoading}
              value={activeZoneId}
              onChange={setActiveZoneId}
              placeholder="Chọn khu vực..."
              className="w-56"
              options={zones?.map(z => ({ label: z.name, value: z.id })) || []}
            />
            <Button
              onClick={() => setIsModalOpen(true)}
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
              placeholder="Tìm kiếm theo Mã Node..."
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
          className="[&_.ant-table-thead_th]:bg-slate-50! [&_.ant-table-thead_th]:text-slate-600! [&_.ant-table-thead_th]:font-semibold! [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      </Card>

      {/* Modal Thêm Điểm Nhập (UI Draft) */}
      <Modal
        title="Thêm Điểm Nhập Mới"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" className="mt-4" onFinish={handleFinish}>
          <Form.Item name="description" label="Mô tả (Tên điểm nhập)" required>
            <Input placeholder="Ví dụ: Dây chuyền 1-a" />
          </Form.Item>

          <Form.Item label="Mã Node (Vị trí trên bản đồ)" required className="mb-0">
            <Space.Compact className="w-full">
              <Form.Item name="node_code" noStyle rules={[{ required: true, message: 'Vui lòng nhập hoặc chọn Node' }]}>
                <Input placeholder="Nhập mã Node hoặc chọn từ bản đồ..." />
              </Form.Item>
              <Button
                variant="primary"
                icon={<EnvironmentOutlined />}
                className="bg-brand-primary"
                onClick={() => setIsMapModalOpen(true)}
              >
                Chọn trên Map
              </Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item className="mb-0 flex justify-end mt-6">
            <Space>
              <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
              <Button
                variant="primary"
                htmlType="submit"
                loading={createMutation.isPending}
                className="bg-brand-primary! hover:bg-stripe-primary-deep! border-none!"
              >
                Lưu lại
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Chọn Map Node */}
      <Modal
        title="Chọn Vị trí trên Bản đồ"
        open={isMapModalOpen}
        onCancel={() => setIsMapModalOpen(false)}
        footer={null}
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { height: '80vh', padding: 0 } }}
        destroyOnClose
      >
        <div className="w-full h-full">
          <WarehouseMapCanvas
            hideToolbar={true}
            hideDrawer={true}
            onNodeClick={(node: NodeInfo | null) => {
              if (node && node.name) {
                form.setFieldsValue({ node_code: node.content });
                setIsMapModalOpen(false);
                message.success(`Đã chọn Node: ${node.content}`);
              } else if (node && !node.content) {
                message.warning('Node này không có tên/mã hợp lệ.');
              }
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
