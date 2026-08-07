import { useState, useEffect } from 'react';
import { Card, Table, Button, Modal, Form, Input, Space, message, Select } from '@/components/ui';
import { PlusOutlined, SearchOutlined, MinusCircleOutlined, EditOutlined } from '@ant-design/icons';
import { useZone } from '@/hooks/useZone';
import { useGetItems, useCreateItem, useUpdateItem } from '@/hooks/useItem';
import { useUnits } from '@/hooks/useUnit';
import { useDebounce } from '@/hooks/useDebounce';
import Hero from '@/components/shared/Hero';
import { Item, CreateItemInput, UpdateItemInput } from '@/types/item';
import { Switch, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';

export default function ItemSettingPage() {
  const { data: zones, isLoading: isZonesLoading } = useZone();
  const [activeZoneId, setActiveZoneId] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (zones && zones.length > 0 && !activeZoneId) {
      setActiveZoneId(zones[0].id);
    }
  }, [zones, activeZoneId]);

  const debouncedSearch = useDebounce(search, 500);

  const { data: getItemsResponse, isLoading: isItemsLoading } = useGetItems({
    warehouse_id: activeZoneId || 0,
    q: debouncedSearch.trim() || undefined,
  });

  const items = getItemsResponse?.items || [];
  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();
  const { data: units = [], isLoading: isUnitsLoading } = useUnits();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [form] = Form.useForm();

  const handleOpenCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record: Item) => {
    setEditingItem(record);
    const detailEntries = record.details
      ? Object.entries(record.details).map(([key, value]) => ({ key, value: String(value) }))
      : [];
    form.setFieldsValue({
      ...record,
      base_unit: units.find((u) => u.name === record.base_unit)?.id,
      detailEntries,
    });
    setIsModalOpen(true);
  };

  const handleCloseCreate = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    form.resetFields();
  };

  const handleFinish = (values: any) => {
    if (!activeZoneId) {
      message.error('Vui lòng chọn Zone trước khi thêm.');
      return;
    }

    const details = Object.fromEntries(
      (values.detailEntries ?? [])
        .map(({ key, value }: { key: string, value: string }) => [key.trim(), value.trim()])
        .filter(([key]: [string]) => key.length > 0)
    );

    const data: CreateItemInput = {
      sku: values.sku.trim(),
      name: values.name.trim(),
      description: values.description?.trim() ?? '',
      base_unit: Number(values.base_unit),
      max_quantity: Number(values.max_quantity),
      min_quantity: Number(values.min_quantity),
      warehouse_id: activeZoneId,
      details,
    };

    if (editingItem) {
      const updateData: UpdateItemInput = {
        name: values.name.trim(),
        description: values.description?.trim() ?? '',
        base_unit: Number(values.base_unit),
        max_quantity: Number(values.max_quantity),
        min_quantity: Number(values.min_quantity),
        details,
      };
      updateMutation.mutate(
        { id: editingItem.id, data: updateData },
        {
          onSuccess: () => {
            message.success('Cập nhật Item thành công!');
            handleCloseCreate();
          },
          onError: (err) => {
            message.error(err?.response?.data?.detail || err?.message || 'Có lỗi xảy ra khi cập nhật Item');
          },
        },
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: () => {
          message.success('Thêm Item thành công!');
          handleCloseCreate();
        },
        onError: (err) => {
          message.error(err?.message || 'Có lỗi xảy ra khi thêm Item');
        }
      });
    }
  };

  const columns: ColumnsType<Item> = [
    {
      title: 'Part_number',
      dataIndex: 'sku',
      key: 'sku',
      render: (text: string) => <span className="font-semibold text-brand-primary">{text}</span>,
    },
    {
      title: 'Tên Item',
      dataIndex: 'name',
      key: 'name',
      className: 'font-medium text-slate-700',
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Đơn vị',
      dataIndex: 'base_unit',
      key: 'base_unit',
    },
    {
      title: 'Min / Max',
      key: 'quantity_bounds',
      render: (_: unknown, record: Item) => (
        <span className="text-slate-600">
          {record.min_quantity} / {record.max_quantity}
        </span>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      className: 'text-slate-500',
      render: (val: string) => val ? new Date(val).toLocaleString('vi-VN') : '-',
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 120,
      render: (_: any, record: Item) => (
        <Switch
          checked={record.is_active}
          loading={updateMutation.isPending && updateMutation.variables?.id === record.id}
          onChange={(checked) => {
            updateMutation.mutate({ id: record.id, data: { is_active: checked } });
          }}
        />
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 80,
      render: (_: any, record: Item) => (
        <Tooltip title="Chỉnh sửa">
          <Button
            variant="text"
            icon={<EditOutlined className="text-brand-primary" />}
            onClick={() => handleOpenEdit(record)}
          />
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <Hero
        title="Quản lý Items"
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
              onClick={handleOpenCreate}
              icon={<PlusOutlined />}
              className="bg-brand-primary hover:bg-stripe-primary-deep border-none h-10 rounded-lg font-semibold flex items-center"
            >
              Thêm Item
            </Button>
          </div>
        }
      />

      <Card className="shadow-sm border-gray-100/50 rounded-xl overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
              Danh sách Item
            </h3>
            <Input
              allowClear
              prefix={<SearchOutlined className="text-gray-400" />}
              placeholder="Tìm kiếm theo Part_number, tên, mã..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-80"
            />
          </div>
        </div>
        <Table<Item>
          columns={columns}
          dataSource={items}
          loading={isItemsLoading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
          className="[&_.ant-table-thead_th]:bg-slate-50 [&_.ant-table-thead_th]:text-slate-600 [&_.ant-table-thead_th]:font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      </Card>

      <Modal
        title={<span className="text-brand-dark font-semibold">{editingItem ? "Cập nhật Item" : "Thêm Item Mới"}</span>}
        open={isModalOpen}
        onCancel={handleCloseCreate}
        footer={null}
        width={640}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          className="mt-4"
          onFinish={handleFinish}
          initialValues={{ min_quantity: 10, max_quantity: 999999 }}
        >
          <Form.Item name="sku" label="Part_number" rules={[{ required: true, message: 'Vui lòng nhập Part_number!' }]}>
            <Input placeholder="Ví dụ: PN-019" disabled={!!editingItem} />
          </Form.Item>

          <Form.Item name="name" label="Tên Item" rules={[{ required: true, message: 'Vui lòng nhập tên!' }]}>
            <Input placeholder="Ví dụ: Thùng Carton" />
          </Form.Item>

          <Form.Item
            name="base_unit"
            label="Đơn vị"
            rules={[{ required: true, message: 'Vui lòng chọn đơn vị!' }]}
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

          <div className="grid grid-cols-2 gap-4">
            <Form.Item
              name="min_quantity"
              label="Số lượng tối thiểu"
              rules={[
                { required: true, message: 'Vui lòng nhập số lượng tối thiểu!' },
                { type: 'number', min: 0, message: 'Giá trị phải >= 0' },
              ]}
            >
              <Input type="number" min={0} placeholder="Ví dụ: 10" />
            </Form.Item>
            <Form.Item
              name="max_quantity"
              label="Số lượng tối đa"
              rules={[
                { required: true, message: 'Vui lòng nhập số lượng tối đa!' },
                { type: 'number', min: 0, message: 'Giá trị phải >= 0' },
              ]}
            >
              <Input type="number" min={0} placeholder="Ví dụ: 1000" />
            </Form.Item>
          </div>

          <Form.Item name="description" label="Mô tả" rules={[{ required: true, message: 'Vui lòng nhập mô tả!' }]}>
            <Input placeholder="Ví dụ: Mô tả chi tiết về Item này" />
          </Form.Item>

          <Form.Item label="Thông tin bổ sung (Details)">
            <Form.List name="detailEntries">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Space key={key} align="baseline" className="flex w-full mb-2">
                      <Form.Item
                        {...restField}
                        name={[name, 'key']}
                        rules={[{ required: true, message: 'Nhập tên trường' }]}
                        className="mb-0 flex-1"
                      >
                        <Input placeholder="Tên (vd: color)" />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, 'value']}
                        rules={[{ required: true, message: 'Nhập giá trị' }]}
                        className="mb-0 flex-1"
                      >
                        <Input placeholder="Giá trị (vd: đỏ)" />
                      </Form.Item>
                      <MinusCircleOutlined
                        className="text-red-400 cursor-pointer"
                        onClick={() => remove(name)}
                      />
                    </Space>
                  ))}
                  <Button variant="secondary" onClick={() => add({ key: '', value: '' })} icon={<PlusOutlined />} block>
                    Thêm trường chi tiết
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item className="mb-0 flex justify-end mt-6">
            <Space>
              <Button onClick={handleCloseCreate}>Hủy</Button>
              <Button
                variant="primary"
                htmlType="submit"
                loading={editingItem ? updateMutation.isPending : createMutation.isPending}
                className="bg-brand-primary hover:bg-stripe-primary-deep border-none"
              >
                Lưu lại
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
