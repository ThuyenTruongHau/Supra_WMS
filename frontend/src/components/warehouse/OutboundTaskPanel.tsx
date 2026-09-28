import { useEffect, useMemo, useState } from "react";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { message, Modal } from "antd";
import { Button, Input, Select, Table, cn } from "@/components/ui";
import { useSortingWaves } from "@/hooks/useSortingWave";
import {
  useOutboundTasksByWave,
  useRemoveWaveCustomer,
  useSendOutboundTaskCommand,
  useUpdateOutboundTask,
  useWaveCustomers,
} from "@/hooks/useOutboundTask";
import { useGetExitPoints } from "@/hooks/useExitPoint";
import {
  OUTBOUND_TASK_STATUS_LABELS,
  OUTBOUND_TASK_TYPE_LABELS,
  type OutboundTask,
} from "@/types/outboundTask";
import { toDisplayInteger } from "@/utils/number";

const PAGE_SIZE = 20;

type OutboundTaskPanelProps = {
  zoneId: number;
};

function StatusTag({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    in_progress: "bg-info-100 text-info-700",
    completed: "bg-green-100 text-green-700",
    cancelled: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase ${styles[status] ?? "bg-slate-100 text-slate-600"}`}
    >
      {OUTBOUND_TASK_STATUS_LABELS[status as keyof typeof OUTBOUND_TASK_STATUS_LABELS] ??
        status}
    </span>
  );
}

function TypeTag({ type }: { type: string }) {
  const styles: Record<string, string> = {
    pick: "bg-green-100 text-green-700",
    return: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase ${styles[type] ?? "bg-slate-100 text-slate-600"}`}
    >
      {OUTBOUND_TASK_TYPE_LABELS[type as keyof typeof OUTBOUND_TASK_TYPE_LABELS] ??
        type}
    </span>
  );
}

function formatNodeLabel(task: OutboundTask): string {
  if (!task.node_name) return "—";
  if (task.node_qr_code) {
    return `${task.node_name} (${task.node_qr_code})`;
  }
  return task.node_name;
}

