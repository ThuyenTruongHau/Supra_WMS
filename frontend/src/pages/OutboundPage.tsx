import { useEffect, useMemo, useRef, useState } from "react";
import Hero from "@/components/shared/Hero";
import { Card, Button, Table, Select, Input, message } from "@/components/ui";
import { useNavigate } from "react-router-dom";
import OutboundStatusTag from "@/components/shared/OutboundStatusTag";
import {
  DownloadOutlined,
  UploadOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import CreateOutboundModal from "./components/CreateOutboundModal";
import { useGetOutboundOrders } from "@/hooks/useOutbound";
import { useAppStore } from "@/store/useAppStore";
import type { OutboundOrder } from "@/types/outbound";
import { parseMasanOutboundPreviewApi } from "@/api/masanOutbound";
import { createOutboundOrderApi } from "@/api/outboundOrder";
import { resolveOutboundType } from "@/config/warehouseMode";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";
import { buildMasanOutboundCreateRequest } from "@/utils/masanOutboundImport";
import dayjs from "dayjs";
import { useUser } from "@/hooks/useAuth";

const PAGE_SIZE = 20;
const STATUS_FILTER_WIDTH = 180;
const SEARCH_WIDTH = 280;

const TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-base [&_.ant-table-tbody_td]:!text-base [&_.ant-table-thead_th]:!py-3 [&_.ant-table-tbody_td]:!py-3 [&_.ant-table-row]:hover:bg-slate-50/50 [&_.ant-table-cell]:!text-center";

export default function OutboundPage() {
  const navigate = useNavigate();
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data: ordersData, isLoading, refetch } = useGetOutboundOrders({
    warehouse_id: selectedWarehouseId || 0,
    page,
    page_size: PAGE_SIZE,
    q: searchQuery || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });
  const orders = ordersData?.items ?? [];

  const { data: users = [] } = useUser();

  const userNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of users) map.set(u.id, u.username);
    return map;
  }, [users]);

  const summary = ordersData?.summary;

  const kpiData = [
    {
      label: "Tổng đơn",
      value: String(summary?.total ?? 0),
      color: "var(--color-brand-dark)",
    },
    {
      label: "Khởi tạo",
      value: String(summary?.initialize ?? 0),
      color: "var(--color-stripe-ink-mute)",
    },
    {
      label: "Đang xử lý",
      value: String(summary?.in_progress ?? 0),
      color: "var(--color-stripe-lemon)",
    },
    {
      label: "Hoàn thành",
      value: String(summary?.completed ?? 0),
      color: "var(--color-brand-primary)",
    },
  ];

  const columns: ColumnsType<OutboundOrder> = [
    {
      title: "Mã đơn",
      dataIndex: "order_code",
      key: "order_code",
      render: (text: string, record: OutboundOrder) => (
        <a
          style={{ color: "var(--color-brand-primary)" }}
          className="font-semibold hover:opacity-80"
          onClick={() => navigate(`/export/${record.id}`)}
        >
          {text}
        </a>
      ),
    },
    {
      title: "Người tạo",
      dataIndex: "created_by_id",
      key: "created_by_id",
      render: (id: number) => userNameById.get(id) ?? `#${id}`,
    },
    {
      title: "Ghi chú",
      dataIndex: "note",
      key: "note",
      ellipsis: true,
      render: (note: string | null) =>
        note || <span className="text-slate-300">-</span>,
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      render: (text: string | null) =>
        text ? dayjs(text).format("DD/MM/YYYY HH:mm") : "-",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => (
        <OutboundStatusTag status={status} size="sm" />
      ),
    },
  ];

  const total = ordersData?.total ?? 0;

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedWarehouseId) {
      message.warning("Vui lòng chọn kho trước khi import");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImporting(true);
    const messageKey = "masan-outbound-import";

    try {
      const outboundType = resolveOutboundType(selectedWarehouseId);

      message.loading({ content: "Đang đọc file Excel...", key: messageKey });
      const parseResult = await parseMasanOutboundPreviewApi(
        file,
        selectedWarehouseId,
        outboundType,
      );

      if (parseResult.invalid_rows > 0) {
        message.warning(
          `${parseResult.invalid_rows} dòng lỗi sẽ bỏ qua; tiếp tục với ${parseResult.valid_rows} dòng hợp lệ`,
        );
      }

      const orderCode = `OUT-${dayjs().format("YYYYMMDD-HHmmss")}`;
      const createPayload = buildMasanOutboundCreateRequest(parseResult, {
        warehouseId: selectedWarehouseId,
        orderCode,
      });

      message.loading({ content: "Đang tạo đơn xuất...", key: messageKey });
      const order = await createOutboundOrderApi(createPayload, outboundType);

      message.success({
        content: `Đã tạo đơn ${order.order_code} với ${parseResult.valid_rows} dòng`,
        key: messageKey,
      });
      void refetch();
      navigate(`/export/${order.id}`);
    } catch (err) {
      message.error({ content: getApiErrorMessage(err), key: messageKey });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <Hero title="Quản lý Xuất kho" list={kpiData} />

      <Card>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              placeholder="Trạng thái"
              className="shrink-0"
              style={{
                width: STATUS_FILTER_WIDTH,
                minWidth: STATUS_FILTER_WIDTH,
                maxWidth: STATUS_FILTER_WIDTH,
              }}
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val as string);
                setPage(1);
              }}
              options={[
                { value: "all", label: "Tất cả trạng thái" },
                { value: "initialize", label: "initialize" },
                { value: "in_progress", label: "in_progress" },
                { value: "completed", label: "completed" },
              ]}
            />
            <Input
              allowClear
              placeholder="Tìm mã đơn, người tạo..."
              prefix={<SearchOutlined className="text-slate-400" />}
              className="shrink-0 !h-11"
              style={{
                width: SEARCH_WIDTH,
                minWidth: SEARCH_WIDTH,
                maxWidth: SEARCH_WIDTH,
                height: 44,
              }}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.xls"
              ref={fileInputRef}
              className="hidden"
              onChange={handleImportExcel}
            />
            <Button
              variant="secondary"
              icon={<UploadOutlined />}
              loading={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              Import Excel
            </Button>
            <Button
              variant="secondary"
              icon={<DownloadOutlined />}
              onClick={() => message.info("Tính năng đang phát triển")}
            >
              Export Template
            </Button>
            <Button
              variant="primary"
              icon={<PlusOutlined />}
              onClick={() => setIsCreateOpen(true)}
            >
              Tạo đơn xuất
            </Button>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={isLoading}
          onRow={(record) => ({
            onDoubleClick: () => navigate(`/export/${record.id}`),
          })}
          rowClassName={() => "cursor-pointer select-none"}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            showTotal: (t, range) =>
              `Hiển thị ${range[0]}–${range[1]} / ${t} đơn`,
            onChange: (nextPage) => setPage(nextPage),
          }}
          className={TABLE_CLASS}
          size="middle"
        />
      </Card>

      <CreateOutboundModal
        open={isCreateOpen}
        onCancel={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setIsCreateOpen(false);
          void refetch();
        }}
      />
    </div>
  );
}
