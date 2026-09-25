import { Link } from "react-router-dom";
import {
  CloudDownloadOutlined,
  ExportOutlined,
  PlayCircleOutlined,
  DashboardOutlined,
  BellOutlined,
  ArrowRightOutlined,
} from "@ant-design/icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui";
import {
  OPERATOR_DESKTOP,
  operatorDesktopClass,
} from "@/constants/operatorDesktopSizes";
import { useAppStore } from "@/store/useAppStore";
import { useWarehouses } from "@/hooks/useWarehouse";
import {
  MOCK_AGV_NODES_LEFT,
  MOCK_AGV_NODES_RIGHT,
  MOCK_AGV_UNITS,
  MOCK_OPERATOR_ALERTS,
  MOCK_OPERATOR_KPIS,
  MOCK_ROBOT_HOURLY_DATA,
} from "@/data/mockOperatorOverview";

const KPI_ICON = {
  inbound: CloudDownloadOutlined,
  outbound: ExportOutlined,
  agv: PlayCircleOutlined,
  scada: DashboardOutlined,
} as const;

const ALERT_BG = {
  red: "bg-error-50 border-error-200",
  yellow: "bg-warning-50 border-warning-200",
  green: "bg-success-50 border-success-200",
} as const;

const ROBOT_CHART_MARGIN = { top: 4, right: 4, left: -12, bottom: 0 };
const ROBOT_AXIS_TICK = { fontSize: 12, fill: "#6b7280" };
const ROBOT_LEGEND_STYLE = { fontSize: 11 };

