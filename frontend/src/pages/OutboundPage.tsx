import { useAppStore } from "@/store/useAppStore";
import { useNavigate } from "react-router-dom";
import type { ColumnsType } from "antd/es/table";
import { UnorderedListOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useZone } from "@/hooks/useZone";
import {
  Input,
  Button,
  Card,
  Table,
  cn,
  message,
} from "@/components/ui";
import {
  PlusOutlined,
  SearchOutlined,
  FileExcelOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useRef, useState } from "react";
import type { AxiosError } from "axios";
import type { ApiErrorResponse } from "@/types/apiError";
import type { OutboundOrderCreateInput, OutboundOrderListItem } from "@/types/outbound";
import {
  useImportOutboundOrder,
  useOutboundAnalyze,
  useOutboundOrders,
} from "@/hooks/useOutbound";
import CreateOutboundModal from "@/pages/components/CreateOutboundModal";
import * as XLSX from "xlsx";

const PAGE_SIZE = 20;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function formatKpi(value?: number) {
  if (value === undefined || value === null) return "—";
  return value.toLocaleString("vi-VN");
}

function StatusTag({ status }: { status: string }) {
  return (
    <span
      className={`ml-2 rounded px-1.5 py-0.5 text-xs font-bold uppercase ${status.toLowerCase() === "pending" ? "bg-yellow-100 text-yellow-600" : status.toLowerCase() === "shipped" ? "bg-blue-100 text-blue-600" : status.toLowerCase() === "delivered" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}
    >
      {status.toUpperCase()}
    </span>
  );
}

const columns: ColumnsType<OutboundOrderListItem> = [
  {
    title: "Mã đơn xuất",
    dataIndex: "order_code",
    key: "order_code",
    render: (text: string) => (
      <span className="font-semibold text-brand-primary">{text}</span>
    ),
  },
  {
    title: "Khách hàng",
    dataIndex: "customers",
    key: "customers",
    render: (customers: string[]) => customers?.join(", ") || "—",
  },
  {
    title: "Trạng thái",
    dataIndex: "status",
    key: "status",
    render: (status: string) => <StatusTag status={status} />,
  },
  {
    title: "Ngày yêu cầu",
    dataIndex: "requested_date",
    key: "requested_date",
    render: (date: string | null) => formatDate(date),
  },
  {
    title: "Người tạo",
    key: "creator",
    render: (_, row) => row.creator?.username ?? "—",
  },
  {
    title: "Số sản phẩm",
    dataIndex: "total_items",
    key: "total_items",
  },
  {
    title: "Tổng SL",
    dataIndex: "total_requested_quantity",
    key: "total_requested_quantity",
    render: (qty: string) => Number(qty).toLocaleString("vi-VN"),
  },
  {
    title: "Ngày cập nhật",
    dataIndex: "updated_at",
    key: "updated_at",
    render: (date: string) => formatDate(date),
  },
];

export default function OutboundPage() {
  type OutboundTab = "all" | "pending";
  const { selectedWarehouseId } = useAppStore();
  const { data: zones = [] } = useZone();
  const selectedWarehouseName =
    zones.find((z) => z.id === selectedWarehouseId)?.name ?? "Chưa chọn kho";
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<OutboundTab>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [importDraft, setImportDraft] = useState<OutboundOrderCreateInput | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportOutboundOrder();

  const { data: listData, isLoading } = useOutboundOrders({
    q: submittedQuery || undefined,
    status: activeTab === "pending" ? "draft" : undefined,
    zone_id: selectedWarehouseId || undefined,
    skip: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });

  const handleSearchSubmit = () => {
    setSubmittedQuery(searchInput.trim());
    setPage(1);
  };

  const closeCreateModal = () => {
    setIsCreateOpen(false);
    setImportDraft(null);
  };

  const openCreateModal = () => {
    setImportDraft(null);
    setIsCreateOpen(true);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    if (!selectedWarehouseId) {
      message.error("Vui lòng chọn kho trước khi nhập Excel");
      return;
    }

    try {
      message.loading("Đang đọc Excel...");
      const draft = await importMutation.mutateAsync({
        file,
        zoneId: selectedWarehouseId,
      });
      message.destroy();
      message.success(
        `Đã đọc ${draft.shipments.length} khách hàng từ Excel — kiểm tra rồi bấm Tiếp tục`,
      );
      setImportDraft(draft);
      setIsCreateOpen(true);
    } catch (err) {
      message.destroy();
      const ax = err as AxiosError<ApiErrorResponse>;
      const detail = ax.response?.data?.detail;
      message.error(
        typeof detail === "string" ? detail : "Nhập Excel thất bại",
      );
    }
  };

  const handleDownloadTemplate = () => {
    const wsData = [
      [
        "Số xe",
        "Tên khách hàng",
        "Trip",
        "NVT",
        "Mã Item",
        "Tên Item",
        "LOT",
        "Lot status",
        "Số lượng",
        "Số pallet",
      ],
      [
        "89H12345",
        "Khách A",
        "100012345",
        "Hoa Lâm",
        "01PH00073",
        "Sản phẩm mẫu",
        "120626",
        "GOOD",
        60,
        1,
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 12 },
      { wch: 18 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 30 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "List xe xuất");
    XLSX.writeFile(wb, "Template_XuatHang.xlsx");
  };

  const outboundOrders = listData?.items ?? [];
  const total = listData?.total ?? 0;

  const { data: analyze, isLoading: isAnalyzeLoading } =
    useOutboundAnalyze(selectedWarehouseId);

  const allCount = analyze?.total ?? 0;
  const pendingCount = analyze?.not_finished_order ?? 0;

  const handleTabChange = (tab: OutboundTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const kpiCards = [
    {
      label: "Tổng đơn xuất",
      value: formatKpi(analyze?.total),
      color: "#3aa6a6",
    },
    {
      label: "Tổng số lượng xuất",
      value: formatKpi(analyze?.total_quantity),
      color: "#0f3d46",
    },
    {
      label: "Đơn xuất chưa xuất xong",
      value: formatKpi(analyze?.not_finished_order),
      color: "#0f3460",
    },
    {
      label: "Đơn đã hoàn thành",
      value: formatKpi(analyze?.finised_order),
      color: "#6b7280",
    },
  ];

  const TABS = [
    {
      key: "all" as const,
      label: "Tất cả đơn xuất",
      desc: "Toàn bộ phiếu trong kho",
      icon: UnorderedListOutlined,
      count: allCount,
      activeBadge: "bg-brand-primary/15 text-brand-primary",
    },
    {
      key: "pending" as const,
      label: "Chưa xuất",
      desc: "Đang chờ xử lý",
      icon: ClockCircleOutlined,
      count: pendingCount,
      activeBadge: "bg-amber-100 text-amber-700",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-brand-dark">Đơn xuất</h2>
        <span className="text-sm text-gray-400">{selectedWarehouseName}</span>
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
        <div className="flex items-stretch gap-0 border-b border-stripe-hairline bg-[#eef2f6] p-0">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;

            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={cn(
                  "relative flex min-h-12 min-w-[200px] items-center gap-2 px-6 py-3.5 text-sm font-semibold transition-all",
                  isActive
                    ? [
                        "z-10 -mb-px",
                        "border border-stripe-hairline border-b-white",
                        "bg-white text-brand-dark",
                        "shadow-[0_1px_0_0_#fff]",
                      ]
                    : [
                        "mb-0 border border-transparent",
                        "bg-transparent text-stripe-ink-mute",
                        "hover:bg-white/40 hover:text-brand-dark",
                      ],
                )}
              >
                <Icon
                  className={cn(
                    "text-base",
                    isActive ? "text-brand-primary" : "text-stripe-ink-mute",
                  )}
                />
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
                    isActive
                      ? tab.activeBadge
                      : "bg-white/80 text-stripe-ink-mute",
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stripe-hairline bg-white px-5 py-4">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
              Danh sách đơn xuất
            </h3>
            <Input
              allowClear
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onPressEnter={handleSearchSubmit}
              onClear={() => {
                setSearchInput("");
                setSubmittedQuery("");
                setPage(1);
              }}
              prefix={<SearchOutlined className="text-gray-400" />}
              placeholder="Nhập rồi nhấn Enter để tìm..."
              className="!w-72"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm,.xls"
              className="hidden"
              onChange={handleImportExcel}
            />
            <Button
              variant="secondary"
              icon={<UploadOutlined />}
              loading={importMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              Nhập Excel
            </Button>
            <Button
              variant="secondary"
              icon={<FileExcelOutlined />}
              onClick={handleDownloadTemplate}
            >
              Xuất Excel
            </Button>
            <Button
              variant="primary"
              icon={<PlusOutlined />}
              onClick={openCreateModal}
            >
              Thêm đơn xuất
            </Button>
            <CreateOutboundModal
              open={isCreateOpen}
              importDraft={importDraft}
              onClose={closeCreateModal}
            />
          </div>
        </div>
        <Table<OutboundOrderListItem>
          columns={columns}
          dataSource={outboundOrders}
          rowKey="id"
          loading={isLoading}
          onRow={(record) => ({
            onDoubleClick: () => navigate(`/export/${record.order_code}`), // chỉnh route nếu có
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
          className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      </Card>
    </div>
  );
}
