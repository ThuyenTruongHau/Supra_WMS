import { useState } from "react";
import {
  Card,
  Table,
  Button,
  Modal,
  Space,
  Form,
  Input,
  message,
  Select,
} from "@/components/ui";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import {
  useUser,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@/hooks/useAuth";
import { User } from "@/types/auth";
import Hero from "@/components/shared/Hero";

type UserFormValues = {
  username: string;
  email: string;
  full_name: string;
  role: string;
  password?: string;
  password_reenter?: string;
};

export default function WarehouseSettingPage() {
  const { data: users, isLoading, error } = useUser();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const [form] = Form.useForm();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const handleOpenCreate = () => {
    setEditingUser(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record: User) => {
    setEditingUser(record);
    form.setFieldsValue({
      username: record.username,
      email: record.email,
      full_name: record.full_name,
      role: record.role,
      password: undefined,
      password_reenter: undefined,
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: "Xác nhận xóa",
      content: "Bạn có chắc chắn muốn xóa người dùng này không?",
      centered: true,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: () => {
        return new Promise((resolve) => {
          deleteMutation.mutate(id, {
            onSuccess: () => {
              message.success("Xóa người dùng thành công!");
              resolve(null);
            },
            onError: (error) => {
              message.error(
                error.response?.data?.detail || "Không thể xóa người dùng",
              );
              resolve(null);
            },
          });
        });
      },
    });
  };

  const handleSubmit = (values: UserFormValues) => {
    if (editingUser) {
      const { password, password_reenter, ...rest } = values;
      const payload: Record<string, string> = { ...rest };
      if (password?.trim()) {
        payload.password = password;
        payload.password_reenter = password_reenter ?? "";
      }
      updateMutation.mutate(
        { id: editingUser.id, data: payload as Omit<User, "id"> },
        {
          onSuccess: () => {
            message.success("Cập nhật người dùng thành công!");
            setIsModalOpen(false);
            form.resetFields();
          },
          onError: (error) => {
            message.error(
              error.response?.data?.detail || "Không thể cập nhật người dùng",
            );
          },
        },
      );
    } else {
      createMutation.mutate(values as Omit<User, "id">, {
        onSuccess: () => {
          message.success("Thêm người dùng thành công!");
          setIsModalOpen(false);
          form.resetFields();
        },
        onError: (error) => {
          message.error(
            error.response?.data?.detail || "Không thể thêm người dùng mới",
          );
        },
      });
    }
  };

  const columns = [
    {
      title: "Tên đăng nhập",
      dataIndex: "username",
      key: "username",
      render: (text: string) => (
        <span className="font-semibold text-brand-primary">{text}</span>
      ),
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
      className: "font-medium text-slate-700",
    },
    {
      title: "Họ và tên",
      dataIndex: "full_name",
      key: "full_name",
      className: "text-slate-500",
    },
    {
      title: "Vai trò",
      dataIndex: "role",
      key: "role",
      className: "text-slate-500",
    },
    {
      title: "Ngày khởi tạo",
      dataIndex: "created_at",
      key: "created_at",
      className: "text-slate-500",
    },
    {
      title: "Thao tác",
      key: "action",
      width: 150,
      render: (_: any, record: User) => (
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
        <span className="text-brand-primary/70 font-medium">
          Đang tải danh sách người dùng...
        </span>
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
        title="Quản lý Người dùng"
        extra={
          <Button
            // type="primary"
            onClick={handleOpenCreate}
            icon={<PlusOutlined />}
            className="!bg-brand-primary hover:!bg-stripe-primary-deep !border-none !h-10 !rounded-lg font-semibold flex items-center"
          >
            Thêm Người Dùng
          </Button>
        }
      />

      {/* Bảng danh sách kho */}
      <Card className="shadow-sm border-gray-100/50 rounded-xl overflow-hidden">
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          pagination={false}
          className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      </Card>

      {/* Modal Thêm / Sửa kho */}
      <Modal
        title={editingUser ? "Cập nhật Người dùng" : "Thêm Người dùng Mới"}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-4"
        >
          <Form.Item
            name="username"
            label="Tên đăng nhập"
            rules={[
              { required: true, message: "Vui lòng nhập tên đăng nhập!" },
            ]}
          >
            <Input placeholder="Ví dụ: admin" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: "Vui lòng nhập email!" },
              { type: "email", message: "Email không hợp lệ!" },
            ]}
          >
            <Input placeholder="Ví dụ: example@example.com" />
          </Form.Item>

          <Form.Item
            name="full_name"
            label="Họ và tên"
            rules={[{ required: true, message: "Vui lòng nhập họ và tên!" }]}
          >
            <Input placeholder="Ví dụ: Nguyễn Văn A" />
          </Form.Item>

          <Form.Item
            name="role"
            label="Vai trò"
            rules={[{ required: true, message: "Vui lòng chọn vai trò!" }]}
          >
            <Select placeholder="Chọn vai trò">
              <Select.Option value="admin">Admin</Select.Option>
              <Select.Option value="raw_material_operator">
                Nhân viên kho nguyên liệu
              </Select.Option>
              <Select.Option value="finished_product_operator">
                Nhân viên kho thành phẩm
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="password"
            label="Mật khẩu"
            required={!editingUser}
            rules={
              editingUser
                ? [] // optional khi sửa
                : [{ required: true, message: "Vui lòng nhập mật khẩu!" }]
            }
          >
            <Input.Password type="password" placeholder="Ví dụ: 123456" />
          </Form.Item>

          <Form.Item
            name="password_reenter"
            label="Nhập lại mật khẩu"
            required={!editingUser}
            rules={
              editingUser
                ? [
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        const password = getFieldValue("password");
                        if (!password) return Promise.resolve();
                        if (!value) {
                          return Promise.reject(
                            new Error("Vui lòng nhập lại mật khẩu!"),
                          );
                        }
                        if (password === value) return Promise.resolve();
                        return Promise.reject(
                          new Error("Mật khẩu không khớp!"),
                        );
                      },
                    }),
                  ]
                : [
                    { required: true, message: "Vui lòng nhập lại mật khẩu!" },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue("password") === value) {
                          return Promise.resolve();
                        }
                        return Promise.reject(
                          new Error("Mật khẩu không khớp!"),
                        );
                      },
                    }),
                  ]
            }
          >
            <Input.Password type="password" placeholder="Ví dụ: 123456" />
          </Form.Item>

          <Form.Item className="mb-0 flex justify-end">
            <Space>
              <Button onClick={() => setIsModalOpen(false)}>Hủy</Button>
              <Button
                htmlType="submit"
                loading={createMutation.isPending || updateMutation.isPending}
                className="!bg-brand-primary hover:!bg-stripe-primary-deep !border-none"
              >
                {editingUser ? "Cập nhật" : "Lưu lại"}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
