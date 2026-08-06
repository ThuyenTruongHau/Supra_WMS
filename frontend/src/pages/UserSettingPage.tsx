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
import { ROLE_OPTIONS, type User } from "@/types/auth";
import Hero from "@/components/shared/Hero";
import dayjs from "dayjs";

type UserFormValues = {
  username: string;
  email: string;
  role_id: number;
  password?: string;
  password_confirm?: string;
  is_active?: boolean;
};

export default function UserSettingPage() {
  const { data: users, isLoading, error } = useUser();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();

  const [form] = Form.useForm<UserFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const handleOpenCreate = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({ role_id: ROLE_OPTIONS[0]?.id, is_active: true });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record: User) => {
    setEditingUser(record);
    form.setFieldsValue({
      username: record.username,
      email: record.email,
      role_id: record.roles?.[0]?.id ?? ROLE_OPTIONS[0]?.id,
      is_active: record.is_active,
      password: undefined,
      password_confirm: undefined,
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
            onError: (err) => {
              message.error(
                err.response?.data?.detail || "Không thể xóa người dùng",
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
      const payload: {
        email: string;
        role_ids: number[];
        is_active?: boolean;
        password?: string;
        password_confirm?: string;
      } = {
        email: values.email,
        role_ids: values.role_id ? [values.role_id] : [],
        is_active: values.is_active,
      };
      if (values.password?.trim()) {
        payload.password = values.password;
        payload.password_confirm = values.password_confirm ?? "";
      }
      updateMutation.mutate(
        { id: editingUser.id, data: payload },
        {
          onSuccess: () => {
            message.success("Cập nhật người dùng thành công!");
            setIsModalOpen(false);
            form.resetFields();
          },
          onError: (err) => {
            message.error(
              err.response?.data?.detail || "Không thể cập nhật người dùng",
            );
          },
        },
      );
    } else {
      createMutation.mutate(
        {
          username: values.username.trim(),
          email: values.email.trim(),
          password: values.password ?? "",
          password_confirm: values.password_confirm ?? "",
          role_ids: values.role_id ? [values.role_id] : [],
        },
        {
          onSuccess: () => {
            message.success("Thêm người dùng thành công!");
            setIsModalOpen(false);
            form.resetFields();
          },
          onError: (err) => {
            message.error(
              err.response?.data?.detail || "Không thể thêm người dùng mới",
            );
          },
        },
      );
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
      title: "Vai trò",
      key: "roles",
      render: (_: unknown, record: User) =>
        record.roles?.map((r) => r.name).join(", ") || "—",
    },
    {
      title: "Trạng thái",
      dataIndex: "is_active",
      key: "is_active",
      render: (active: boolean) => (active ? "Active" : "Inactive"),
    },
    {
      title: "Ngày khởi tạo",
      dataIndex: "created_at",
      key: "created_at",
      render: (val: string) =>
        val ? dayjs(val).format("DD/MM/YYYY HH:mm") : "—",
    },
    {
      title: "Thao tác",
      key: "action",
      width: 150,
      render: (_: unknown, record: User) => (
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
            onClick={handleOpenCreate}
            icon={<PlusOutlined />}
            className="!bg-brand-primary hover:!bg-stripe-primary-deep !border-none !h-10 !rounded-lg font-semibold flex items-center"
          >
            Thêm Người Dùng
          </Button>
        }
      />

      <Card className="shadow-sm border-gray-100/50 rounded-xl overflow-hidden">
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          pagination={false}
          className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      </Card>

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
              { min: 3, message: "Tối thiểu 3 ký tự" },
            ]}
          >
            <Input placeholder="Ví dụ: admin" disabled={!!editingUser} />
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
            name="role_id"
            label="Vai trò"
            rules={[{ required: true, message: "Vui lòng chọn vai trò!" }]}
          >
            <Select
              placeholder="Chọn vai trò"
              options={ROLE_OPTIONS.map((r) => ({
                value: r.id,
                label: r.name,
              }))}
            />
          </Form.Item>

          {editingUser && (
            <Form.Item name="is_active" label="Trạng thái">
              <Select
                options={[
                  { value: true, label: "Active" },
                  { value: false, label: "Inactive" },
                ]}
              />
            </Form.Item>
          )}

          <Form.Item
            name="password"
            label="Mật khẩu"
            required={!editingUser}
            rules={
              editingUser
                ? [{ min: 8, message: "Tối thiểu 8 ký tự" }]
                : [
                    { required: true, message: "Vui lòng nhập mật khẩu!" },
                    { min: 8, message: "Tối thiểu 8 ký tự" },
                  ]
            }
          >
            <Input.Password placeholder="Tối thiểu 8 ký tự" />
          </Form.Item>

          <Form.Item
            name="password_confirm"
            label="Nhập lại mật khẩu"
            required={!editingUser}
            dependencies={["password"]}
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
            <Input.Password placeholder="Nhập lại mật khẩu" />
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
