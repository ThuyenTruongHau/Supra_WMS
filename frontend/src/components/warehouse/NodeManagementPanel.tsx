import { useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  Button,
  Form,
  Input,
  Modal,
  Space,
  Table,
  message,
} from "@/components/ui";
import {
  useCreateNode,
  useDeleteNode,
  useNodes,
  useUpdateNode,
} from "@/hooks/useNode";
import type { NodeType, WarehouseNode } from "@/types/node";

const PAGE_SIZE = 20;

type NodeFormValues = {
  node_name: string;
  qr_code: string;
};

type NodeManagementPanelProps = {
  zoneId: number;
  nodeType: NodeType;
};

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

export default function NodeManagementPanel({
  zoneId,
  nodeType,
}: NodeManagementPanelProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<WarehouseNode | null>(null);
  const [form] = Form.useForm<NodeFormValues>();

  const trimmedSearch = search.trim();
  const { data: nodes = [], isLoading } = useNodes(zoneId, nodeType, {
    search: trimmedSearch || undefined,
  });
  const createMutation = useCreateNode();
  const updateMutation = useUpdateNode();
  const deleteMutation = useDeleteNode();

  const filteredData = useMemo(() => {
    const keyword = trimmedSearch.toLowerCase();
    if (!keyword) return nodes;
    return nodes.filter(
      (item) =>
        item.node_name.toLowerCase().includes(keyword) ||
        item.qr_code.toLowerCase().includes(keyword) ||
        (item.created_by_name ?? "").toLowerCase().includes(keyword),
    );
  }, [nodes, trimmedSearch]);

  const handleOpenCreate = () => {
    setEditingNode(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (record: WarehouseNode) => {
    setEditingNode(record);
    form.setFieldsValue({
      node_name: record.node_name,
      qr_code: record.qr_code,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (values: NodeFormValues) => {
    const payload = {
      node_name: values.node_name.trim(),
      qr_code: values.qr_code.trim(),
    };

    if (editingNode) {
      updateMutation.mutate(
        {
          id: editingNode.id,
          data: payload,
          zoneId,
          nodeType,
        },
        {
          onSuccess: () => {
            message.success("Cập nhật điểm thành công");
            setIsModalOpen(false);
            form.resetFields();
            setEditingNode(null);
          },
          onError: (err) => {
            message.error(err.response?.data?.detail ?? "Không thể cập nhật điểm");
          },
        },
      );
      return;
    }

    createMutation.mutate(
      {
        zone_id: zoneId,
        type: nodeType,
        ...payload,
      },
      {
        onSuccess: () => {
          message.success("Thêm điểm thành công");
          setIsModalOpen(false);
          form.resetFields();
          setPage(1);
        },
        onError: (err) => {
          message.error(err.response?.data?.detail ?? "Không thể thêm điểm");
        },
      },
    );
  };

  const handleDelete = (record: WarehouseNode) => {
    Modal.confirm({
      title: "Xóa điểm",
      content: `Bạn có chắc muốn xóa điểm "${record.node_name}" (${record.qr_code})?`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: () =>
        deleteMutation.mutateAsync(
          {
            id: record.id,
            zoneId,
            nodeType,
          },
          {
            onSuccess: () => message.success("Đã xóa điểm"),
            onError: (err) => {
              message.error(err.response?.data?.detail ?? "Không thể xóa điểm");
            },
          },
        ),
    });
  };

  const columns: ColumnsType<WarehouseNode> = [
    {
      title: "Tên điểm",
      dataIndex: "node_name",
      key: "node_name",
    },
    {
      title: "QR code",
      dataIndex: "qr_code",
      key: "qr_code",
    },
    {
      title: "Người tạo",
      dataIndex: "created_by_name",
      key: "created_by_name",
      render: (value?: string | null) => value || "—",
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "Ngày cập nhật",
      dataIndex: "updated_at",
      key: "updated_at",
      render: (value: string) => formatDateTime(value),
    },
    {
      title: "Thao tác",
      key: "actions",
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button
            variant="edit"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
            disabled={zoneId <= 0}
          />
          <Button
            variant="dangerText"
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
            disabled={zoneId <= 0}
          />
        </Space>
      ),
    },
  ];

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stripe-hairline bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
            Danh sách điểm
          </h3>
          <Input
            allowClear
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            prefix={<SearchOutlined className="text-gray-400" />}
            placeholder="Tìm theo tên điểm, QR code..."
            className="!w-72"
            disabled={zoneId <= 0}
          />
        </div>
        <Button
          variant="primary"
          icon={<PlusOutlined />}
          onClick={handleOpenCreate}
          disabled={zoneId <= 0}
        >
          Thêm điểm
        </Button>
      </div>

      {zoneId <= 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          Vui lòng chọn kho để quản lý điểm
        </div>
      ) : (
        <Table<WarehouseNode>
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: filteredData.length,
            showSizeChanger: false,
            showTotal: (total, range) =>
              `Hiển thị ${range[0]}–${range[1]} / ${total} điểm`,
            onChange: (nextPage) => setPage(nextPage),
          }}
          className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      )}

      <Modal
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingNode(null);
          form.resetFields();
        }}
        footer={null}
        width={480}
        destroyOnHidden
        title={
          <span className="text-brand-dark font-semibold">
            {editingNode ? "Sửa điểm" : "Thêm điểm mới"}
          </span>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="mt-2"
        >
          <Form.Item
            name="node_name"
            label="Tên điểm"
            rules={[{ required: true, message: "Vui lòng nhập tên điểm" }]}
          >
            <Input placeholder="Nhập tên điểm" maxLength={255} />
          </Form.Item>
          <Form.Item
            name="qr_code"
            label="QR code"
            rules={[{ required: true, message: "Vui lòng nhập QR code" }]}
          >
            <Input placeholder="Nhập mã QR" maxLength={50} />
          </Form.Item>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              onClick={() => {
                setIsModalOpen(false);
                setEditingNode(null);
                form.resetFields();
              }}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              htmlType="submit"
              loading={isSaving}
              disabled={zoneId <= 0}
            >
              {editingNode ? "Lưu" : "Thêm"}
            </Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