export default function OutboundTaskPanel({ zoneId }: OutboundTaskPanelProps) {
  const [selectedWaveId, setSelectedWaveId] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: waves = [], isLoading: wavesLoading } = useSortingWaves(zoneId);
  const { data: tasks = [], isLoading: tasksLoading } = useOutboundTasksByWave(
    selectedWaveId,
  );
  const { data: waveCustomers = [] } = useWaveCustomers(selectedWaveId);
  const { data: exitPoints = [] } = useGetExitPoints({
    zone_id: zoneId,
    is_active: true,
    limit: 100,
  });

  const removeMutation = useRemoveWaveCustomer(selectedWaveId);
  const updateTaskMutation = useUpdateOutboundTask(selectedWaveId);
  const sendCommandMutation = useSendOutboundTaskCommand(selectedWaveId, zoneId);

  useEffect(() => {
    if (waves.length === 0) {
      setSelectedWaveId(0);
      return;
    }
    if (!waves.some((wave) => wave.id === selectedWaveId)) {
      setSelectedWaveId(waves[0].id);
    }
  }, [waves, selectedWaveId]);

  const nodeOptions = useMemo(
    () =>
      exitPoints.map((point) => ({
        value: point.id,
        label: point.code ? `${point.name} (${point.code})` : point.name,
      })),
    [exitPoints],
  );

  const filteredTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return tasks;
    return tasks.filter(
      (task) =>
        String(task.sorting_wave_id).includes(keyword) ||
        (OUTBOUND_TASK_TYPE_LABELS[task.type] ?? task.type)
          .toLowerCase()
          .includes(keyword) ||
        task.type.toLowerCase().includes(keyword) ||
        (task.product_sku ?? "").toLowerCase().includes(keyword) ||
        (task.product_name ?? "").toLowerCase().includes(keyword) ||
        (task.outbound_order_code ?? "").toLowerCase().includes(keyword) ||
        (task.location_code ?? "").toLowerCase().includes(keyword),
    );
  }, [search, tasks]);

  const handleRemoveCustomer = (waveCustomerId: number, customerName: string) => {
    Modal.confirm({
      title: "Gỡ khách hàng khỏi wave?",
      content: `Bạn có chắc muốn gỡ "${customerName}" và xóa các lệnh xuất liên quan?`,
      okText: "Gỡ",
      cancelText: "Hủy",
      okButtonProps: { danger: true },
      onOk: () =>
        removeMutation.mutateAsync(waveCustomerId).catch((err) => {
          message.error(err.response?.data?.detail ?? "Không thể gỡ khách hàng");
          throw err;
        }),
    });
  };

  const renderNodeSelect = (
    record: OutboundTask,
    placeholder: string,
    errorMessage: string,
  ) => {
    if (record.status === "completed") {
      return formatNodeLabel(record);
    }
    return (
      <Select
        allowClear
        showSearch
        optionFilterProp="label"
        placeholder={placeholder}
        value={record.node_id ?? undefined}
        options={nodeOptions}
        disabled={nodeOptions.length === 0 || updateTaskMutation.isPending}
        className="!w-full"
        onChange={(value: number | undefined) => {
          updateTaskMutation.mutate(
            {
              taskId: record.id,
              data: { node_id: value ?? null },
            },
            {
              onError: (err) => {
                message.error(err.response?.data?.detail ?? errorMessage);
              },
            },
          );
        }}
      />
    );
  };

  const handleSendCommand = (task: OutboundTask) => {
    if (!task.location_id) {
      message.error("Lệnh này chưa có vị trí kho");
      return;
    }
    if (!task.node_id) {
      message.error(
        task.type === "return"
          ? "Vui lòng chọn vị trí lấy trước khi gọi lệnh"
          : "Vui lòng chọn điểm xuất trước khi gọi lệnh",
      );
      return;
    }

    const sourceLabel =
      task.type === "return" ? formatNodeLabel(task) : task.location_code ?? "—";
    const destinationLabel =
      task.type === "return" ? task.location_code ?? "—" : formatNodeLabel(task);

    Modal.info({
      title: "Xác nhận gọi lệnh xuống robot",
      content: (
        <div className="mt-2 space-y-2">
          <p>
            Loại lệnh:{" "}
            <strong>
              {OUTBOUND_TASK_TYPE_LABELS[task.type] ?? task.type}
            </strong>
          </p>
          <p>
            Vị trí lấy: <strong>{sourceLabel}</strong>
          </p>
          <p>
            Điểm xuất: <strong>{destinationLabel}</strong>
          </p>
        </div>
      ),
      okText: "Xác nhận",
      cancelText: "Hủy",
      okCancel: true,
      onOk: () =>
        sendCommandMutation.mutateAsync(
          {
            taskId: task.id,
            data: { node_id: task.node_id },
          },
          {
            onSuccess: () => {
              message.success("Đã gọi lệnh xuất");
            },
            onError: (err) => {
              message.error(err.response?.data?.detail ?? "Không thể gọi lệnh");
            },
          },
        ),
    });
  };

  const columns: ColumnsType<OutboundTask> = [
    {
      title: "Wave",
      dataIndex: "sorting_wave_id",
      key: "sorting_wave_id",
      width: 80,
      align: "center",
      render: (value: number) => (
        <span className="font-semibold text-sky-700">#{value}</span>
      ),
    },
    {
      title: "Mã đơn xuất",
      dataIndex: "outbound_order_code",
      key: "outbound_order_code",
      width: 120,
      render: (value: string | null) => value ?? "—",
    },
    {
      title: "Mã SP",
      dataIndex: "product_sku",
      key: "product_sku",
      width: 100,
      render: (value: string | null) => value ?? "—",
    },
    {
      title: "Tên sản phẩm",
      dataIndex: "product_name",
      key: "product_name",
      width: 200,
      render: (value: string | null) => (
        <div className="min-w-[120px] max-w-[200px] whitespace-normal break-words text-sm">
          {value ?? "—"}
        </div>
      ),
    },
    {
      title: "SL",
      dataIndex: "quantity",
      key: "quantity",
      width: 70,
      align: "right",
      render: (value: number) => toDisplayInteger(value),
    },
    {
      title: "Loại",
      dataIndex: "type",
      key: "type",
      width: 90,
      render: (value: string) => <TypeTag type={value} />,
    },
    {
      title: "Vị trí lấy",
      key: "source_location",
      width: 180,
      render: (_: unknown, record: OutboundTask) =>
        record.type === "return"
          ? renderNodeSelect(record, "Chọn vị trí lấy", "Không thể cập nhật vị trí lấy")
          : record.location_code ?? "—",
    },
    {
      title: "Điểm xuất",
      key: "node",
      width: 180,
      render: (_: unknown, record: OutboundTask) =>
        record.type === "return"
          ? record.location_code ?? "—"
          : renderNodeSelect(record, "Chọn điểm xuất", "Không thể cập nhật điểm xuất"),
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => <StatusTag status={status} />,
    },
    {
      title: "Thao tác",
      key: "action",
      width: 120,
      fixed: "right",
      render: (_: unknown, record: OutboundTask) =>
        record.status === "completed" ? (
          <span className="text-sm text-green-700">Đã gọi lệnh</span>
        ) : (
          <Button
            size="small"
            variant="secondary"
            loading={sendCommandMutation.isPending}
            onClick={() => handleSendCommand(record)}
          >
            Gọi lệnh
          </Button>
        ),
    },
  ];

  if (zoneId <= 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-gray-400">
        Vui lòng chọn kho để xem lệnh xuất
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

      {waveCustomers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
          <span className="text-xs font-semibold uppercase text-gray-400">
            Khách trong wave:
          </span>
          {waveCustomers.map((customer) => (
            <span
              key={customer.id}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-slate-50 px-3 py-1 text-sm"
            >
              <span className="font-medium text-brand-dark">
                {customer.customer_name ?? "—"}
              </span>
              <span className="text-gray-400">({customer.task_count} lệnh)</span>
              <button
                type="button"
                className="text-xs text-red-500 hover:text-red-700"
                onClick={() =>
                  handleRemoveCustomer(
                    customer.id,
                    customer.customer_name ?? "khách hàng",
                  )
                }
              >
                Gỡ
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-brand-dark">Lệnh xuất</h3>
          <p className="mt-0.5 text-xs text-gray-400">
            Tự động tạo khi hệ thống gán khách vào wave (quét định kỳ)
          </p>
        </div>
        <Input
          allowClear
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          prefix={<SearchOutlined className="text-gray-400" />}
          placeholder="Tìm theo SKU, tên SP, mã đơn..."
          className="!w-72"
          disabled={selectedWaveId <= 0}
        />
      </div>

      {selectedWaveId <= 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          Chọn wave để xem lệnh xuất
        </div>
      ) : filteredTasks.length === 0 && !tasksLoading ? (
        <div className="px-5 py-10 text-center text-sm text-gray-400">
          Chưa có lệnh xuất trong wave này. Đơn xuất sẽ được hệ thống tự gán wave.
        </div>
      ) : (
        <Table<OutboundTask>
          columns={columns}
          dataSource={filteredTasks}
          rowKey="id"
          loading={tasksLoading}
          scroll={{ x: 1220 }}
          rowClassName={(record) =>
            record.type === "return"
              ? "[&>td]:!bg-red-100 [&>td]:!border-y [&>td]:!border-red-200 hover:[&>td]:!bg-red-200"
              : record.type === "pick"
                ? "[&>td]:!bg-green-100 [&>td]:!border-y [&>td]:!border-green-200 hover:[&>td]:!bg-green-200"
                : ""
          }
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total: filteredTasks.length,
            showSizeChanger: false,
            showTotal: (total, range) =>
              `Hiển thị ${range[0]}–${range[1]} / ${total} lệnh`,
            onChange: setPage,
          }}
          className="[&_.ant-table-thead_th]:!bg-slate-50 [&_.ant-table-thead_th]:!text-slate-600 [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-row]:hover:bg-slate-50/50"
        />
      )}
    </>
  );
}
