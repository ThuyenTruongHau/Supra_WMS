import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Table, Button, Select, message } from "@/components/ui";
import { Space, Tag, Steps, Progress, Switch } from "antd";
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { useGetEntryPoints } from "@/hooks/useEntryPoint";
import {
  useGetInboundOrderDetail,
  useReceiveInboundOrderDetail,
} from "@/hooks/useInboundOrder";
import { useAppStore } from "@/store/useAppStore";
import dayjs from "dayjs";

interface ReceiveState {
  isRobot: boolean;
  startPoint?: string;
}

export default function ImportDetailPage() {
  const { id: orderCode } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId);
  const { data, isLoading } = useGetInboundOrderDetail(orderCode);
  const { data: entryPoints } = useGetEntryPoints(selectedWarehouseId || 0);
  const receiveMutation = useReceiveInboundOrderDetail();

  const order = data;

  const [receiveSettings, setReceiveSettings] = useState<
    Record<number, ReceiveState>
  >({});

  // Cập nhật vị trí bắt đầu
  const handleSelectStartPoint = (detailId: number, startPoint: string) => {
    setReceiveSettings((prev) => ({
      ...prev,
      [detailId]: { ...prev[detailId], startPoint },
    }));
  };

  const handleToggleRobot = (detailId: number, checked: boolean) => {
    setReceiveSettings((prev) => ({
      ...prev,
      [detailId]: { ...prev[detailId], isRobot: checked },
    }));
  };

  const handleReceive = async (detail: any) => {
    const setting = receiveSettings[detail.id] || { isRobot: false };

    if (setting.isRobot && !setting.startPoint) {
      message.warning("Vui lòng chọn Điểm bắt đầu cho Robot!");
      return;
    }

    if (!orderCode) {
      message.error("Lỗi: Không tìm thấy mã đơn hàng hợp lệ!");
      return;
    }

    try {
      const receivePayload = {
        received_quantity: Number(detail.ordered_quantity), // Mặc định nhận hết
        actual_location_code: detail.location?.location_code || "",
        "start-location": setting.isRobot ? setting.startPoint : undefined,
      };

      console.log(
        `=== [4] POST /api/v1/inbound-orders/${orderCode}/details/${detail.id}/receive PAYLOAD ===`,
        receivePayload,
      );

      message.open({
        type: "loading",
        content: "Đang xử lý nhận hàng...",
        key: "receive",
      });
      await receiveMutation.mutateAsync({
        orderCode: orderCode,
        detailId: detail.id,
        data: receivePayload,
      });
      message.open({
        type: "success",
        content: "Nhận hàng thành công!",
        key: "receive",
      });
    } catch (error: any) {
      const data = error?.response?.data;
      const errorMsg =
        data?.detail?.detail ||
        data?.detail ||
        error?.message ||
        "Có lỗi xảy ra!";
      const finalMsg =
        typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg);

      message.open({
        type: "error",
        content: `Lỗi nhận hàng: ${finalMsg}`,
        key: "receive",
        duration: 5,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64 text-slate-500 font-medium">
        Đang tải thông tin vận hành...
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col justify-center items-center h-64 text-slate-500 font-medium gap-4">
        <div>Không tìm thấy đơn nhập kho!</div>
        <Button onClick={() => navigate("/import")}>Quay lại danh sách</Button>
      </div>
    );
  }

  // Tính toán tiến trình
  let totalOrdered = 0;
  let totalReceived = 0;
  order.details?.forEach((d: any) => {
    totalOrdered += Number(d.ordered_quantity) || 0;
    totalReceived += Number(d.received_quantity) || 0;
  });
  const overallProgressPercent =
    totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
  const isCompleted = overallProgressPercent === 100;

  let stepCurrent = 0;
  if (overallProgressPercent > 0) stepCurrent = 1;
  if (isCompleted) stepCurrent = 2;

  const entryPointOptions =
    entryPoints?.map((ep) => ({
      value: ep.code,
      label: `${ep.description} (${ep.code})`,
    })) || [];

  const columns: any[] = [
    {
      title: "Mã Sản phẩm",
      key: "product",
      render: (_: any, record: any) => (
        <div>
          <div className="font-semibold text-slate-800">{record.item_name}</div>
          <div className="text-xs text-slate-400">
            Part_number: {record.item_sku} | Lot: {record.item_lot_code}
          </div>
        </div>
      ),
    },
    {
      title: "Hạn sử dụng",
      dataIndex: "item_expire_at",
      key: "item_expire_at",
      render: (val: string) => (
        <span className="text-sm">{dayjs(val).format("DD/MM/YYYY")}</span>
      ),
    },
    {
      title: "Biển số xe",
      dataIndex: "vehicle_number",
      key: "vehicle_number",
      render: (val: string) =>
        val ? (
          <Tag className="font-mono bg-slate-100 border-slate-200 text-slate-600">
            {val}
          </Tag>
        ) : (
          <span className="text-slate-300">-</span>
        ),
    },
    {
      title: "Tiến độ Nhận",
      key: "quantity",
      render: (_: any, record: any) => (
        <span className="font-bold">
          {Number(record.received_quantity)} / {Number(record.ordered_quantity)}
        </span>
      ),
    },
    {
      title: "Vị trí đích",
      key: "endPoint",
      render: (_: any, record: any) => (
        <Tag color="blue" className="font-medium text-sm px-2 py-0.5">
          {record.location?.location_code}
        </Tag>
      ),
    },
    {
      title: "Phương thức",
      key: "method",
      render: (_: any, record: any) => {
        if (
          Number(record.received_quantity) >= Number(record.ordered_quantity)
        ) {
          return <span className="text-slate-400">-</span>;
        }
        const isRobot = receiveSettings[record.id]?.isRobot || false;
        return (
          <Space>
            <span>Thủ công</span>
            <Switch
              checked={isRobot}
              onChange={(checked) => handleToggleRobot(record.id, checked)}
            />
            <span>Robot</span>
          </Space>
        );
      },
    },
    {
      title: "Điểm bắt đầu",
      key: "startPoint",
      width: 250,
      render: (_: any, record: any) => {
        if (
          Number(record.received_quantity) >= Number(record.ordered_quantity)
        ) {
          return <span className="text-slate-400">-</span>;
        }
        const isRobot = receiveSettings[record.id]?.isRobot || false;
        if (!isRobot)
          return <span className="text-slate-400">Không áp dụng</span>;

        return (
          <Select
            placeholder="Chọn điểm bắt đầu..."
            className="w-full"
            value={receiveSettings[record.id]?.startPoint}
            onChange={(val) => handleSelectStartPoint(record.id, val as string)}
            options={entryPointOptions}
          />
        );
      },
    },
    {
      title: "Thao tác",
      key: "action",
      width: 180,
      render: (_: any, record: any) => {
        const isFullyReceived =
          Number(record.received_quantity) >= Number(record.ordered_quantity);
        if (isFullyReceived) {
          return (
            <Tag color="green" icon={<CheckCircleOutlined />}>
              Đã nhận xong
            </Tag>
          );
        }

        const isRobot = receiveSettings[record.id]?.isRobot || false;
        return (
          <Button
            variant={isRobot ? "primary" : "secondary"}
            size="small"
            icon={isRobot ? <PlayCircleOutlined /> : <CheckCircleOutlined />}
            loading={receiveMutation.isPending}
            onClick={() => handleReceive(record)}
            className={isRobot ? "bg-brand-primary" : ""}
          >
            {isRobot ? "Lệnh Robot" : "Nhận thủ công"}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/import")}
        />
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Chi tiết Vận hành Đơn Nhập kho:{" "}
            <span className="text-brand-primary">{order.order_code}</span>
          </h2>
          <div className="text-slate-400 text-sm mt-1">
            <Space split={<span className="text-slate-300">|</span>}>
              <span>
                Ngày lập: {dayjs(order.created_at).format("DD/MM/YYYY HH:mm")}
              </span>
              <span>
                NCC:{" "}
                <span className="font-medium text-slate-600">
                  {order.supplier_name}
                </span>
              </span>
              {order.nvt_code && (
                <span>
                  Mã NVT:{" "}
                  <Tag color="purple" className="ml-1 border-purple-200">
                    {order.nvt_code}
                  </Tag>
                </span>
              )}
            </Space>
          </div>
        </div>
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
          <div className="md:col-span-3">
            <Steps
              current={stepCurrent}
              items={[
                { title: "Khởi tạo", description: "Đơn hàng vừa lập" },
                { title: "Đang xử lý", description: "Đang nhận hàng" },
                {
                  title: "Hoàn thành",
                  description: "Đã hoàn thành toàn bộ Pallet",
                },
              ]}
            />
          </div>
          <div className="flex flex-col items-center justify-center p-3 bg-slate-50 border border-stripe-hairline rounded-lg">
            <div className="text-xs text-slate-400 font-semibold mb-1">
              TIẾN ĐỘ CHUNG
            </div>
            <Progress
              type="circle"
              percent={overallProgressPercent}
              size={70}
              strokeColor="var(--color-brand-primary)"
            />
            <div className="text-xs text-slate-500 font-bold mt-2">
              {totalReceived} / {totalOrdered} SP
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">
            Danh Sách Pallet Vận Hành
          </h3>
          {isCompleted && (
            <Tag color="green" className="text-sm py-1 px-3 font-semibold">
              ĐƠN HÀNG HOÀN THÀNH
            </Tag>
          )}
        </div>
        <Table
          columns={columns}
          dataSource={order.details || []}
          pagination={false}
          rowKey="id"
          className="[&_.ant-table-thead_th]:bg-slate-50! [&_.ant-table-thead_th]:text-slate-600! [&_.ant-table-thead_th]:font-semibold!"
        />
      </Card>
    </div>
  );
}