export default function OperatorOverviewPage() {
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);
  const { data: warehouses } = useWarehouses();
  const warehouseName =
    warehouses?.find((z) => z.id === selectedWarehouseId)?.name ?? "Kho được gán";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-4xl font-black text-brand-dark">
          Tổng quan vận hành
        </h2>
        <span className="text-sm text-slate-500 shrink-0">{warehouseName}</span>
      </div>

      {/* KPI — chữ trung tính */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {MOCK_OPERATOR_KPIS.map((card) => {
          const Icon = KPI_ICON[card.icon];
          return (
            <Card key={card.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="mt-2 text-3xl font-bold tracking-tight text-brand-dark">
                    {card.value}
                  </p>
                </div>
                <div
                  className={`flex ${operatorDesktopClass.iconBox} shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500`}
                >
                  <Icon className="text-xl" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Bản đồ AGV */}
        <Card className="xl:col-span-2 !p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-stripe-hairline px-5 py-4">
            <h3 className="text-2xl font-extrabold uppercase tracking-[0.08em] text-brand-dark">
              Mô phỏng bản đồ AGV trực tuyến
            </h3>
            <span className="rounded-full border border-stripe-hairline bg-slate-50 px-3 py-1 text-xs font-medium tabular-nums text-slate-500">
              X: 120m | Y: 80m
            </span>
          </div>

          <div className="relative bg-industrial-pattern px-5 py-8 sm:px-8 sm:py-10">
            <div className="relative mx-auto flex max-w-3xl items-center justify-between gap-4">
              <div className="flex w-16 flex-col gap-3 sm:w-20">
                {MOCK_AGV_NODES_LEFT.map((node) => (
                  <div
                    key={node}
                    className="flex h-12 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold tracking-wide text-slate-600 shadow-stripe-1"
                  >
                    {node}
                  </div>
                ))}
              </div>

              <div className="relative min-h-[220px] flex-1">
                <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-slate-300" />

                {MOCK_AGV_UNITS.map((agv) => (
                  <div
                    key={agv.id}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${agv.position}%` }}
                  >
                    <div className="rounded-lg bg-brand-primary px-2.5 py-1.5 text-xs font-bold text-white shadow-md">
                      {agv.id}
                    </div>
                    <div className="mx-auto mt-1 h-2 w-2 rounded-full bg-brand-primary/70" />
                  </div>
                ))}

                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                  Lane main
                </div>
              </div>

              <div className="flex w-16 flex-col gap-3 sm:w-20">
                {MOCK_AGV_NODES_RIGHT.map((node) => (
                  <div
                    key={node}
                    className="flex h-12 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold tracking-wide text-slate-600 shadow-stripe-1"
                  >
                    {node}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Thông báo — nền theo mức độ đỏ / vàng / xanh */}
        <Card className="!p-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-stripe-hairline px-5 py-4">
            <h3 className="text-2xl font-extrabold uppercase tracking-[0.08em] text-brand-dark">
              Hệ thống thông báo
            </h3>
            <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <BellOutlined />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-error-500" />
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-4">
            {MOCK_OPERATOR_ALERTS.map((alert) => (
              <div
                key={alert.id}
                className={`rounded-xl border px-3.5 py-3 ${ALERT_BG[alert.level]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug text-brand-dark">
                    {alert.title}
                  </p>
                  <time className="shrink-0 text-[11px] tabular-nums text-slate-500">
                    {alert.time}
                  </time>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {alert.body}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t border-stripe-hairline p-4">
            <Link
              to="/export"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-stripe-primary-deep"
            >
              Đến trang xuất hàng
              <ArrowRightOutlined className="text-sm" />
            </Link>
          </div>
        </Card>
      </div>

      {/* 3 biểu đồ robot — copy từ ReportPage admin */}
      <div>
        <h3 className="mb-4 text-3xl font-black text-brand-dark">
          Hiệu suất robot
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <h4 className="mb-4 text-base font-bold text-brand-dark">
              Có tải / Không tải
            </h4>
            <ResponsiveContainer
              width="100%"
              height={OPERATOR_DESKTOP.chartHeight}
            >
              <BarChart
                data={MOCK_ROBOT_HOURLY_DATA}
                margin={ROBOT_CHART_MARGIN}
                barGap={1}
                barCategoryGap="18%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={ROBOT_AXIS_TICK} interval={3} />
                <YAxis tick={ROBOT_AXIS_TICK} />
                <Tooltip formatter={(value, name) => [`${value} lần`, name]} />
                <Legend wrapperStyle={ROBOT_LEGEND_STYLE} />
                <Bar
                  dataKey="coTai"
                  name="Có tải"
                  fill="#168C87"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={10}
                />
                <Bar
                  dataKey="khongTai"
                  name="Không tải"
                  fill="#17363A"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={10}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h4 className="mb-4 text-base font-bold text-brand-dark">
              Hiệu xuất
            </h4>
            <ResponsiveContainer
              width="100%"
              height={OPERATOR_DESKTOP.chartHeight}
            >
              <LineChart
                data={MOCK_ROBOT_HOURLY_DATA}
                margin={ROBOT_CHART_MARGIN}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={ROBOT_AXIS_TICK} interval={3} />
                <YAxis
                  tick={ROBOT_AXIS_TICK}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip formatter={(value) => [`${value}%`, "Hiệu xuất"]} />
                <Legend wrapperStyle={ROBOT_LEGEND_STYLE} />
                <Line
                  type="monotone"
                  dataKey="hieuXuat"
                  name="Hiệu xuất"
                  stroke="#168C87"
                  strokeWidth={2}
                  dot={{ r: 2, fill: "#168C87", strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: "#168C87" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h4 className="mb-4 text-base font-bold text-brand-dark">
              Thành công / Thất bại
            </h4>
            <ResponsiveContainer
              width="100%"
              height={OPERATOR_DESKTOP.chartHeight}
            >
              <ComposedChart
                data={MOCK_ROBOT_HOURLY_DATA}
                margin={ROBOT_CHART_MARGIN}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={ROBOT_AXIS_TICK} interval={3} />
                <YAxis yAxisId="left" tick={ROBOT_AXIS_TICK} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={ROBOT_AXIS_TICK}
                />
                <Tooltip formatter={(value, name) => [`${value} lần`, name]} />
                <Legend wrapperStyle={ROBOT_LEGEND_STYLE} />
                <Bar
                  yAxisId="left"
                  dataKey="thanhCong"
                  name="Thành công"
                  fill="#168C87"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={12}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="thatBai"
                  name="Thất bại"
                  stroke="#2F8FD8"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 2, fill: "#2F8FD8", strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: "#2F8FD8" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    </div>
  );
}
