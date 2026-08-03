import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card } from '@/components/ui'

const KPI_CARDS = [
  { label: 'Tổng đơn nhập', value: '1,284', color: '#3aa6a6' },
  { label: 'Tổng đơn xuất', value: '976', color: '#0f3d46' },
  { label: 'Giá trị tồn kho', value: '4.2 tỷ', color: '#0f3460' },
  { label: 'Sản phẩm theo dõi', value: '358 SKU', color: '#6b7280' },
]

const MONTHLY_DATA = [
  { month: 'T1', nhap: 820, xuat: 640 },
  { month: 'T2', nhap: 910, xuat: 720 },
  { month: 'T3', nhap: 880, xuat: 690 },
  { month: 'T4', nhap: 960, xuat: 780 },
  { month: 'T5', nhap: 1020, xuat: 840 },
  { month: 'T6', nhap: 1100, xuat: 900 },
  { month: 'T7', nhap: 980, xuat: 820 },
  { month: 'T8', nhap: 1050, xuat: 870 },
  { month: 'T9', nhap: 1120, xuat: 910 },
  { month: 'T10', nhap: 1180, xuat: 950 },
  { month: 'T11', nhap: 1240, xuat: 980 },
  { month: 'T12', nhap: 1284, xuat: 976 },
]

const TOP_PRODUCTS = [
  { name: 'Thép cuộn', value: 420 },
  { name: 'Xi măng', value: 380 },
  { name: 'Sơn nước', value: 310 },
  { name: 'Ống nhựa', value: 280 },
  { name: 'Cát xây dựng', value: 245 },
]

const WAREHOUSE_DISTRIBUTION = [
  { name: 'Kho nguyên liệu', value: 45, color: '#3aa6a6' },
  { name: 'Kho thành phẩm', value: 35, color: '#0f3d46' },
  { name: 'Kho vật tư', value: 20, color: '#0f3460' },
]

const ROBOT_HOURLY_DATA = [
  { hour: '00h', coTai: 2, khongTai: 8, hieuXuat: 45, thanhCong: 12, thatBai: 1 },
  { hour: '01h', coTai: 1, khongTai: 6, hieuXuat: 42, thanhCong: 8, thatBai: 0 },
  { hour: '02h', coTai: 0, khongTai: 5, hieuXuat: 38, thanhCong: 5, thatBai: 0 },
  { hour: '03h', coTai: 1, khongTai: 4, hieuXuat: 40, thanhCong: 6, thatBai: 1 },
  { hour: '04h', coTai: 3, khongTai: 7, hieuXuat: 48, thanhCong: 14, thatBai: 1 },
  { hour: '05h', coTai: 5, khongTai: 10, hieuXuat: 55, thanhCong: 22, thatBai: 2 },
  { hour: '06h', coTai: 8, khongTai: 12, hieuXuat: 62, thanhCong: 35, thatBai: 2 },
  { hour: '07h', coTai: 14, khongTai: 10, hieuXuat: 72, thanhCong: 48, thatBai: 3 },
  { hour: '08h', coTai: 22, khongTai: 8, hieuXuat: 78, thanhCong: 62, thatBai: 3 },
  { hour: '09h', coTai: 28, khongTai: 6, hieuXuat: 84, thanhCong: 74, thatBai: 4 },
  { hour: '10h', coTai: 32, khongTai: 5, hieuXuat: 88, thanhCong: 82, thatBai: 3 },
  { hour: '11h', coTai: 30, khongTai: 6, hieuXuat: 86, thanhCong: 78, thatBai: 4 },
  { hour: '12h', coTai: 18, khongTai: 12, hieuXuat: 75, thanhCong: 52, thatBai: 2 },
  { hour: '13h', coTai: 26, khongTai: 7, hieuXuat: 82, thanhCong: 68, thatBai: 3 },
  { hour: '14h', coTai: 34, khongTai: 5, hieuXuat: 90, thanhCong: 86, thatBai: 4 },
  { hour: '15h', coTai: 36, khongTai: 4, hieuXuat: 92, thanhCong: 90, thatBai: 3 },
  { hour: '16h', coTai: 33, khongTai: 6, hieuXuat: 89, thanhCong: 84, thatBai: 5 },
  { hour: '17h', coTai: 24, khongTai: 9, hieuXuat: 80, thanhCong: 66, thatBai: 4 },
  { hour: '18h', coTai: 16, khongTai: 11, hieuXuat: 70, thanhCong: 44, thatBai: 3 },
  { hour: '19h', coTai: 10, khongTai: 14, hieuXuat: 62, thanhCong: 32, thatBai: 2 },
  { hour: '20h', coTai: 6, khongTai: 10, hieuXuat: 55, thanhCong: 24, thatBai: 2 },
  { hour: '21h', coTai: 4, khongTai: 8, hieuXuat: 50, thanhCong: 18, thatBai: 1 },
  { hour: '22h', coTai: 3, khongTai: 7, hieuXuat: 47, thanhCong: 14, thatBai: 1 },
  { hour: '23h', coTai: 2, khongTai: 6, hieuXuat: 44, thanhCong: 10, thatBai: 0 },
]

