import { useMemo, useState } from 'react';
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
  cn,
} from '@/components/ui';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import Hero from '@/components/shared/Hero';
import type { Unit } from '@/types/unit';
import type { ItemUnit } from '@/types/itemUnit';
import { useCreateUnit, useDeleteUnit, useUnits, useUpdateUnit } from '@/hooks/useUnit';
import {
  useCreateItemUnit,
  useDeleteItemUnit,
  useItemOptions,
  useItemUnits,
  useUpdateItemUnit,
} from '@/hooks/useItemUnit';
import { useDebounce } from '@/hooks/useDebounce';

type TabKey = 'units' | 'formulas';

type UnitFormValues = {
  name: string;
  description?: string;
};

type ItemUnitFormValues = {
  item_id: number;
  unit_id: number;
  conversion_factor: number;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'units', label: 'Đơn vị' },
  { key: 'formulas', label: 'Bảng công thức' },
];

export default function UnitSettingPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('units');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const { data: units = [], isLoading, error } = useUnits(debouncedSearch);

  const [formulaSearch, setFormulaSearch] = useState('');
  const debouncedFormulaSearch = useDebounce(formulaSearch, 400);
  const {
    data: itemUnits = [],
    isLoading: isItemUnitsLoading,
    error: itemUnitsError,
  } = useItemUnits();
  const { data: itemOptionsData } = useItemOptions();

  const createMutation = useCreateUnit();
  const updateMutation = useUpdateUnit();
  const deleteMutation = useDeleteUnit();

  const createItemUnitMutation = useCreateItemUnit();
  const updateItemUnitMutation = useUpdateItemUnit();
  const deleteItemUnitMutation = useDeleteItemUnit();

  const [form] = Form.useForm<UnitFormValues>();
  const [itemUnitForm] = Form.useForm<ItemUnitFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isItemUnitModalOpen, setIsItemUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [editingItemUnit, setEditingItemUnit] = useState<ItemUnit | null>(null);

  const itemOptions = itemOptionsData?.items ?? [];

  const filteredItemUnits = useMemo(() => {
    const q = debouncedFormulaSearch.trim().toLowerCase();
    if (!q) return itemUnits;
    return itemUnits.filter(
      (row) =>
        row.item_name?.toLowerCase().includes(q) ||
        row.item_sku?.toLowerCase().includes(q) ||
        row.unit_name?.toLowerCase().includes(q),
    );
  }, [itemUnits, debouncedFormulaSearch]);

  const handleOpenCreate = () => {
    setEditingUnit(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record: Unit) => {
    setEditingUnit(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description ?? '',
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    form.resetFields();
    setIsModalOpen(false);
    setEditingUnit(null);
  };

  const handleOpenCreateItemUnit = () => {
    setEditingItemUnit(null);
    itemUnitForm.resetFields();
    setIsItemUnitModalOpen(true);
  };

  const handleOpenEditItemUnit = (record: ItemUnit) => {
    setEditingItemUnit(record);
    itemUnitForm.setFieldsValue({
      item_id: record.item_id,
      unit_id: record.unit_id,
      conversion_factor: Number(record.conversion_factor),
    });
    setIsItemUnitModalOpen(true);
  };

  const handleCloseItemUnitModal = () => {
    itemUnitForm.resetFields();
    setIsItemUnitModalOpen(false);
    setEditingItemUnit(null);
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: 'Xác nhận xóa',
      content: 'Bạn có chắc chắn muốn xóa đơn vị này không?',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: () =>
        new Promise<void>((resolve) => {
          deleteMutation.mutate(id, {
            onSuccess: () => {
              message.success('Xóa đơn vị thành công!');
              resolve();
            },
            onError: (err) => {
              message.error(err.response?.data?.detail ?? 'Không thể xóa đơn vị');
              resolve();
            },
          });
        }),
    });
  };

  const handleDeleteItemUnit = (id: number) => {
    Modal.confirm({
      title: 'Xác nhận xóa',
      content: 'Bạn có chắc chắn muốn xóa công thức quy đổi này không?',
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: () =>
        new Promise<void>((resolve) => {
          deleteItemUnitMutation.mutate(id, {
            onSuccess: () => {
              message.success('Xóa công thức quy đổi thành công!');
              resolve();
            },
            onError: (err) => {
              message.error(err.response?.data?.detail ?? 'Không thể xóa công thức quy đổi');
              resolve();
            },
          });
        }),
    });
  };

  const handleSubmit = (values: UnitFormValues) => {
    const payload = {
      name: values.name.trim(),
      description: values.description?.trim() || null,
    };

    if (editingUnit) {
      updateMutation.mutate(
        { id: editingUnit.id, data: payload },
        {
          onSuccess: () => {
            message.success('Cập nhật đơn vị thành công!');
            handleCloseModal();
          },
          onError: (err) => {
            message.error(err.response?.data?.detail ?? 'Không thể cập nhật đơn vị');
          },
        },
      );
      return;
    }

    createMutation.mutate(payload, {
      onSuccess: () => {
        message.success('Thêm đơn vị thành công!');
        handleCloseModal();
      },
      onError: (err) => {
        message.error(err.response?.data?.detail ?? 'Không thể thêm đơn vị');
      },
    });
  };

  const handleSubmitItemUnit = (values: ItemUnitFormValues) => {
    const payload = {
      item_id: values.item_id,
      unit_id: values.unit_id,
      conversion_factor: Number(values.conversion_factor),
    };

    if (editingItemUnit) {
      updateItemUnitMutation.mutate(
        { id: editingItemUnit.id, data: payload },
        {
          onSuccess: () => {
            message.success('Cập nhật công thức quy đổi thành công!');
            handleCloseItemUnitModal();
          },
          onError: (err) => {
            message.error(err.response?.data?.detail ?? 'Không thể cập nhật công thức quy đổi');
          },
        },
      );
      return;
    }

    createItemUnitMutation.mutate(payload, {
      onSuccess: () => {
        message.success('Thêm công thức quy đổi thành công!');
        handleCloseItemUnitModal();
      },
      onError: (err) => {
        message.error(err.response?.data?.detail ?? 'Không thể thêm công thức quy đổi');
      },
    });
  };

  const unitColumns = [
    {
      title: 'Tên đơn vị',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <span className="font-semibold text-brand-primary">{text}</span>
      ),
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
      className: 'text-slate-500',
      render: (text: string | null) => text || '—',
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      className: 'text-slate-500',
      render: (val: string | null) =>
        val ? new Date(val).toLocaleString('vi-VN') : '—',
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 120,
      render: (_: unknown, record: Unit) => (
        <Space size="middle">
          <Button
            variant="edit"
            icon={<EditOutlined className="text-brand-primary" />}
            onClick={() => handleOpenEdit(record)}
            title="Sửa"
          />
          <Button
            variant="dangerText"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
            className="hover:bg-red-50 rounded-lg"
            title="Xóa"
          />
        </Space>
      ),
    },
  ];

  const itemUnitColumns = [
    {
      title: 'Part_number',
      dataIndex: 'item_sku',
      key: 'item_sku',
      render: (text: string | null) => (
        <span className="font-semibold text-brand-primary">{text || '—'}</span>
      ),
    },
    {
      title: 'Tên sản phẩm',
      dataIndex: 'item_name',
      key: 'item_name',
      className: 'text-slate-600',
      render: (text: string | null) => text || '—',
    },
    {
      title: 'Đơn vị',
      dataIndex: 'unit_name',
      key: 'unit_name',
      render: (text: string | null) => (
        <span className="font-medium text-brand-dark">{text || '—'}</span>
      ),
    },
    {
      title: 'Hệ số quy đổi',
      dataIndex: 'conversion_factor',
      key: 'conversion_factor',
      className: 'text-slate-600',
      render: (val: number) => Number(val).toLocaleString('vi-VN'),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      className: 'text-slate-500',
      render: (val: string | null) =>
        val ? new Date(val).toLocaleString('vi-VN') : '—',
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 120,
      render: (_: unknown, record: ItemUnit) => (
        <Space size="middle">
          <Button
            variant="edit"
            icon={<EditOutlined className="text-brand-primary" />}
            onClick={() => handleOpenEditItemUnit(record)}
            title="Sửa"
          />
          <Button
            variant="dangerText"
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteItemUnit(record.id)}
            className="hover:bg-red-50 rounded-lg"
            title="Xóa"
          />
        </Space>
      ),
    },
  ];

  const isUnitsTab = activeTab === 'units';
  const isPageLoading = isUnitsTab ? isLoading : isItemUnitsLoading;
  const pageError = isUnitsTab ? error : itemUnitsError;

  if (isPageLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="text-brand-primary/70 font-medium">
          {isUnitsTab ? 'Đang tải danh sách đơn vị...' : 'Đang tải bảng công thức...'}
        </span>
      </div>
    );
  }

  if (pageError) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl">
        Không thể kết nối đến máy chủ. Vui lòng tải lại trang!
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Hero
        title="Quản lý Đơn vị"
        extra={
          isUnitsTab ? (
            <Button
              onClick={handleOpenCreate}
              icon={<PlusOutlined />}
              className="!bg-brand-primary hover:!bg-stripe-primary-deep !border-none !h-10 !rounded-lg font-semibold flex items-center"
            >
              Thêm Đơn vị
            </Button>
          ) : (
            <Button
              onClick={handleOpenCreateItemUnit}
              icon={<PlusOutlined />}
              className="!bg-brand-primary hover:!bg-stripe-primary-deep !border-none !h-10 !rounded-lg font-semibold flex items-center"
            >
              Thêm Công thức
            </Button>
          )
        }
      />

      <div className="overflow-hidden rounded-t-xl border border-gray-100/50 shadow-sm">
        <div className="flex items-stretch gap-0 border-b border-stripe-hairline bg-[#eef2f6]">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'relative min-h-11 min-w-[160px] px-6 py-3 text-sm font-semibold transition-all',
                  isActive
                    ? 'z-10 -mb-px border border-stripe-hairline border-b-white bg-white text-brand-primary shadow-[0_1px_0_0_#fff]'
                    : 'mb-0 border border-transparent bg-transparent text-stripe-ink-mute hover:bg-white/40 hover:text-brand-dark',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <Card className="!rounded-none border-0 shadow-none overflow-hidden p-0">
        {isUnitsTab ? (
          <>
            <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
                Danh sách Đơn vị
              </h3>
              <Input
                allowClear
                prefix={<SearchOutlined className="text-gray-400" />}
                placeholder="Tìm theo tên đơn vị..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="!w-80"
              />
            </div>
            <Table
              columns={unitColumns}
              dataSource={units}
              rowKey="id"
              pagination={{ pageSize: 20 }}
              className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
            />
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4 border-b border-gray-100 px-5 py-4">
              <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
                Bảng công thức quy đổi
              </h3>
              <Input
                allowClear
                prefix={<SearchOutlined className="text-gray-400" />}
                placeholder="Tìm theo Part_number, tên sản phẩm hoặc đơn vị..."
                value={formulaSearch}
                onChange={(e) => setFormulaSearch(e.target.value)}
                className="!w-80"
              />
            </div>
            <Table
              columns={itemUnitColumns}
              dataSource={filteredItemUnits}
              rowKey="id"
              pagination={{ pageSize: 20 }}
              className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
            />
          </>
        )}
        </Card>
      </div>

      <Modal
        title={editingUnit ? 'Cập nhật Đơn vị' : 'Thêm Đơn vị mới'}
        open={isModalOpen}
        onCancel={handleCloseModal}
        footer={null}
        centered
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-4"
          preserve={false}
        >
          <Form.Item
            name="name"
            label="Tên đơn vị"
            rules={[{ required: true, message: 'Vui lòng nhập tên đơn vị!' }]}
          >
            <Input placeholder="Ví dụ: thùng, kg, cái..." />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Mô tả chi tiết về đơn vị" />
          </Form.Item>

          <Form.Item className="mb-0 flex justify-end">
            <Space>
              <Button onClick={handleCloseModal}>Hủy</Button>
              <Button
                htmlType="submit"
                loading={createMutation.isPending || updateMutation.isPending}
                className="!bg-brand-primary hover:!bg-stripe-primary-deep !border-none"
              >
                {editingUnit ? 'Cập nhật' : 'Lưu lại'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingItemUnit ? 'Cập nhật Công thức quy đổi' : 'Thêm Công thức quy đổi mới'}
        open={isItemUnitModalOpen}
        onCancel={handleCloseItemUnitModal}
        footer={null}
        centered
        forceRender
      >
        <Form
          form={itemUnitForm}
          layout="vertical"
          onFinish={handleSubmitItemUnit}
          className="mt-4"
          preserve={false}
        >
          <Form.Item
            name="item_id"
            label="Sản phẩm"
            rules={[{ required: true, message: 'Vui lòng chọn sản phẩm!' }]}
          >
            <Select
              showSearch
              placeholder="Chọn sản phẩm"
              optionFilterProp="label"
              options={itemOptions.map((item) => ({
                value: item.id,
                label: `${item.sku} — ${item.name}`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="unit_id"
            label="Đơn vị"
            rules={[{ required: true, message: 'Vui lòng chọn đơn vị!' }]}
          >
            <Select
              showSearch
              placeholder="Chọn đơn vị"
              optionFilterProp="label"
              options={units.map((unit) => ({
                value: unit.id,
                label: unit.name,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="conversion_factor"
            label="Hệ số quy đổi"
            rules={[
              { required: true, message: 'Vui lòng nhập hệ số quy đổi!' },
              {
                validator: (_, value) => {
                  if (value === undefined || value === null || value === '') {
                    return Promise.resolve();
                  }
                  const num = Number(value);
                  if (Number.isNaN(num) || num <= 0) {
                    return Promise.reject(new Error('Hệ số quy đổi phải lớn hơn 0'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input type="number" min={0} step="0.0001" placeholder="Ví dụ: 12, 0.5..." />
          </Form.Item>

          <Form.Item className="mb-0 flex justify-end">
            <Space>
              <Button onClick={handleCloseItemUnitModal}>Hủy</Button>
              <Button
                htmlType="submit"
                loading={createItemUnitMutation.isPending || updateItemUnitMutation.isPending}
                className="!bg-brand-primary hover:!bg-stripe-primary-deep !border-none"
              >
                {editingItemUnit ? 'Cập nhật' : 'Lưu lại'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
