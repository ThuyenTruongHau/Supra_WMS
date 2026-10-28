import { useCallback, useMemo, useState } from "react";
import { useOutboundAuto } from '@/hooks/useOutboundAuto';
import { OUTBOUND_DISPLAY_ZONES } from '@/constants/outboundMapZones';
import { PlayCircleOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { Button, Loading, Table, cn, message } from "@/components/ui";
import OutboundStatusTag from "@/components/shared/OutboundStatusTag";
import { useMasanSortingZoneReturnTasks } from "@/hooks/useMasanSortingZoneReturnTasks";
import { useExecuteOutboundRobotTask } from "@/hooks/useOutbound";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";
import {
  buildReturnExecuteBody,
  filterReturnTasksByFromLocationId,
  taskEndpointLocationName,
  type MasanSortingReturnTaskRow,
} from "@/utils/masanSortingReturnTasks";
import { toDisplayInteger } from "@/utils/number";
import { getRobotTaskDisplayStatus } from "@/utils/outboundRobotTaskDisplay";
import {
  operatorPickBodyTextClass,
  operatorPickFooterButtonClass,
  useOperatorViewportTier,
} from "@/utils/operatorViewportTier";

const RETURN_TABLE_CLASS =
  "[&_.ant-table]:!table-fixed [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50 [&_.ant-table-cell]:!text-center";

type Props = {
  warehouseId: number;
  sortingZoneCode: string;
  /** Lọc theo vị trí đầu (VT). Bỏ trống = hiện toàn zone. */
  vtLocationId?: number | null;
  enabled?: boolean;
  compact?: boolean;
  className?: string;
  emptyHint?: string;
};

export default function MasanSortingReturnTasksSection({
  warehouseId,
  sortingZoneCode,
  vtLocationId = null,
  enabled = true,
  compact: compactProp,
  className,
  emptyHint,
}: Props) {
  const displayZoneId = OUTBOUND_DISPLAY_ZONES.find((item) => item.vtSortingZoneCode === sortingZoneCode)?.id ?? 0;
  const auto = useOutboundAuto(warehouseId, displayZoneId);
  const tier = useOperatorViewportTier();
  const compact = compactProp ?? tier === "narrow";
  const bodyText = operatorPickBodyTextClass(tier);
  const footerBtn = operatorPickFooterButtonClass(tier);
  const [executingOrderId, setExecutingOrderId] = useState<string | null>(null);
  const executeReturnMutation = useExecuteOutboundRobotTask();

  const zone = sortingZoneCode.trim();
  const queryEnabled = enabled && warehouseId > 0 && zone.length > 0;

  const {
    rows: allReturnRows,
    isLoading: returnLoading,
    isError: returnError,
    refetch: refetchReturnTasks,
  } = useMasanSortingZoneReturnTasks(warehouseId, zone, queryEnabled);

  const returnRows = useMemo(
    () => filterReturnTasksByFromLocationId(allReturnRows, vtLocationId).filter((row) =>
      !auto.data?.vts.some((vt) => vt.execution_mode === 'native'
        && vt.return_order_id === row.task.order_id)),
    [allReturnRows, vtLocationId, auto.data],
  );

  const handleExecuteReturn = useCallback(
    async (row: MasanSortingReturnTaskRow) => {
      if (auto.manualBlocked) {
        message.warning('Dừng tự động trước khi gọi return thủ công');
        return;
      }
      const body = buildReturnExecuteBody(row.task);
      if (!body) {
        message.error("Thiếu vị trí đầu hoặc đích trên lệnh trả");
        return;
      }
      setExecutingOrderId(row.task.order_id);
      message.loading({ content: "Đang gửi lệnh trả...", key: "return-exec" });
      try {
        const owned = auto.data?.vts.find((vt) => ['manual_services', 'adopted_return'].includes(vt.execution_mode ?? '')
          && vt.return_order_id === row.task.order_id);
        if (owned?.cycle_id) {
          await auto.returnCycle.mutateAsync(owned.cycle_id);
        } else {
          await executeReturnMutation.mutateAsync({
            orderId: row.outboundOrderId,
            body,
            detailType: "auto",
          });
        }
        message.success({ content: "Đã gửi lệnh trả", key: "return-exec" });
        await refetchReturnTasks();
      } catch (err) {
        message.error({
          content: getApiErrorMessage(err, "Không gửi được lệnh trả"),
          key: "return-exec",
        });
      } finally {
        setExecutingOrderId(null);
      }
    },
    [auto.manualBlocked, auto.data, auto.returnCycle, executeReturnMutation, refetchReturnTasks],
  );

  const returnColumns: ColumnsType<MasanSortingReturnTaskRow> = useMemo(
    () => [
      {
        title: "Loại",
        key: "task_type",
        width: compact ? 72 : 90,
        render: () => <span className="font-semibold">TRẢ</span>,
      },
      {
        title: "Mã lệnh",
        key: "order_id",
        width: compact ? 132 : 160,
        ellipsis: true,
        render: (_, record) => (
          <span
            className="block truncate font-medium"
            title={record.task.order_id}
          >
            {record.task.order_id}
          </span>
        ),
      },
      {
        title: "Số lượng",
        key: "quantity",
        width: compact ? 88 : 110,
        render: (_, record) => (
          <span className="font-semibold">
            {toDisplayInteger(record.task.quantity)}
          </span>
        ),
      },
      {
        title: "Vị trí đầu",
        key: "start_location",
        width: compact ? 88 : 104,
        ellipsis: true,
        render: (_, record) => {
          const label = taskEndpointLocationName(record.task, "from");
          return (
            <span className="block truncate font-medium" title={label}>
              {label}
            </span>
          );
        },
      },
      {
        title: "Vị trí đích",
        key: "end_location",
        width: compact ? 88 : 104,
        ellipsis: true,
        render: (_, record) => {
          const label = taskEndpointLocationName(record.task, "to");
          return (
            <span className="block truncate font-medium" title={label}>
              {label}
            </span>
          );
        },
      },
      {
        title: "Trạng thái",
        key: "status",
        width: compact ? 120 : 160,
        render: (_, record) => {
          const displayStatus = getRobotTaskDisplayStatus(record.task);
          const body = buildReturnExecuteBody(record.task);
          if (displayStatus === "initialize") {
            return (
              <Button
                variant="primary"
                icon={<PlayCircleOutlined />}
                loading={executingOrderId === record.task.order_id}
                disabled={!body || auto.manualBlocked}
                title={!body ? "Thiếu vị trí đầu hoặc đích" : undefined}
                onClick={() => void handleExecuteReturn(record)}
              >
                Execute
              </Button>
            );
          }
          return <OutboundStatusTag status={displayStatus} size="sm" />;
        },
      },
    ],
    [auto.manualBlocked, compact, executingOrderId, handleExecuteReturn],
  );

  const showReturnEmpty =
    !returnLoading && !returnError && returnRows.length === 0;

  return (
    <div className={cn("min-w-0", className)}>
      {returnLoading ? (
        <div className="flex justify-center py-8">
          <Loading />
        </div>
      ) : returnError ? (
        <div
          className={cn(
            "rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-red-700",
            bodyText,
          )}
        >
          <p className="font-semibold">Không tải được lệnh trả.</p>
          <Button
            variant="secondary"
            className={cn("mt-3", footerBtn)}
            onClick={() => void refetchReturnTasks()}
          >
            Thử lại
          </Button>
        </div>
      ) : showReturnEmpty ? (
        <p className={cn("py-4 text-center font-medium text-slate-500", bodyText)}>
          {emptyHint ?? "Chưa có pallet dư cần trả về kệ tại VT này."}
        </p>
      ) : (
        <div className="w-full min-w-0">
          <Table<MasanSortingReturnTaskRow>
            columns={returnColumns}
            dataSource={returnRows}
            pagination={false}
            rowKey={(record) => record.task.order_id}
            size="middle"
            tableLayout="fixed"
            className={cn(
              RETURN_TABLE_CLASS,
              compact ? "min-w-[580px]" : "min-w-[680px]",
            )}
            rowClassName={() => "bg-red-50"}
          />
        </div>
      )}
    </div>
  );
}