const ROBOT_CHART_MARGIN = { top: 4, right: 4, left: -12, bottom: 0 }
const ROBOT_AXIS_TICK = { fontSize: 12, fill: '#6b7280' }
const ROBOT_LEGEND_STYLE = { fontSize: 11 }

export default function ReportPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-brand-dark">Báo cáo</h2>
        <span className="text-sm text-gray-400">Tháng 6 / 2026</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {KPI_CARDS.map((card) => (
          <Card key={card.label}>
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold" style={{ color: card.color }}>
              {card.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-brand-dark">
          Nhập / Xuất kho theo tháng
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={MONTHLY_DATA} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorNhap" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3aa6a6" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#3aa6a6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorXuat" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0f3d46" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0f3d46" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b7280' }} />
            <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="nhap"
              name="Nhập kho"
              stroke="#3aa6a6"
              fill="url(#colorNhap)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="xuat"
              name="Xuất kho"
              stroke="#0f3d46"
              fill="url(#colorXuat)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-brand-dark">
            Top 5 sản phẩm nhập nhiều
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={TOP_PRODUCTS} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 12, fill: '#374151' }}
              />
              <Tooltip />
              <Bar dataKey="value" name="Số lượng" fill="#3aa6a6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-base font-semibold text-brand-dark">Phân bổ theo kho</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={WAREHOUSE_DISTRIBUTION}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
                nameKey="name"
                label={({ name, value }) => `${name}: ${value}%`}
              >
                {WAREHOUSE_DISTRIBUTION.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => `${value}%`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-base font-semibold text-brand-dark">Hiệu suất robot</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h4 className="mb-4 text-sm font-semibold text-brand-dark">Có tải / Không tải</h4>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={ROBOT_HOURLY_DATA}
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
                  fill="#3aa6a6"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={10}
                />
                <Bar
                  dataKey="khongTai"
                  name="Không tải"
                  fill="#0f3d46"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={10}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h4 className="mb-4 text-sm font-semibold text-brand-dark">Hiệu xuất</h4>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={ROBOT_HOURLY_DATA} margin={ROBOT_CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={ROBOT_AXIS_TICK} interval={3} />
                <YAxis tick={ROBOT_AXIS_TICK} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value) => [`${value}%`, 'Hiệu xuất']} />
                <Legend wrapperStyle={ROBOT_LEGEND_STYLE} />
                <Line
                  type="monotone"
                  dataKey="hieuXuat"
                  name="Hiệu xuất"
                  stroke="#3aa6a6"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#3aa6a6', strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: '#3aa6a6' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h4 className="mb-4 text-sm font-semibold text-brand-dark">Thành công / Thất bại</h4>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={ROBOT_HOURLY_DATA} margin={ROBOT_CHART_MARGIN}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={ROBOT_AXIS_TICK} interval={3} />
                <YAxis yAxisId="left" tick={ROBOT_AXIS_TICK} />
                <YAxis yAxisId="right" orientation="right" tick={ROBOT_AXIS_TICK} />
                <Tooltip formatter={(value, name) => [`${value} lần`, name]} />
                <Legend wrapperStyle={ROBOT_LEGEND_STYLE} />
                <Bar
                  yAxisId="left"
                  dataKey="thanhCong"
                  name="Thành công"
                  fill="#3aa6a6"
                  radius={[2, 2, 0, 0]}
                  maxBarSize={12}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="thatBai"
                  name="Thất bại"
                  stroke="#0f3460"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 2, fill: '#0f3460', strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: '#0f3460' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
