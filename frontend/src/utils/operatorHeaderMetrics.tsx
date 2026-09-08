import type { InboundAssignedDetail } from "@/types/inbound";
import type { OutboundOrder } from "@/types/outbound";
import type { WarehouseLocation } from "@/types/warehouseLocation";
import {
  type AgvStatusRow,
  BufferSlotLegendPanel,
  GoodsStatusLegendPanel,
  RobotStatusPanel,
  type BufferSlotLegend,
  type GoodsStatusLegend,
} from "@/components/layout/OperatorStatusMetricPanels";
import type { OperatorMetricItem } from "@/components/layout/OperatorPageHeader";

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Khởi tạo",
  receiving: "Đang nhập",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
  wave_assigned: "Đã gán phiên",
  sorting: "Đang chia chọn",
  picking: "Đang lấy hàng",
};

const INTRANSIT_ITEM_STATUSES = new Set([
  "sorting",
  "picking",
  "task_created",
  "partial",
]);

export function buildInboundRobotRows(
  assignedDetails: InboundAssignedDetail[],
): AgvStatusRow[] {
  const waitingDetail = assignedDetails.find(
    (detail) =>
      detail.status === "partial" &&
      (detail.location_bin?.trim() || detail.location_code?.trim()),
  );
  const waitingTarget =
    waitingDetail?.location_bin?.trim() ||
    waitingDetail?.location_code?.trim() ||
    "CN12";

  return [
    {
      id: "AGV-01",
      status: `Đang chờ`,
      tone: "waiting",
    },
    {
      id: "AGV-02",
      status: "Standby",
      tone: "standby",
    },
  ];
}

export function mapInboundGoodsLegend(
  goods: {
    pending_count: number;
    partial_count: number;
    completed_count: number;
  } | null | undefined,
): GoodsStatusLegend {
  return {
    staging_count: goods?.pending_count ?? 0,
    intransit_count: goods?.partial_count ?? 0,
    stock_count: goods?.completed_count ?? 0,
  };
}

export function buildOutboundRobotRows(
  pendingTaskCount: number,
  selectedWaveName?: string | null,
): AgvStatusRow[] {
  return [
    {
      id: "AGV-01",
      status:
        pendingTaskCount > 0
          ? `Đang xử lý ${pendingTaskCount} task`
          : selectedWaveName
            ? `Đang chờ ${selectedWaveName}`
            : "Đang chờ lệnh",
      tone: pendingTaskCount > 0 ? "active" : "waiting",
    },
    {
      id: "AGV-02",
      status: "Standby",
      tone: "standby",
    },
  ];
}

export function buildSortingSlotLegend(
  locations: WarehouseLocation[],
): BufferSlotLegend {
  const stations = locations.filter(
    (location) =>
      location.is_active !== false &&
      (location.location_type || "").trim() === "sorting_station",
  );
  const emptyCount = stations.filter(
    (location) => (location.status || "").trim() === "empty",
  ).length;
  const occupiedCount = Math.max(stations.length - emptyCount, 0);
  return {
    occupied_count: occupiedCount,
    empty_count: emptyCount,
    total: stations.length,
  };
}

export function buildOutboundGoodsLegend(
  orders: OutboundOrder[],
): GoodsStatusLegend {
  let staging = 0;
  let intransit = 0;
  let stock = 0;

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    for (const group of order.detail_groups) {
      for (const item of group.items) {
        const status = (item.status || "").trim();
        if (status === "completed") {
          stock += 1;
        } else if (status === "pending") {
          staging += 1;
        } else if (INTRANSIT_ITEM_STATUSES.has(status)) {
          intransit += 1;
        }
      }
    }
  }

  return {
    staging_count: staging,
    intransit_count: intransit,
    stock_count: stock,
  };
}

export function buildInboundOperatorMetrics(input: {
  orderCode: string;
  orderStatus: string;
  carrierName: string | null;
  bufferSlots: BufferSlotLegend;
  goodsLegend: GoodsStatusLegend;
  robotRows: AgvStatusRow[];
  compact?: boolean;
}): OperatorMetricItem[] {
  return [
    {
      key: "order",
      label: "Đơn nhập",
      value: input.orderCode,
      sub: ORDER_STATUS_LABEL[input.orderStatus] ?? input.orderStatus,
    },
    {
      key: "carrier",
      label: "Nhà vận tải",
      value: input.carrierName?.trim() || "—",
    },
    {
      key: "robot",
      label: "Trạng thái robot",
      panel: (
        <RobotStatusPanel rows={input.robotRows} compact={input.compact} />
      ),
    },
    {
      key: "slots",
      label: "Chú giải trạng thái ô",
      panel: (
        <BufferSlotLegendPanel slots={input.bufferSlots} compact={input.compact} />
      ),
    },
    {
      key: "goods",
      label: "Trạng thái hàng hoá",
      panel: (
        <GoodsStatusLegendPanel goods={input.goodsLegend} compact={input.compact} />
      ),
    },
  ];
}

export function buildOutboundOperatorMetrics(input: {
  orderCode: string;
  orderStatus: string;
  carrierName: string | null;
  bufferSlots: BufferSlotLegend;
  goodsLegend: GoodsStatusLegend;
  robotRows: AgvStatusRow[];
  compact?: boolean;
}): OperatorMetricItem[] {
  return [
    {
      key: "order",
      label: "Đơn xuất",
      value: input.orderCode,
      sub: ORDER_STATUS_LABEL[input.orderStatus] ?? input.orderStatus,
    },
    {
      key: "carrier",
      label: "Nhà vận tải",
      value: input.carrierName?.trim() || "—",
    },
    {
      key: "robot",
      label: "Trạng thái robot",
      panel: (
        <RobotStatusPanel rows={input.robotRows} compact={input.compact} />
      ),
    },
    {
      key: "slots",
      label: "Chú giải trạng thái ô",
      panel: (
        <BufferSlotLegendPanel slots={input.bufferSlots} compact={input.compact} />
      ),
    },
    {
      key: "goods",
      label: "Trạng thái hàng hoá",
      panel: (
        <GoodsStatusLegendPanel goods={input.goodsLegend} compact={input.compact} />
      ),
    },
  ];
}

export function pickActiveOutboundOrder(
  orders: OutboundOrder[],
): OutboundOrder | null {
  const open = orders.filter(
    (order) => order.status !== "completed" && order.status !== "cancelled",
  );
  if (open.length === 0) return orders[0] ?? null;
  return open[0];
}

export function pickOutboundCarrier(order: OutboundOrder | null): string | null {
  if (!order) return null;
  for (const group of order.detail_groups) {
    const carrier = group.carrier_name?.trim();
    if (carrier) return carrier;
  }
  return null;
}
