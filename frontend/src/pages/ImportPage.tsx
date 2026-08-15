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
  type ImportItemDraft,
} from "./components/CreateImportModal";
import { useGetInboundOrders } from "@/hooks/useInboundOrder";
import { useAppStore } from "@/store/useAppStore";
import type { InboundOrder } from "@/types/inboundOrder";
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

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const fileData = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(fileData, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
          header: 1,
        });

        let headerRowIndex = -1;
        let groupCol = -1;
        let skuCol = -1;
        let itemIdCol = -1;
        let unitIdCol = -1;
        let qtyCol = -1;
        let lotCol = -1;
        let expiryCol = -1;

        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i] as unknown[];
          if (!row) continue;
          const find = (name: string) =>
            row.findIndex(
              (cell) =>
                typeof cell === "string" && cell.trim().toLowerCase() === name,
            );
          skuCol = find("mã item");
          if (skuCol === -1) skuCol = find("sku");
          if (skuCol !== -1 || find("item id") !== -1) {
            headerRowIndex = i;
            groupCol = find("nhóm");
            if (groupCol === -1) groupCol = find("pallet");
            itemIdCol = find("item id");
            unitIdCol = find("unit id");
            qtyCol = find("số lượng");
            lotCol = find("lot");
            expiryCol = find("hạn sử dụng");
            break;
          }
        }

        if (headerRowIndex === -1) {
          message.error('Không tìm thấy header Excel (cần cột "Mã Item" hoặc "Item ID")');
          return;
        }

        // Các dòng cùng giá trị cột "Nhóm" chia sẻ một vị trí đích.
        // Dòng không có nhóm được coi là một nhóm riêng.
        const groupsByName = new Map<string, ImportGroupDraft>();
        const parsedGroups: ImportGroupDraft[] = [];
        let itemCount = 0;

        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i] as unknown[];
          if (!row) continue;
          const itemId =
            itemIdCol >= 0 && row[itemIdCol] != null
              ? Number(row[itemIdCol])
              : undefined;
          const sku =
            skuCol >= 0 && row[skuCol] != null
              ? String(row[skuCol]).trim()
              : undefined;
          if (!itemId && !sku) continue;

          const item: ImportItemDraft = {
            key: `import-item-${i}`,
            sku,
            item_id: itemId && !Number.isNaN(itemId) ? itemId : undefined,
            quantity: qtyCol >= 0 ? Number(row[qtyCol]) || 0 : 0,
            unit_id:
              unitIdCol >= 0 && row[unitIdCol] != null
                ? Number(row[unitIdCol])
                : undefined,
            lot_number:
              lotCol >= 0 && row[lotCol] != null
                ? String(row[lotCol]).trim()
                : undefined,
            expiry_date:
              expiryCol >= 0 && row[expiryCol] != null
                ? String(row[expiryCol]).trim()
                : undefined,
          };
          itemCount += 1;

          const groupName =
            groupCol >= 0 && row[groupCol] != null
              ? String(row[groupCol]).trim()
              : "";

          if (groupName) {
            const existing = groupsByName.get(groupName);
            if (existing) {
              existing.items.push(item);
              continue;
            }
            const group: ImportGroupDraft = {
              key: `import-group-${groupName}-${i}`,
              items: [item],
            };
            groupsByName.set(groupName, group);
            parsedGroups.push(group);
          } else {
            parsedGroups.push({
              key: `import-group-${i}`,
              items: [item],
            });
          }
        }

        if (parsedGroups.length === 0) {
          message.warning("Không có dòng hợp lệ trong Excel");
          return;
        }

        setImportGroups(parsedGroups);
        setIsCreateOpen(true);
        message.success(
          `Đã đọc ${itemCount} SKU trong ${parsedGroups.length} nhóm từ Excel`,
        );
      } catch {
        message.error("Lỗi khi đọc file Excel");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const columns: ColumnsType<InboundOrder> = [
    {
      title: "Mã phiếu",
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
