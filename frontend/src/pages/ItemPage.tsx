import { useRef, useState } from "react";
import {
  PlusOutlined,
  SearchOutlined,
  FileExcelOutlined,
  UploadOutlined,
  MinusCircleOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Item, CreateItemInput, ItemImportJobStatus } from "@/types/item";
import {
  Card,
  Table,
  Button,
  Input,
  Modal,
  Form,
  Space,
  message,
} from "@/components/ui";
import { Progress } from "antd";
import {
  useItems,
  useCreateItem,
  useItemAnalyze,
  useImportItems,
} from "@/hooks/useItem";
import { useAppStore } from "@/store/useAppStore";
import { useNavigate } from "react-router-dom";
import { useZone } from "@/hooks/useZone";
import { getItemsForExport, downloadItemExcel } from "@/utils/itemExport";
import dayjs from "dayjs";

const PAGE_SIZE = 20;
const ITEM_FETCH_LIMIT = 1000;

type CreateItemFormValues = Omit<CreateItemInput, "details"> & {
  detailEntries?: { key: string; value: string }[];
};

function formatDate(date?: string | null) {
  if (!date) return "—";
  return dayjs(date).format("DD/MM/YYYY HH:mm");
}

function formatKpi(value?: number | string) {
  if (value === undefined || value === null) return "—";
  return Number(value).toLocaleString("vi-VN");
}

