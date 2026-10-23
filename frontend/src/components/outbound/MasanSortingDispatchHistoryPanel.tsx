import type { ColumnsType } from "antd/es/table";
import { Button, Loading, Table, cn } from "@/components/ui";
import OutboundStatusTag from "@/components/shared/OutboundStatusTag";
import {
  isMasanSortingZoneRobotTasksAbortError,
  useMasanSortingZoneRobotTasks,
} from "@/hooks/useMasanSortingZoneRobotTasks";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";
import type { OutboundRobotTask } from "@/types/outbound";
import { getRobotTaskDisplayStatus } from "@/utils/outboundRobotTaskDisplay";
import { toDisplayInteger } from "@/utils/number";
import { taskEndpointLocationName } from "@/utils/masanSortingReturnTasks";

type Props = {
  sortingZoneCode: string;
  enabled?: boolean;
  className?: string;
};

export default function MasanSortingDispatchHistoryPanel({
  sortingZoneCode,
  enabled = true,
  className,
}: Props) {
  const { data, error, isLoading, isFetching, isFetched, refetch } =
    useMasanSortingZoneRobotTasks(sortingZoneCode, enabled);

  const tasks = data?.tasks ?? [];
  const hasLoadedOnce = data !== undefined;
  const showInitialLoading =
    !hasLoadedOnce && (isLoading || isFetching) && !isFetched;
  const showHardError =
    !hasLoadedOnce &&
    isFetched &&
    error != null &&
    !isMasanSortingZoneRobotTasksAbortError(error);
  const showEmpty =
    tasks.length === 0 &&
    !showHardError &&
    !showInitialLoading &&
    (hasLoadedOnce || isFetched);

  const columns: ColumnsType<OutboundRobotTask> = [
    {
      title: "Mã lệnh",
      dataIndex: "order_id",
      key: "order_id",
      width: 148,
      ellipsis: true,
      render: (value: string) => (
        <span className="block truncate font-mono text-xs" title={value}>
          {value}
        </span>
      ),
    },
    {
      title: "Vị trí đầu",
      key: "from_location",
      width: 96,
      align: "center",
      ellipsis: true,
      render: (_value, record) => {
        const label = taskEndpointLocationName(record, "from");
        return (
          <span className="block truncate font-medium" title={label}>
            {label}
          </span>
        );
      },
    },
    {
      title: "Vị trí đích",
      key: "to_location",
      width: 96,
      align: "center",
      ellipsis: true,
      render: (_value, record) => {
        const label = taskEndpointLocationName(record, "to");
        return (
          <span className="block truncate font-medium" title={label}>
            {label}
          </span>
        );
      },
    },
    {
      title: "SL",
      dataIndex: "quantity",
      key: "quantity",
      width: 56,
      align: "center",
      render: (value: number) => toDisplayInteger(value),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      align: "center",
      render: (_value, record) => (
        <OutboundStatusTag status={getRobotTaskDisplayStatus(record)} />
      ),
    },
  ];

  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-brand-dark">Lịch sử gọi lệnh</p>
        <p className="text-xs text-slate-500">
          Zone:{" "}
          <span className="font-mono font-medium text-slate-600">
            {sortingZoneCode.trim()}
          </span>
        </p>
      </div>
      {showInitialLoading ? (
        <div className="flex justify-center py-6">
          <Loading text="Đang tải lịch sử lệnh..." />
        </div>
      ) : showHardError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-center text-sm text-red-700">
          <p className="font-semibold">Không tải được lịch sử gọi lệnh.</p>
          <p className="mt-1 text-xs opacity-90">
            {getApiErrorMessage(error, "Kiểm tra kết nối hoặc quyền outbound:read.")}
          </p>
          <Button
            variant="secondary"
            className="mt-2 !h-8 !text-xs"
            onClick={() => void refetch()}
          >
            Thử lại
          </Button>
        </div>
      ) : showEmpty ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
          Chưa có lệnh robot
        </p>
      ) : (
        <div className="w-full min-w-0">
          <Table<OutboundRobotTask>
            columns={columns}
            dataSource={tasks}
            pagination={false}
            rowKey="order_id"
            size="small"
            tableLayout="fixed"
            className="w-full [&_.ant-table]:!table-fixed [&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-xs [&_.ant-table-cell]:!py-2"
          />
        </div>
      )}
    </div>
  );
}
