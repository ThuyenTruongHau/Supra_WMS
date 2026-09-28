import { useEffect, useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { Card, Input, Table, cn } from "@/components/ui";
import { useSortingWaves } from "@/hooks/useSortingWave";
import { useSortingOrdersByWave } from "@/hooks/useSortingOrder";
import {
  SORTING_ORDER_STATUS_LABELS,
  flattenSortingOrdersToRows,
  type SortingOrderTableRow,
} from "@/types/sortingOrder";
import { toDisplayInteger } from "@/utils/number";

const PAGE_SIZE = 20;

type SortingOrderPanelProps = {
  zoneId: number;
};

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

function StatusTag({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-700",
    pending: "bg-yellow-100 text-yellow-700",
    sorting: "bg-info-100 text-info-700",
    completed: "bg-green-100 text-green-700",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase ${styles[status] ?? "bg-slate-100 text-slate-600"}`}
    >
      {SORTING_ORDER_STATUS_LABELS[status as keyof typeof SORTING_ORDER_STATUS_LABELS] ??
        status}
    </span>
  );
}

export default function SortingOrderPanel({ zoneId }: SortingOrderPanelProps) {
  const [selectedWaveId, setSelectedWaveId] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: waves = [], isLoading: wavesLoading } = useSortingWaves(zoneId);
  const { data: orders = [], isLoading: ordersLoading } = useSortingOrdersByWave(
    selectedWaveId,
  );

  useEffect(() => {
    if (waves.length === 0) {
      setSelectedWaveId(0);
      return;
    }
    if (!waves.some((wave) => wave.id === selectedWaveId)) {
      setSelectedWaveId(waves[0].id);
    }
  }, [waves, selectedWaveId]);

  const tableRows = useMemo(() => flattenSortingOrdersToRows(orders), [orders]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return tableRows;
    return tableRows.filter(
      (row) =>
        String(row.sorting_order_id).includes(keyword) ||
        (row.outbound_order_code ?? "").toLowerCase().includes(keyword) ||
        (row.product_sku ?? "").toLowerCase().includes(keyword) ||
        (row.product_name ?? "").toLowerCase().includes(keyword) ||
        (row.customer_name ?? "").toLowerCase().includes(keyword) ||
        (row.vehicle_number ?? "").toLowerCase().includes(keyword),
    );
  }, [search, tableRows]);

  const columns: ColumnsType<SortingOrderTableRow> = [
    {
      title: "Mã đơn chia",
      dataIndex: "sorting_order_id",
      key: "sorting_order_id",
      align: "center",
      render: (value: number) => (
        <span className="font-semibold text-brand-primary">#{value}</span>
      ),
    },
    {
      title: "Mã đơn xuất",
      dataIndex: "outbound_order_code",
      key: "outbound_order_code",
      render: (value: string | null) => value ?? "—",
    },
    {
      title: "Mã SP",
      dataIndex: "product_sku",
      key: "product_sku",
      render: (value: string | null) => value ?? "—",
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "product_name",
      key: "product_name",
      render: (value: string | null) => (
        <div className="min-w-[140px] max-w-[240px] whitespace-normal break-words text-sm">
          {value ?? "—"}
        </div>
      ),
    },
    {
      title: "Số lượng",
      key: "requested_quantity",
      align: "right",
      render: (_: unknown, record) =>
        record.requested_quantity != null
          ? `${toDisplayInteger(record.requested_quantity)} ${record.base_unit ?? ""}`.trim()
          : "—",
    },
    {
      title: "Khách hàng",
      dataIndex: "customer_name",
      key: "customer_name",
      render: (value: string | null) => value ?? "—",
    },
    {
      title: "Biển số xe",
      dataIndex: "vehicle_number",
      key: "vehicle_number",
      render: (value: string | null) => value ?? "—",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      render: (status: string) => <StatusTag status={status} />,
    },
    {
      title: "Cập nhật",
      dataIndex: "updated_at",
      key: "updated_at",
      render: (value: string) => formatDateTime(value),
    },
  ];

  if (zoneId <= 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-gray-400">
        Vui lòng chọn kho để xem đơn chia chọn
      </div>
    );
  }

  return (
    <>
      <div className="border-b border-stripe-hairline bg-panel-soft px-5 py-3">
        <div className="flex flex-wrap gap-2">
          {wavesLoading ? (
            <span className="text-sm text-gray-400">Đang tải wave...</span>
          ) : waves.length === 0 ? (
            <span className="text-sm text-gray-400">
              Chưa có wave chia chọn. Tạo wave ở tab Wave chia chọn.
            </span>
          ) : (
            waves.map((wave) => {
              const isActive = wave.id === selectedWaveId;
              return (
                <button
                  key={wave.id}
                  type="button"
                  onClick={() => {
                    setSelectedWaveId(wave.id);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-lg border px-4 py-2 text-sm font-medium transition-all",
                    isActive
                      ? "border-brand-primary bg-white text-brand-primary shadow-sm"
                      : "border-transparent bg-white/50 text-gray-500 hover:bg-white hover:text-brand-dark",
                  )}
                >
                  {wave.name}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <h3 className="text-base font-semibold text-brand-dark">
          Đơn chia chọn
        </h3>
        <Input
          allowClear
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          prefix={<SearchOutlined className="text-gray-400" />}
          placeholder="Tìm theo mã đơn, SKU, khách..."
          className="!w-72"
          disabled={selectedWaveId <= 0}
        />
      </div>

      {selectedWaveId <= 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          Chọn wave để xem đơn chia chọn
        </div>
      ) : (
        <Table<SortingOrderTableRow>
          columns={columns}
          dataSource={filteredRows}
          rowKey="rowKey"
          loading={ordersLoading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: filteredRows.length,
            showSizeChanger: false,
            showTotal: (total, range) =>
              `Hiển thị ${range[0]}–${range[1]} / ${total} dòng`,
            onChange: setPage,
          }}
          className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      )}
    </>
  );
}
