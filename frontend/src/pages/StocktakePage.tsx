import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Table, Input, Button, cn } from "@/components/ui";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useAppStore } from "@/store/useAppStore";
import { useGetStocktakeItems, useGetStocktakes } from "@/hooks/useStocktake";
import type { Stocktake, StocktakeItemStock } from "@/types/stocktake";
import InboundStatusTag from "@/components/shared/InboundStatusTag";
import CreateStocktakeModal from "@/pages/components/CreateStocktakeModal";
import dayjs from "dayjs";

const PAGE_SIZE = 20;
const SEARCH_WIDTH = 280;

const TABLE_CLASS =
  "[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-base [&_.ant-table-tbody_td]:!text-base [&_.ant-table-thead_th]:!py-3 [&_.ant-table-tbody_td]:!py-3 [&_.ant-table-row]:hover:bg-slate-50/50";

const STOCKTAKE_TABS = [
  { key: "events" as const, label: "Sự kiện kiểm kê" },
  { key: "checklist" as const, label: "Checklist kiểm kê" },
];

type StocktakeTab = (typeof STOCKTAKE_TABS)[number]["key"];

function formatDate(date?: string | null) {
  if (!date) return "—";
  return dayjs(date).format("DD/MM/YYYY HH:mm");
}

export default function StocktakePage() {
  const navigate = useNavigate();
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId);
  const warehouseId = selectedWarehouseId || 0;

  const [activeTab, setActiveTab] = useState<StocktakeTab>("events");
  const [eventPage, setEventPage] = useState(1);
  const [checklistPage, setChecklistPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    setEventPage(1);
    setChecklistPage(1);
    setSearchInput("");
    setSearchQuery("");
  }, [warehouseId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
      setEventPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const {
    data: stocktakesData,
    isLoading: isEventsLoading,
    refetch: refetchEvents,
  } = useGetStocktakes({
    warehouse_id: warehouseId,
    page: eventPage,
    page_size: PAGE_SIZE,
    q: searchQuery || undefined,
  });

  const { data: checklistData, isLoading: isChecklistLoading } =
    useGetStocktakeItems({
      warehouse_id: warehouseId,
      page: checklistPage,
      page_size: PAGE_SIZE,
    });

  const events = stocktakesData?.items ?? [];
  const checklist = checklistData?.items ?? [];

  const eventColumns: ColumnsType<Stocktake> = [
    {
      title: "Mã phiếu",
      dataIndex: "id",
      key: "id",
      width: 120,
      render: (id: number) => (
        <span className="font-semibold text-brand-primary">#{id}</span>
      ),
    },
    {
      title: "Mô tả",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
      render: (value: string | null) =>
        value || <span className="text-slate-300">-</span>,
    },
    {
      title: "Người tạo",
      dataIndex: "created_by_username",
      key: "created_by_username",
      width: 180,
      render: (name: string | null, record) =>
        name || `#${record.created_by_id}`,
    },
    {
      title: "Kho",
      dataIndex: "warehouse_name",
      key: "warehouse_name",
      width: 180,
      render: (name: string | null) => name || "—",
    },
    {
      title: "Ngày tạo",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: formatDate,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 160,
      render: (status: string | null) =>
        status ? (
          <InboundStatusTag status={status} size="sm" />
        ) : (
          "—"
        ),
    },
  ];

  const checklistColumns: ColumnsType<StocktakeItemStock> = [
    {
      title: "Phiếu",
      dataIndex: "stocktake_id",
      key: "stocktake_id",
      width: 100,
      render: (id: number) => (
        <span className="font-semibold text-brand-primary">#{id}</span>
      ),
    },
    {
      title: "Mã sản phẩm",
      dataIndex: "item_sku",
      key: "item_sku",
      width: 140,
      render: (sku: string | null) => sku || "—",
    },
    {
      title: "Sản phẩm",
      dataIndex: "item_name",
      key: "item_name",
      ellipsis: true,
      render: (name: string | null) => name || "—",
    },
    {
      title: "Vị trí",
      dataIndex: "location_code",
      key: "location_code",
      width: 180,
      render: (_: string | null, record) =>
        record.location_code || record.location_name || `#${record.location_id}`,
    },
    {
      title: "ID lô",
      dataIndex: "item_stock_id",
      key: "item_stock_id",
      width: 110,
      render: (id: number) => `#${id}`,
    },
    {
      title: "Lot",
      dataIndex: "lot_number",
      key: "lot_number",
      width: 180,
    },
    {
      title: "SL hệ thống",
      dataIndex: "desired_quantity",
      key: "desired_quantity",
      width: 130,
      align: "right",
    },
    {
      title: "SL thực tế",
      dataIndex: "actual_quantity",
      key: "actual_quantity",
      width: 130,
      align: "right",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 160,
      render: (status: string | null) =>
        status ? (
          <InboundStatusTag status={status} size="sm" />
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-brand-dark">Kiểm kê</h2>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100/50 shadow-sm">
        <div className="flex items-stretch gap-0 border-b border-stripe-hairline bg-[#eef2f6]">
          {STOCKTAKE_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "relative min-h-11 min-w-[160px] px-6 py-3 text-sm font-semibold transition-all",
                  isActive
                    ? "z-10 -mb-px border border-stripe-hairline border-b-white bg-white text-brand-primary shadow-[0_1px_0_0_#fff]"
                    : "mb-0 border border-transparent bg-transparent text-stripe-ink-mute hover:bg-white/40 hover:text-brand-dark",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <Card className="!rounded-none border-0 shadow-none overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
            <h3 className="text-base font-semibold text-brand-dark whitespace-nowrap">
              {activeTab === "events"
                ? "Danh sách sự kiện kiểm kê"
                : "Checklist kiểm kê"}
            </h3>
            {activeTab === "events" && (
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  placeholder="Tìm theo mô tả..."
                  prefix={<SearchOutlined className="text-slate-400" />}
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  allowClear
                  style={{ width: SEARCH_WIDTH }}
                />
                <Button
                  variant="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setIsCreateOpen(true)}
                  disabled={warehouseId <= 0}
                >
                  Tạo Phiếu
                </Button>
              </div>
            )}
          </div>

          {activeTab === "events" ? (
            <Table
              columns={eventColumns}
              dataSource={events}
              rowKey="id"
              loading={isEventsLoading}
              onRow={(record) => ({
                onClick: () => navigate(`/inventory/${record.id}`),
                onDoubleClick: () => navigate(`/inventory/${record.id}`),
              })}
              rowClassName={() => "cursor-pointer select-none"}
              pagination={{
                current: eventPage,
                pageSize: PAGE_SIZE,
                total: stocktakesData?.total ?? 0,
                showSizeChanger: false,
                showTotal: (t, range) =>
                  `Hiển thị ${range[0]}–${range[1]} / ${t} phiếu`,
                onChange: (nextPage) => setEventPage(nextPage),
              }}
              className={TABLE_CLASS}
              size="middle"
            />
          ) : (
            <Table
              columns={checklistColumns}
              dataSource={checklist}
              rowKey="id"
              loading={isChecklistLoading}
              pagination={{
                current: checklistPage,
                pageSize: PAGE_SIZE,
                total: checklistData?.total ?? 0,
                showSizeChanger: false,
                showTotal: (t, range) =>
                  `Hiển thị ${range[0]}–${range[1]} / ${t} dòng`,
                onChange: (nextPage) => setChecklistPage(nextPage),
              }}
              className={TABLE_CLASS}
              size="middle"
            />
          )}
        </Card>
      </div>

      <CreateStocktakeModal
        open={isCreateOpen}
        warehouseId={warehouseId}
        onCancel={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setIsCreateOpen(false);
          setEventPage(1);
          void refetchEvents();
        }}
      />
    </div>
  );
}
