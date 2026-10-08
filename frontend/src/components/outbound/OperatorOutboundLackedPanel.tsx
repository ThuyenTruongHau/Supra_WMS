import { useMemo } from "react";
import type { ColumnsType } from "antd/es/table";
import { Loading, Table } from "@/components/ui";
import { useOperatorRecentLackedOrders } from "@/hooks/useOutbound";
import type { LackedDetail } from "@/types/outbound";
import { toDisplayInteger } from "@/utils/number";

type Props = {
  warehouseId: number;
  enabled: boolean;
};

function orderLabel(orderCode: string, index: number): string {
  const code = orderCode?.trim();
  return code || `Đơn hàng ${index + 1}`;
}

export default function OperatorOutboundLackedPanel({
  warehouseId,
  enabled,
}: Props) {
  const { data, isLoading, isError, refetch } =
    useOperatorRecentLackedOrders(warehouseId, enabled);

  const columns: ColumnsType<LackedDetail & { key: number }> = useMemo(
    () => [
      {
        title: "Mã hàng",
        key: "sku",
        ellipsis: true,
        render: (_, row) => (
          <span className="font-mono font-semibold text-brand-dark">
            {row.sku?.trim() || `#${row.item_id}`}
          </span>
        ),
      },
      {
        title: "Tên",
        key: "item_name",
        ellipsis: true,
        render: (_, row) => row.item_name?.trim() || "—",
      },
      {
        title: "Yêu cầu",
        dataIndex: "requested_quantity",
        width: 88,
        render: (v: number) => toDisplayInteger(v),
      },
      {
        title: "Còn thiếu",
        dataIndex: "quantity",
        width: 88,
        render: (v: number) => (
          <span className="font-bold tabular-nums text-amber-700">
            {toDisplayInteger(v)}
          </span>
        ),
      },
      {
        title: "ĐVT",
        key: "unit",
        width: 72,
        render: (_, row) => row.unit?.trim() || "—",
      },
    ],
    [],
  );

  if (!enabled || warehouseId <= 0) {
    return (
      <p className="px-4 py-8 text-center text-base text-slate-500">
        Chọn kho để xem hàng thiếu.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loading />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-base font-semibold text-red-600">
          Không tải được hàng thiếu.
        </p>
        <button
          type="button"
          className="mt-3 text-sm font-bold text-brand-primary underline"
          onClick={() => void refetch()}
        >
          Thử lại
        </button>
      </div>
    );
  }

  const blocks = data ?? [];

  if (blocks.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-lg font-medium text-slate-500">
        Không có đơn xuất chưa hoàn thành.
      </p>
    );
  }

  const allEmpty = blocks.every((b) => b.lacked.length === 0);

  if (allEmpty) {
    const emptyMessage =
      blocks.length === 3
        ? "Đơn hàng 1, 2, 3 không có hàng thiếu"
        : `${blocks.map((b, i) => orderLabel(b.order.order_code, i)).join(", ")} không có hàng thiếu`;
    return (
      <p className="px-4 py-10 text-center text-lg font-semibold text-slate-600">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="operator-panel-scroll min-h-0 flex-1 space-y-4 p-3">
      {blocks.map((block, index) => {
        if (block.lacked.length === 0) return null;
        const label = orderLabel(block.order.order_code, index);
        return (
          <section
            key={block.order.id}
            className="overflow-hidden rounded-xl border border-stripe-hairline bg-white"
          >
            <div className="border-b border-stripe-hairline bg-panel-soft px-3 py-2.5">
              <p className="text-lg font-black text-brand-dark">{label}</p>
              <p className="text-xs font-medium text-slate-500">
                {block.lacked.length} dòng thiếu
              </p>
            </div>
            <Table<LackedDetail>
              rowKey="id"
              size="middle"
              pagination={false}
              columns={columns}
              dataSource={block.lacked}
              scroll={{ x: 520 }}
            />
          </section>
        );
      })}
    </div>
  );
}
