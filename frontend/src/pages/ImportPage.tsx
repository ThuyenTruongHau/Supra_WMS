import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Hero from "@/components/shared/Hero";
import { Card, Button, Table, Select, Input, message } from "@/components/ui";
import { useNavigate } from "react-router-dom";
import InboundStatusTag from "@/components/shared/InboundStatusTag";
import {
  DownloadOutlined,
  UploadOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import CreateImportModal, {
  type ImportGroupDraft,
} from "./components/CreateImportModal";
import { useGetInboundOrders } from "@/hooks/useInboundOrder";
import { useAppStore } from "@/store/useAppStore";
import type { InboundOrder } from "@/types/inboundOrder";
import { parseMasanInboundPreviewApi } from "@/api/masan";
import {
  createInboundOrderApi,
  suggestInboundAllocationApi,
} from "@/api/inboundOrder";
import { resolveInboundType } from "@/config/warehouseMode";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";
import { buildMasanInboundCreateRequest } from "@/utils/masanInboundImport";
import dayjs from "dayjs";
import { useUser } from "@/hooks/useAuth";

const PAGE_SIZE = 20;
const STATUS_FILTER_WIDTH = 180;
const SEARCH_WIDTH = 280;

const TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-base [&_.ant-table-tbody_td]:!text-base [&_.ant-table-thead_th]:!py-3 [&_.ant-table-tbody_td]:!py-3 [&_.ant-table-row]:hover:bg-slate-50/50";

export default function ImportPage() {
  const navigate = useNavigate();
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [importGroups, setImportGroups] = useState<
    ImportGroupDraft[] | undefined
  >();
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data: ordersData, isLoading, refetch } = useGetInboundOrders({
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

  const handleDownloadTemplate = () => {
    const wsData = [
      ["Nhóm", "Mã Item", "Item ID", "Unit ID", "Số lượng", "LOT", "Hạn sử dụng"],
      ["PALLET-1", "SKU001", 1, 1, 100, "120626", "2026-12-31"],
      ["PALLET-1", "SKU002", 2, 1, 50, "120526", "2026-11-30"],
      ["PALLET-2", "SKU003", 3, 1, 20, "120426", "2026-10-31"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 15 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_NhapKho.xlsx");
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedWarehouseId) {
      message.warning("Vui lòng chọn kho trước khi import");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setImporting(true);
    const messageKey = "masan-import";

    try {
      const inboundType = resolveInboundType(selectedWarehouseId);

      message.loading({ content: "Đang đọc file Excel...", key: messageKey });
      const parseResult = await parseMasanInboundPreviewApi(
        file,
        selectedWarehouseId,
        inboundType,
      );

      if (parseResult.invalid_rows > 0) {
        message.warning(
          `${parseResult.invalid_rows} dòng lỗi sẽ bỏ qua; tiếp tục với ${parseResult.valid_rows} dòng hợp lệ`,
        );
      }

      message.loading({ content: "Đang gợi ý vị trí...", key: messageKey });
      const suggestResult = await suggestInboundAllocationApi(
        parseResult.suggest_allocation,
      );

      const orderCode = `IN-${dayjs().format("YYYYMMDD-HHmmss")}`;
      const createPayload = buildMasanInboundCreateRequest(
        parseResult,
        suggestResult,
        {
          warehouseId: selectedWarehouseId,
          orderCode,
        },
      );

      message.loading({ content: "Đang tạo đơn nhập...", key: messageKey });
      const order = await createInboundOrderApi(createPayload, inboundType);

      message.success({
        content: `Đã tạo đơn ${order.order_code} với ${parseResult.valid_rows} dòng`,
        key: messageKey,
      });
      void refetch();
    } catch (err) {
      message.error({ content: getApiErrorMessage(err), key: messageKey });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const columns: ColumnsType<InboundOrder> = [
    {
      title: "Mã đơn",
      dataIndex: "order_code",
      key: "order_code",
      render: (text: string) => (
        <a
          style={{ color: "var(--color-brand-primary)" }}
          className="font-semibold hover:opacity-80"
          onClick={() => navigate(`/import/${text}`)}
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
      render: (status: string) => <InboundStatusTag status={status} size="sm" />,
    },
  ];

  const total = ordersData?.total ?? 0;

  return (
    <div className="space-y-6">
      <Hero title="Quản lý Nhập kho" list={kpiData} />

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
                { value: "initialize", label: "Khởi tạo" },
                { value: "reserved", label: "Giữ chỗ" },
                { value: "in_transit", label: "Đang luân chuyển" },
                { value: "in-progress", label: "Đang xử lý" },
                { value: "completed", label: "Hoàn thành" },
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
              onClick={handleDownloadTemplate}
            >
              Export Template
            </Button>
            <Button
              variant="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setImportGroups(undefined);
                setIsCreateOpen(true);
              }}
            >
              Tạo đơn nhập
            </Button>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={orders}
          rowKey="id"
          loading={isLoading}
          onRow={(record) => ({
            onDoubleClick: () => navigate(`/import/${record.order_code}`),
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

      <CreateImportModal
        open={isCreateOpen}
        initialGroups={importGroups}
        onCancel={() => {
          setIsCreateOpen(false);
          setImportGroups(undefined);
        }}
        onSuccess={() => {
          setIsCreateOpen(false);
          setImportGroups(undefined);
          void refetch();
        }}
      />
    </div>
  );
}
