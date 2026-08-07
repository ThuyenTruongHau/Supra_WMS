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
} from '@/components/ui';
import {
  PlusOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  SearchOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { Popconfirm, Tag, Tooltip } from 'antd';
import Hero from '@/components/shared/Hero';
import WarehouseMapCanvas from '@/components/shared/WarehouseMapCanvas';
import type { NodeInfo } from '@/types/warehouseMap';
import type { Zone } from '@/types/zone';
import {
  useAssignZoneLocations,
  useCreateZone,
  useDeleteZone,
  useUpdateZone,
  useWarehouseLocations,
  useZones,
} from '@/hooks/useZones';
import { useDebounce } from '@/hooks/useDebounce';
import { useAppStore } from '@/store/useAppStore';
import { useFullLocations } from '@/hooks/useWarehouseMap';

type ZoneFormValues = {
  code: string;
  name?: string;
  description?: string;
};

export default function ZoneSettingPage() {
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);

  const [searchCode, setSearchCode] = useState('');
  const debouncedSearchCode = useDebounce(searchCode, 400);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [selectedLocationCodes, setSelectedLocationCodes] = useState<string[]>([]);
  const [form] = Form.useForm<ZoneFormValues>();

  const { data: zones = [], isLoading: isZonesLoading } = useZones(selectedWarehouseId);
  const { data: warehouseLocations = [] } = useWarehouseLocations(selectedWarehouseId);
  const { data: fullLocationsData } = useFullLocations(selectedWarehouseId ?? 0);

  const createMutation = useCreateZone();
  const updateMutation = useUpdateZone();
  const deleteMutation = useDeleteZone();
  const assignMutation = useAssignZoneLocations();

  const locationCountByZone = useMemo(() => {
    const counts = new Map<number, number>();
    for (const loc of warehouseLocations) {
      if (loc.zone_id == null) continue;
      counts.set(loc.zone_id, (counts.get(loc.zone_id) ?? 0) + 1);
    }
    return counts;
  }, [warehouseLocations]);

  const filteredZones = useMemo(() => {
    const q = debouncedSearchCode.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter(
      (z) =>
        z.code.toLowerCase().includes(q) ||
        (z.name ?? '').toLowerCase().includes(q),
    );
  }, [zones, debouncedSearchCode]);

  const codeToLocationId = useMemo(() => {
    const map = new Map<string, number>();
    for (const loc of fullLocationsData?.locations ?? []) {
      map.set(String(loc.location_code), loc.id);
    }
    return map;
  }, [fullLocationsData]);

  const handleOpenCreate = () => {
    setEditingZone(null);
    setSelectedLocationCodes([]);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleOpenEdit = async (zone: Zone) => {
    setEditingZone(zone);
    form.setFieldsValue({
      code: zone.code,
      name: zone.name ?? '',
      description: zone.description ?? '',
    });
    const zoneLocations = warehouseLocations.filter((loc) => loc.zone_id === zone.id);
    setSelectedLocationCodes(zoneLocations.map((loc) => String(loc.location_code)));
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    form.resetFields();
    setIsModalOpen(false);
    setEditingZone(null);
    setSelectedLocationCodes([]);
  };

  const resolveLocationIds = (codes: string[]): number[] => {
    const ids: number[] = [];
    const missing: string[] = [];
    for (const raw of codes) {
      const code = String(raw);
      const id = codeToLocationId.get(code);
      if (id) ids.push(id);
      else missing.push(code);
    }
    if (missing.length > 0) {
      throw new Error(
        `Không tìm thấy location trong DB (chưa import map hoặc mã không khớp): ${missing.join(', ')}`,
      );
    }
    return ids;
  };

  const handleFinish = async (values: ZoneFormValues) => {
    if (!selectedWarehouseId) {
      message.error('Vui lòng chọn kho ở header trước.');
      return;
    }

    let locationIds: number[] = [];
    try {
      locationIds = resolveLocationIds(selectedLocationCodes);
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Lỗi location');
      return;
    }

    const onAssigned = () => {
      message.success(editingZone ? 'Cập nhật Zone thành công!' : 'Thêm Zone thành công!');
      handleCloseModal();
    };

    const onAssignError = (err: { response?: { data?: { detail?: string } } }) => {
      message.error(err.response?.data?.detail ?? 'Không thể gán điểm cho Zone');
    };

    if (editingZone) {
      updateMutation.mutate(
        {
          id: editingZone.id,
          data: {
            code: values.code.trim(),
            name: values.name?.trim() || null,
            description: values.description?.trim() || null,
          },
        },
        {
          onSuccess: () => {
            assignMutation.mutate(
              { zoneId: editingZone.id, locationIds },
              { onSuccess: onAssigned, onError: onAssignError },
            );
          },
          onError: (err) => {
            message.error(err.response?.data?.detail ?? 'Không thể cập nhật Zone');
          },
        },
      );
      return;
    }

    createMutation.mutate(
      {
        warehouse_id: selectedWarehouseId,
        code: values.code.trim(),
        name: values.name?.trim() || null,
        description: values.description?.trim() || null,
      },
      {
        onSuccess: (zone) => {
          assignMutation.mutate(
            { zoneId: zone.id, locationIds },
            { onSuccess: onAssigned, onError: onAssignError },
          );
        },
        onError: (err) => {
          message.error(err.response?.data?.detail ?? 'Không thể thêm Zone');
        },
      },
    );
  };

  const toggleLocationCode = (code: string) => {
    const normalized = String(code);
    setSelectedLocationCodes((prev) =>
      prev.includes(normalized)
        ? prev.filter((c) => c !== normalized)
        : [...prev, normalized],
    );
  };

  const columns = [
    {
      title: 'Mã Zone',
      dataIndex: 'code',
      key: 'code',
      render: (text: string) => (
        <span className="font-semibold text-brand-primary">{text}</span>
      ),
    },
    {
      title: 'Tên Zone',
      dataIndex: 'name',
      key: 'name',
      render: (text: string | null) => text || '—',
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
      render: (text: string | null) => text || '—',
    },
    {
      title: 'Số điểm',
      key: 'location_count',
      width: 100,
      render: (_: unknown, record: Zone) => (
        <span className="font-medium text-slate-700">
          {locationCountByZone.get(record.id) ?? 0}
        </span>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 120,
      render: (_: unknown, record: Zone) => (
        <Space>
          <Tooltip title="Chỉnh sửa">
            <Button
              variant="edit"
              icon={<EditOutlined className="text-brand-primary" />}
              onClick={() => handleOpenEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="Xóa Zone"
            description="Bạn có chắc chắn muốn xóa Zone này?"
            onConfirm={() => {
              deleteMutation.mutate(record.id, {
                onSuccess: () => message.success('Xóa Zone thành công!'),
                onError: (err) =>
                  message.error(err.response?.data?.detail ?? 'Không thể xóa Zone'),
              });
            }}
            okText="Xóa"
            cancelText="Hủy"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="Xóa">
              <Button variant="dangerText" icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const isSaving =
    createMutation.isPending ||
    updateMutation.isPending ||
    assignMutation.isPending;

  return (
    <div className="space-y-6">
      <Hero
        title="Quản lý Zone"
        extra={
          <Button
            onClick={handleOpenCreate}
            icon={<PlusOutlined />}
            className="bg-brand-primary! hover:bg-stripe-primary-deep! border-none! h-10! rounded-lg! font-semibold flex items-center"
            disabled={!selectedWarehouseId}
          >
            Thêm Zone
          </Button>
        }
      />

      <Card className="shadow-sm border-gray-100/50 rounded-xl overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
              Danh sách Zone
            </h3>
            <Input
              allowClear
              prefix={<SearchOutlined className="text-gray-400" />}
              placeholder="Tìm theo mã hoặc tên Zone..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              className="!w-80"
            />
          </div>
        </div>
        <Table
          columns={columns}
          dataSource={filteredZones}
          loading={isZonesLoading}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          className="[&_.ant-table-thead_th]:bg-slate-50! [&_.ant-table-thead_th]:text-slate-600! [&_.ant-table-thead_th]:font-semibold! [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      </Card>

      <Modal
        title={editingZone ? 'Cập nhật Zone' : 'Thêm Zone mới'}
        open={isModalOpen}
        onCancel={handleCloseModal}
        footer={null}
        centered
        width={720}
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          className="mt-4"
          onFinish={handleFinish}
          preserve={false}
        >
          <Form.Item
            name="code"
            label="Mã Zone"
            rules={[{ required: true, message: 'Vui lòng nhập mã Zone' }]}
          >
            <Input placeholder="Ví dụ: ZONE-A" disabled={!!editingZone} />
          </Form.Item>

          <Form.Item name="name" label="Tên Zone">
            <Input placeholder="Ví dụ: Khu vực A" />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input placeholder="Mô tả Zone" />
          </Form.Item>

          <Form.Item label="Các điểm thuộc Zone">
            <Space orientation="vertical" className="w-full">
              <Space.Compact className="w-full">
                <Input
                  readOnly
                  value={
                    selectedLocationCodes.length > 0
                      ? `Đã chọn ${selectedLocationCodes.length} điểm`
                      : 'Chưa chọn điểm nào'
                  }
                  placeholder="Chọn điểm trên bản đồ..."
                />
                <Button
                  variant="primary"
                  icon={<EnvironmentOutlined />}
                  className="bg-brand-primary"
                  onClick={() => setIsMapModalOpen(true)}
                >
                  Chọn trên Map
                </Button>
              </Space.Compact>
              {selectedLocationCodes.length > 0 && (
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {selectedLocationCodes.map((code) => (
                    <Tag
                      key={code}
                      closable
                      onClose={() => toggleLocationCode(code)}
                      className="mr-0"
                    >
                      {code}
                    </Tag>
                  ))}
                </div>
              )}
            </Space>
          </Form.Item>

          <Form.Item className="mb-0 flex justify-end mt-6">
            <Space>
              <Button onClick={handleCloseModal}>Hủy</Button>
              <Button
                variant="primary"
                htmlType="submit"
                loading={isSaving}
                className="bg-brand-primary! hover:bg-stripe-primary-deep! border-none!"
              >
                Lưu lại
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Chọn các điểm trên Bản đồ"
        open={isMapModalOpen}
        onCancel={() => setIsMapModalOpen(false)}
        footer={
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-500">
              Đã chọn {selectedLocationCodes.length} điểm — click kệ để thêm/bỏ
            </span>
            <Button variant="primary" onClick={() => setIsMapModalOpen(false)}>
              Xác nhận
            </Button>
          </div>
        }
        width="90vw"
        style={{ top: 20 }}
        styles={{ body: { height: '80vh', padding: 0 } }}
        destroyOnHidden
      >
        <div className="w-full h-full">
          <WarehouseMapCanvas
            hideToolbar
            hideDrawer
            selectedLocationCodes={selectedLocationCodes}
            onNodeClick={(node: NodeInfo | null) => {
              if (!node || node.type !== 1 || !node.content) {
                if (node) message.warning('Chỉ chọn được điểm kệ (shelf node).');
                return;
              }
              const code = String(node.content);
              if (!codeToLocationId.has(code)) {
                message.warning(
                  `Mã ${code} chưa có trong DB location. Vui lòng import map trước.`,
                );
                return;
              }
              const isSelected = selectedLocationCodes.includes(code);
              toggleLocationCode(code);
              message.info(
                isSelected ? `Đã bỏ chọn: ${code}` : `Đã chọn: ${code}`,
              );
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
