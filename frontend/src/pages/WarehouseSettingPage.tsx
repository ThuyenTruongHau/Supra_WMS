import { useState } from 'react';
import { Card, Table, Button, Modal, Space, Form, Input, message } from '@/components/ui';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useZone, useCreateZone, useUpdateZone, useDeleteZone } from '@/hooks/useZone';
import { Zone } from '@/types/zone';
import Hero from '@/components/shared/Hero';

export default function WarehouseSettingPage() {
    const { data: zones, isLoading, error } = useZone();
    const createMutation = useCreateZone();
    const updateMutation = useUpdateZone();
    const deleteMutation = useDeleteZone();

    const [form] = Form.useForm();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingZone, setEditingZone] = useState<Zone | null>(null);

    const handleOpenCreate = () => {
        setEditingZone(null);
        form.resetFields();
        setIsModalOpen(true);
    };

    const handleOpenEdit = (record: Zone) => {
        setEditingZone(record);
        form.setFieldsValue({
            code: record.code,
            name: record.name,
            description: record.description,
        });
        setIsModalOpen(true);
    };

    const handleDelete = (id: number) => {
        Modal.confirm({
            title: 'Xác nhận xóa',
            content: 'Bạn có chắc chắn muốn xóa kho hàng này không?',
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: () => {
                return new Promise((resolve) => {
                    deleteMutation.mutate(id, {
                        onSuccess: () => {
                            message.success('Xóa kho hàng thành công!');
                            resolve(null);
                        },
                        onError: (error) => {
                            message.error(error.response?.data?.detail || 'Không thể xóa kho hàng');
                            resolve(null);
                        }
                    });
                });
            }
        });
    };

    const handleSubmit = (values: Omit<Zone, 'id'>) => {
        if (editingZone) {
            updateMutation.mutate(
                { id: editingZone.id, data: values },
                {
                    onSuccess: () => {
                        message.success('Cập nhật kho hàng thành công!');
                        setIsModalOpen(false);
                        form.resetFields();
                    },
                    onError: (error) => {
                        message.error(error.response?.data?.detail || 'Không thể cập nhật kho hàng');
                    }
                }
            );
        } else {
            createMutation.mutate(values, {
                onSuccess: () => {
                    message.success('Thêm kho hàng thành công!');
                    setIsModalOpen(false);
                    form.resetFields();
                },
                onError: (error) => {
                    message.error(error.response?.data?.detail || 'Không thể thêm kho hàng mới');
                }
            });
        }
    };

    const columns = [
        {
            title: 'Mã Kho',
            dataIndex: 'code',
            key: 'code',
            render: (text: string) => <span className="font-semibold text-brand-primary">{text}</span>,
        },
        {
            title: 'Tên Kho',
            dataIndex: 'name',
            key: 'name',
            className: 'font-medium text-slate-700',
        },
        {
            title: 'Mô tả',
            dataIndex: 'description',
            key: 'description',
            className: 'text-slate-500',
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 150,
            render: (_: any, record: Zone) => (
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

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <span className="text-brand-primary/70 font-medium">Đang tải danh sách kho...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl">
                Không thể kết nối đến máy chủ. Vui lòng tải lại trang!
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Hero
                title="Quản lý Kho Hàng"
                extra={
                    <Button
                        // type="primary"
                        onClick={handleOpenCreate}
                        icon={<PlusOutlined />}
                        className="!bg-brand-primary hover:!bg-stripe-primary-deep !border-none !h-10 !rounded-lg font-semibold flex items-center"
                    >
                        Thêm Kho Mới
                    </Button>
                }
            />

            {/* Bảng danh sách kho */}
            <Card className="shadow-sm border-gray-100/50 rounded-xl overflow-hidden">
                <Table
                    columns={columns}
                    dataSource={zones}
                    rowKey="id"
                    pagination={false}
                    className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
                />
            </Card>

            {/* Modal Thêm / Sửa kho */}
            <Modal
                title={editingZone ? "Cập nhật Kho Hàng" : "Thêm Kho Mới"}
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSubmit}
                    className="mt-4"
                >
                    <Form.Item
                        name="code"
                        label="Mã Kho"
                        rules={[{ required: true, message: 'Vui lòng nhập mã kho!' }]}
                    >
                        <Input placeholder="Ví dụ: KHO_A" disabled={!!editingZone} />
                    </Form.Item>

                    <Form.Item
                        name="name"
                        label="Tên Kho"
                        rules={[{ required: true, message: 'Vui lòng nhập tên kho!' }]}
                    >
                        <Input placeholder="Ví dụ: Kho tổng miền Bắc" />
                    </Form.Item>

                    <Form.Item
                        name="description"
                        label="Mô tả"
                    >
                        <Input.TextArea rows={3} placeholder="Mô tả chi tiết về kho hàng" />
                    </Form.Item>

                    <Form.Item className="mb-0 flex justify-end">
                        <Space>
                            <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
                            <Button
                                // type="primary"
                                htmlType="submit"
                                loading={createMutation.isPending || updateMutation.isPending}
                                className="!bg-brand-primary hover:!bg-stripe-primary-deep !border-none"
                            >
                                {editingZone ? "Cập nhật" : "Lưu lại"}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}