export default function ItemPage() {
  const { selectedWarehouseId } = useAppStore();
  const { data: zones = [] } = useZone();
  const selectedWarehouseName =
    zones.find((z) => z.id === selectedWarehouseId)?.name ?? "Chưa chọn kho";
  const [searchInput, setSearchInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateItemFormValues>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJob, setImportJob] = useState<ItemImportJobStatus | null>(null);

  const handleSearch = () => {
    setSubmittedQuery(searchInput.trim());
    setPage(1);
  };

  const { data, isLoading: isItemsLoading } = useItems({
    warehouse_id: selectedWarehouseId,
    q: submittedQuery || undefined,
    page_size: ITEM_FETCH_LIMIT,
  });
  const itemList = data?.items ?? [];
  const createMutation = useCreateItem();
  const importMutation = useImportItems();
  const { data: analyze, isLoading: isAnalyzeLoading } =
    useItemAnalyze(selectedWarehouseId);

  const handleOpenCreate = () => {
    form.resetFields();
    setIsCreateOpen(true);
  };

  const handleCloseCreate = () => {
    setIsCreateOpen(false);
    form.resetFields();
  };

  const kpiCards = [
    {
      label: "Tổng sản phẩm",
      value: formatKpi(analyze?.total_items),
      color: "#3aa6a6",
    },
    {
      label: "Tổng số lượng",
      value: formatKpi(analyze?.total_quantity),
      color: "#0f3d46",
    },
    {
      label: "Cảnh báo gần hết hạn",
      value: formatKpi(analyze?.total_nearly_outdated),
      color: "#0f3460",
    },
    {
      label: "Số lượng còn ít",
      value: formatKpi(analyze?.total_low_stock),
      color: "#6b7280",
    },
  ];

  const handleCreate = (values: CreateItemFormValues) => {
    const details = Object.fromEntries(
      (values.detailEntries ?? [])
        .map(({ key, value }) => [key.trim(), value.trim()])
        .filter(([key]) => key.length > 0),
    );
    createMutation.mutate(
      {
        sku: values.sku.trim(),
        name: values.name.trim(),
        description: values.description?.trim() ?? "",
        base_unit: values.base_unit?.trim() ?? "thùng",
        warehouse_id: selectedWarehouseId,
        supplier: values.supplier.trim(),
        details,
      },
      {
        onSuccess: () => {
          message.success("Thêm sản phẩm thành công!");
          handleCloseCreate();
          setPage(1);
        },
        onError: (err) => {
          message.error(
            err.response?.data?.detail ?? "Không thể thêm sản phẩm",
          );
        },
      },
    );
  };

  const handleExportExcel = () => {
    const exportList = getItemsForExport(itemList);
    if (exportList.length === 0) {
      message.warning("Không có sản phẩm để xuất!");
      return;
    }
    downloadItemExcel(exportList, selectedWarehouseName);
    message.success(`Đã tải ${exportList.length} sản phẩm`);
  };

  const handleImportClick = () => {
    if (!selectedWarehouseId) {
      message.error("Vui lòng chọn kho trước khi import.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!selectedWarehouseId) {
      message.error("Vui lòng chọn kho trước khi import.");
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xlsm")) {
      message.error("Chỉ hỗ trợ file Excel .xlsx/.xlsm");
      return;
    }

    setImportJob(null);
    setIsImportModalOpen(true);
    importMutation.mutate(
      {
        file,
        warehouseId: selectedWarehouseId,
        onProgress: (job) => setImportJob(job),
      },
      {
        onSuccess: (job) => {
          setImportJob(job);
          if (job.status === "completed") {
            message.success(job.message || `Đã import ${job.created} sản phẩm`);
            setPage(1);
          } else {
            message.error(job.message || "Import thất bại");
          }
        },
        onError: (err) => {
          message.error(
            err.response?.data?.detail ?? "Không thể upload file import",
          );
          setIsImportModalOpen(false);
        },
      },
    );
  };

  const importPercent = (() => {
    if (!importJob) return importMutation.isPending ? 5 : 0;
    if (importJob.status === "completed" || importJob.status === "failed") {
      return 100;
    }
    if (importJob.total > 0) {
      return Math.min(
        99,
        Math.round((importJob.processed / importJob.total) * 100),
      );
    }
    return importJob.status === "running" ? 30 : 10;
  })();

  const columns: ColumnsType<Item> = [
    {
      title: "Mã SKU",
      dataIndex: "sku",
      key: "sku",
      sorter: (a, b) => a.sku.localeCompare(b.sku),
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "name",
      key: "name",
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: "Nhà cung cấp",
      dataIndex: "supplier",
      key: "supplier",
      sorter: (a, b) => a.supplier.localeCompare(b.supplier),
    },
    {
      title: "Mô tả",
      dataIndex: "description",
      key: "description",
      sorter: (a, b) => (a.description ?? '').localeCompare(b.description ?? ''),
    },
    {
      title: "Số lượng",
      dataIndex: "quantity",
      key: "quantity",
      sorter: (a, b) => a.quantity - b.quantity,
      render: (qty: number) => (
        <span
          className={
            qty === 0 || qty < 10
              ? "font-semibold text-orange-500"
              : "font-semibold text-brand-dark"
          }
        >
          {qty}
        </span>
      ),
    },
    {
      title: "Đơn vị",
      dataIndex: "base_unit",
      key: "base_unit",
      sorter: (a, b) => a.base_unit.localeCompare(b.base_unit),
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      sorter: (a, b) => a.created_at.localeCompare(b.created_at),
      render: (date: string) => formatDate(date),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-brand-dark">Sản phẩm</h2>
        <span className="text-sm text-gray-400">
          {selectedWarehouseName ?? "Chưa chọn kho"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiCards.map((card) => (
          <Card key={card.label}>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p
              className="mt-2 text-3xl font-bold"
              style={{ color: card.color }}
            >
              {isAnalyzeLoading ? "..." : card.value}
            </p>
          </Card>
        ))}
      </div>

      <Card className="shadow-sm border-gray-100/50 rounded-xl overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
              Danh sách sản phẩm
            </h3>
            <div className="flex items-center gap-2">
              <Input
                allowClear
                prefix={<SearchOutlined className="text-gray-400" />}
                placeholder="Tìm theo tên, SKU, mã..."
                value={searchInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchInput(value);
                  if (!value.trim()) {
                    setSubmittedQuery("");
                    setPage(1);
                  }
                }}
                onPressEnter={handleSearch}
                className="!w-72"
              />
              <Button
                variant="secondary"
                icon={<SearchOutlined />}
                onClick={handleSearch}
                loading={isItemsLoading}
              >
                Tìm
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={handleImportFileChange}
            />
            <Button
              variant="secondary"
              icon={<UploadOutlined />}
              onClick={handleImportClick}
              loading={importMutation.isPending}
            >
              Import Excel
            </Button>
            <Button
              variant="secondary"
              icon={<FileExcelOutlined />}
              onClick={handleExportExcel}
            >
              Xuất Excel
            </Button>
            <Button
              variant="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreate}
            >
              Thêm sản phẩm
            </Button>
          </div>
        </div>
        <Table<Item>
          columns={columns}
          dataSource={itemList}
          loading={isItemsLoading}
          rowKey="id"
          onRow={(record) => ({
            onDoubleClick: () => navigate(`/items/${record.id}`),
          })}
          rowClassName={() => "cursor-pointer select-none"}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: itemList.length,
            showSizeChanger: false,
            showTotal: (total, range) =>
              `Hiển thị ${range[0]}–${range[1]} / ${total} sản phẩm`,
            onChange: (nextPage) => setPage(nextPage),
          }}
          className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      </Card>
      <Modal
        open={isCreateOpen}
        onCancel={handleCloseCreate}
        footer={null}
        width={640}
        destroyOnHidden
        title={
          <span className="text-brand-dark font-semibold">
            Thêm sản phẩm mới
          </span>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          className="mt-2"
          initialValues={{
            quantity: 0,
          }}
        >
          <Form.Item
            name="sku"
            label="SKU"
            rules={[{ required: true, message: "Vui lòng nhập SKU!" }]}
          >
            <Input placeholder="Ví dụ: SKU-019" />
          </Form.Item>

          <Form.Item
            name="name"
            label="Tên sản phẩm"
            rules={[{ required: true, message: "Vui lòng nhập tên!" }]}
          >
            <Input placeholder="Ví dụ: Thép cuộn" />
          </Form.Item>

          <Form.Item
            name="supplier"
            label="Nhà cung cấp"
            rules={[{ required: true, message: "Vui lòng nhập NCC!" }]}
          >
            <Input placeholder="Ví dụ: VCC Steel" />
          </Form.Item>

          <Form.Item
            name="base_unit"
            label="Đơn vị"
            rules={[{ required: true, message: "Vui lòng nhập đơn vị!" }]}
          >
            <Input placeholder="Ví dụ: thùng" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Mô tả"
            rules={[{ required: true, message: "Vui lòng nhập mô tả!" }]}
          >
            <Input placeholder="Ví dụ: Thép cuộn" />
          </Form.Item>

          <Form.Item label="Thông tin bổ sung (tùy chọn)">
            <Form.List name="detailEntries">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <div
                      key={key}
                      className="mb-2 flex w-full items-start gap-2"
                    >
                      <Form.Item
                        {...restField}
                        name={[name, "key"]}
                        rules={[{ required: true, message: "Nhập tên trường" }]}
                        className="!mb-0 flex-1"
                      >
                        <Input placeholder="Tên (vd: color)" />
                      </Form.Item>
                      <Form.Item
                        {...restField}
                        name={[name, "value"]}
                        rules={[{ required: true, message: "Nhập giá trị" }]}
                        className="!mb-0 flex-1"
                      >
                        <Input placeholder="Giá trị (vd: đỏ)" />
                      </Form.Item>
                      <MinusCircleOutlined
                        className="text-red-400 cursor-pointer"
                        onClick={() => remove(name)}
                      />
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    onClick={() => add({ key: "", value: "" })}
                    icon={<PlusOutlined />}
                    block
                  >
                    Thêm trường
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item className="mb-0 flex justify-end">
            <Space>
              <Button variant="secondary" onClick={handleCloseCreate}>
                Hủy
              </Button>
              <Button htmlType="submit" variant="primary">
                Lưu lại
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={isImportModalOpen}
        onCancel={() => {
          if (importMutation.isPending) return;
          setIsImportModalOpen(false);
        }}
        footer={
          <Button
            variant="primary"
            disabled={importMutation.isPending}
            onClick={() => setIsImportModalOpen(false)}
          >
            Đóng
          </Button>
        }
        closable={!importMutation.isPending}
        maskClosable={!importMutation.isPending}
        title={
          <span className="text-brand-dark font-semibold">
            Import sản phẩm từ Excel
          </span>
        }
      >
        <div className="space-y-3 py-2">
          <p className="text-sm text-slate-600">
            Warehouse: <strong>{selectedWarehouseName}</strong>
            {importJob?.filename ? (
              <>
                {" "}
                · File: <strong>{importJob.filename}</strong>
              </>
            ) : null}
          </p>
          <Progress
            percent={importPercent}
            status={
              importJob?.status === "failed"
                ? "exception"
                : importJob?.status === "completed"
                  ? "success"
                  : "active"
            }
          />
          <p className="text-sm text-slate-700">
            {importJob?.message ||
              (importMutation.isPending
                ? "Đang upload và xử lý file…"
                : "Chờ bắt đầu…")}
          </p>
          {importJob && (
            <p className="text-xs text-slate-500">
              Status: {importJob.status} · processed {importJob.processed}
              {importJob.total ? ` / ${importJob.total}` : ""} · created{" "}
              {importJob.created}
              {importJob.error_count
                ? ` · errors ${importJob.error_count}`
                : ""}
            </p>
          )}
          {importJob?.errors?.length ? (
            <div className="max-h-48 overflow-auto rounded border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
              {importJob.errors.slice(0, 20).map((err, idx) => (
                <div key={`${err.row}-${err.sku}-${idx}`} className="mb-1">
                  Dòng {err.row}
                  {err.sku ? ` (${err.sku})` : ""}: {err.message}
                </div>
              ))}
              {importJob.error_count > importJob.errors.length && (
                <div className="mt-2 text-slate-500">
                  … và {importJob.error_count - importJob.errors.length} lỗi
                  khác
                </div>
              )}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
