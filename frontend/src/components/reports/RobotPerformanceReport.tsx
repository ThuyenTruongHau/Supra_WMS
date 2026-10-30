import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { DatePicker, Select, Segmented, Spin } from 'antd'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button, Card, Table } from '@/components/ui'
import { useRobotPerformance } from '@/hooks/useDashboard'
import type { RobotPerformanceByRobot, RobotTaskKind } from '@/types/dashboard'
import { getApiErrorDetail } from '@/types/apiError'
import {
  buildRobotSpeedSeries,
  robotReportRange,
  robotReportToday,
} from '@/utils/robotPerformance'

const KINDS = [
  { key: 'inbound', label: 'Nhập', color: '#3aa6a6' },
  { key: 'outbound', label: 'Xuất ra VT', color: '#0f3d46' },
  { key: 'return', label: 'Hoàn trả', color: '#818cf8' },
] as const
const SPEED_COLORS = [
  '#3aa6a6',
  '#2563eb',
  '#9333ea',
  '#d97706',
  '#db2777',
  '#475569',
]
const INCOMPLETE = 'Chưa đủ dữ liệu'
const number = (value: number | null | undefined, digits = 0) =>
  value == null
    ? INCOMPLETE
    : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(
        value,
      )
const coverage = (row: RobotPerformanceByRobot) =>
  `${row.speed_eligible_count}/${row.completed_count} (${number(row.speed_coverage_percent, 1)}${row.speed_coverage_percent == null ? '' : '%'})`

function ChartCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="min-w-0 p-5">
      <h4 className="mb-4 font-semibold text-brand-dark">{title}</h4>
      {children}
    </Card>
  )
}

export default function RobotPerformanceReport({
  warehouseId,
}: {
  warehouseId: number
}) {
  const [period, setPeriod] = useState<'day' | 'week' | 'timeline'>('week')
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [device, setDevice] = useState<string | undefined>()
  const [kind, setKind] = useState<RobotTaskKind | undefined>()
  const [today, setToday] = useState(() => robotReportToday())
  useEffect(() => {
    const refreshDate = () => {
      if (document.visibilityState === 'visible') setToday(robotReportToday())
    }
    const interval = window.setInterval(refreshDate, 30_000)
    document.addEventListener('visibilitychange', refreshDate)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshDate)
    }
  }, [])
  const range =
    period === 'timeline' && customRange
      ? {
          start_date: customRange[0].format('YYYY-MM-DD'),
          end_date: customRange[1].format('YYYY-MM-DD'),
        }
      : robotReportRange(
          period === 'day' ? 'day' : 'week',
          new Date(`${today}T00:00:00+07:00`),
        )
  const needsRange = period === 'timeline' && customRange === null
  const { data, isLoading, isFetching, isError, error, refetch } =
    useRobotPerformance(
      warehouseId,
      { ...range, device_num: device, task_kind: kind },
      !needsRange,
    )
  const speed = data ? buildRobotSpeedSeries(data) : { robots: [], points: [] }
  const summary = data?.summary
  const hasTasks =
    summary &&
    summary.completed_count + summary.failed_count + summary.cancelled_count > 0
  const hasSpeed = data?.robots.some(
    (robot) => robot.device_num !== null && robot.average_speed_mps !== null,
  )
  const cards = summary
    ? [
        {
          label: 'Lệnh hoàn thành',
          value: number(summary.completed_count),
          hint: '',
        },
        {
          label: 'Quãng đường ghi nhận (m)',
          value: number(summary.distance_m, 3),
          // hint: `${summary.distance_count}/${summary.completed_count} lệnh có quãng đường`,
        },
        {
          label: 'Tốc độ trung bình theo lệnh (m/s)',
          value: number(summary.average_speed_mps, 3),
          // hint: `${summary.speed_eligible_count}/${summary.completed_count} lệnh dùng tính tốc độ`,
        },
        // {
        //   label: 'Lệnh đủ dữ liệu tính tốc độ',
        //   value:
        //     summary.speed_coverage_percent == null
        //       ? INCOMPLETE
        //       : `${number(summary.speed_coverage_percent, 1)}%`,
        //   hint: `${summary.speed_eligible_count}/${summary.completed_count} lệnh hoàn thành`,
        // },
      ]
    : []

  return (
    <section className="space-y-4" aria-label="Hiệu suất robot">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-brand-dark">
          Hiệu suất robot
        </h3>
        {isFetching && data && (
          <span className="text-xs text-slate-500" role="status">
            Đang cập nhật...
          </span>
        )}
      </div>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            aria-label="Kỳ báo cáo robot"
            value={period}
            disabled={!warehouseId}
            options={[
              { label: 'Hôm nay', value: 'day' },
              { label: '7 ngày gần nhất', value: 'week' },
              { label: 'Khoảng ngày', value: 'timeline' },
            ]}
            onChange={(value) => setPeriod(value as typeof period)}
          />
          {period === 'timeline' && (
            <DatePicker.RangePicker
              aria-label="Khoảng ngày báo cáo robot"
              format="DD/MM/YYYY"
              value={customRange}
              placeholder={['Từ ngày', 'Đến ngày']}
              disabled={!warehouseId}
              onChange={(dates) =>
                setCustomRange(
                  dates?.[0] && dates[1] ? [dates[0], dates[1]] : null,
                )
              }
            />
          )}
          <Select
            aria-label="Lọc robot"
            className="min-w-44"
            placeholder="Tất cả robot"
            allowClear
            value={device}
            disabled={!warehouseId || needsRange}
            options={[
              ...new Set([
                ...(data?.devices ?? []),
                ...(device ? [device] : []),
              ]),
            ].map((value) => ({ value, label: value }))}
            onChange={setDevice}
          />
          <Select
            aria-label="Loại lệnh robot"
            className="min-w-44"
            placeholder="Tất cả loại lệnh"
            allowClear
            value={kind}
            disabled={!warehouseId}
            options={KINDS.map((entry) => ({
              value: entry.key,
              label: entry.label,
            }))}
            onChange={setKind}
          />
        </div>
        <p className="text-xs text-slate-500">
          {!needsRange &&
            `${dayjs(range.start_date).format('DD/MM/YYYY')} – ${dayjs(range.end_date).format('DD/MM/YYYY')} · `}
          Giờ Việt Nam · Quãng đường tính từ bản đồ; thời gian lệnh có thể bao
          gồm chờ và thao tác. Một lệnh xuất ra VT được tính một lần dù chia
          hàng cho nhiều ô CC.
        </p>
      </Card>
      {!warehouseId ? (
        <Card className="p-6 text-center text-slate-500">
          Vui lòng chọn kho để xem hiệu suất robot.
        </Card>
      ) : needsRange ? (
        <Card className="p-6 text-center text-slate-500">
          Vui lòng chọn khoảng ngày báo cáo.
        </Card>
      ) : (
        <>
          {isError && (
            <Card
              className="flex flex-wrap items-center justify-between gap-3 p-4"
              role="alert"
            >
              <p className="text-red-600">
                {getApiErrorDetail(error, 'Không thể tải hiệu suất robot.')}
              </p>
              <Button variant="secondary" onClick={() => void refetch()}>
                Thử lại
              </Button>
            </Card>
          )}
          <Spin spinning={isLoading}>
            {isLoading && !data ? (
              <div
                className="h-40"
                role="status"
                aria-label="Đang tải hiệu suất robot"
              />
            ) : (
              data && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {cards.map((card) => (
                      <Card key={card.label} className="p-5">
                        <p className="text-sm text-slate-500">{card.label}</p>
                        <p className="mt-2 text-2xl font-bold text-brand-dark">
                          {card.value}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {card.hint}
                        </p>
                      </Card>
                    ))}
                  </div>
                  {!hasTasks ? (
                    <Card className="p-8 text-center text-slate-500">
                      Không có lệnh robot kết thúc trong kỳ và bộ lọc đã chọn.
                    </Card>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <ChartCard title="Lệnh hoàn thành theo thời gian">
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart
                              data={data.points}
                              margin={{ left: 0, right: 12 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                              />
                              <XAxis
                                dataKey="label"
                                tick={{ fontSize: 11 }}
                                minTickGap={20}
                              />
                              <YAxis allowDecimals={false} width={44} />
                              <Tooltip />
                              <Legend />
                              {KINDS.map((entry) => (
                                <Bar
                                  key={entry.key}
                                  dataKey={`${entry.key}_completed`}
                                  name={entry.label}
                                  stackId="commands"
                                  fill={entry.color}
                                />
                              ))}
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartCard>
                        <ChartCard title="Quãng đường ghi nhận theo robot (m)">
                          {summary?.distance_m == null ? (
                            <p className="flex h-[300px] items-center justify-center text-sm text-slate-500">
                              Chưa đủ dữ liệu quãng đường.
                            </p>
                          ) : (
                            <ResponsiveContainer width="100%" height={300}>
                              <BarChart
                                data={data.robots.map((robot) => ({
                                  ...robot,
                                  name: robot.device_num ?? 'Chưa xác định',
                                }))}
                                margin={{ left: 0, right: 12 }}
                              >
                                <CartesianGrid
                                  strokeDasharray="3 3"
                                  vertical={false}
                                />
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis width={60} />
                                <Tooltip
                                  content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null
                                    const row = payload[0]
                                      .payload as RobotPerformanceByRobot
                                    return (
                                      <div className="rounded-lg border bg-white p-3 text-sm shadow">
                                        <p className="font-semibold">{label}</p>
                                        {KINDS.map((entry) => (
                                          <p
                                            key={entry.key}
                                            style={{ color: entry.color }}
                                          >
                                            {entry.label}:{' '}
                                            {number(
                                              row[`${entry.key}_distance_m`],
                                              3,
                                            )}
                                            {row[`${entry.key}_distance_m`] ==
                                            null
                                              ? ''
                                              : ' m'}
                                          </p>
                                        ))}
                                        <p className="mt-1 text-xs text-slate-500">
                                          {row.distance_count}/
                                          {row.completed_count} lệnh có quãng
                                          đường
                                        </p>
                                      </div>
                                    )
                                  }}
                                />
                                <Legend />
                                {KINDS.map((entry) => (
                                  <Bar
                                    key={entry.key}
                                    dataKey={`${entry.key}_distance_m`}
                                    name={entry.label}
                                    stackId="distance"
                                    fill={entry.color}
                                  />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </ChartCard>
                      </div>
                      <ChartCard title="Tốc độ trung bình theo lệnh (m/s)">
                        {!hasSpeed ? (
                          <p className="flex h-[300px] items-center justify-center text-sm text-slate-500">
                            Chưa đủ dữ liệu tốc độ cho robot xác định được.
                          </p>
                        ) : (
                          <ResponsiveContainer width="100%" height={300}>
                            <LineChart
                              data={speed.points}
                              margin={{ left: 0, right: 16 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                dataKey="label"
                                tick={{ fontSize: 11 }}
                                minTickGap={20}
                              />
                              <YAxis
                                width={60}
                                tickFormatter={(value) => number(value, 2)}
                              />
                              <Tooltip
                                filterNull={false}
                                content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null
                                  const row = payload[0]
                                    .payload as (typeof speed.points)[number]
                                  return (
                                    <div className="max-h-72 overflow-y-auto rounded-lg border bg-white p-3 text-sm shadow">
                                      <p className="mb-1 font-semibold">
                                        {label}
                                      </p>
                                      {speed.robots.map((robot, index) => {
                                        const metrics = row.point.robots.find(
                                          (entry) =>
                                            entry.device_num === robot.device,
                                        )
                                        return (
                                          <p
                                            key={robot.key}
                                            style={{
                                              color:
                                                SPEED_COLORS[
                                                  index % SPEED_COLORS.length
                                                ],
                                            }}
                                          >
                                            {robot.device}:{' '}
                                            {number(
                                              metrics?.average_speed_mps,
                                              3,
                                            )}
                                            {metrics?.average_speed_mps == null
                                              ? ''
                                              : ' m/s'}
                                            <span className="ml-2 text-xs">
                                              (
                                              {metrics?.speed_eligible_count ??
                                                0}
                                              /{metrics?.completed_count ?? 0}{' '}
                                              lệnh)
                                            </span>
                                          </p>
                                        )
                                      })}
                                    </div>
                                  )
                                }}
                              />
                              <Legend />
                              {speed.robots.map((robot, index) => (
                                <Line
                                  key={robot.key}
                                  dataKey={robot.key}
                                  name={robot.device}
                                  stroke={
                                    SPEED_COLORS[index % SPEED_COLORS.length]
                                  }
                                  strokeWidth={2}
                                  type="linear"
                                  connectNulls={false}
                                  dot={{ r: 3 }}
                                />
                              ))}
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                        {/* <p className="mt-2 text-xs text-slate-500">
                          Tốc độ = tổng quãng đường / tổng thời gian của các
                          lệnh đủ dữ liệu. Khoảng thiếu dữ liệu được để trống.
                        </p> */}
                      </ChartCard>
                      <Card className="min-w-0 p-5">
                        <h4 className="mb-4 font-semibold text-brand-dark">
                          Tổng hợp theo robot
                        </h4>
                        <Table<RobotPerformanceByRobot>
                          size="small"
                          rowKey={(row) =>
                            row.device_num === null
                              ? 'unknown'
                              : `device:${row.device_num}`
                          }
                          dataSource={data.robots}
                          pagination={false}
                          scroll={{ x: 1350 }}
                          columns={[
                            {
                              title: 'Robot',
                              dataIndex: 'device_num',
                              fixed: 'left',
                              render: (value) => value ?? 'Chưa xác định',
                            },
                            ...KINDS.map((entry) => ({
                              title: entry.label,
                              dataIndex: `${entry.key}_completed`,
                            })),
                            {
                              title: 'Tổng hoàn thành',
                              dataIndex: 'completed_count',
                            },
                            { title: 'Thất bại', dataIndex: 'failed_count' },
                            { title: 'Hủy', dataIndex: 'cancelled_count' },
                            {
                              title: 'Quãng đường (m)',
                              dataIndex: 'distance_m',
                              render: (value) => number(value, 3),
                            },
                            // {
                            //   title: 'Có quãng đường',
                            //   render: (_, row) =>
                            //     `${row.distance_count}/${row.completed_count}`,
                            // },
                            {
                              title: 'Thời gian (phút)',
                              render: (_, row) =>
                                row.speed_eligible_count
                                  ? number(row.duration_seconds / 60, 2)
                                  : INCOMPLETE,
                            },
                            {
                              title: 'Tốc độ (m/s)',
                              dataIndex: 'average_speed_mps',
                              render: (value) => number(value, 3),
                            },
                            // {
                            //   title: 'Đủ dữ liệu tốc độ',
                            //   render: (_, row) => coverage(row),
                            // },
                          ]}
                        />
                      </Card>
                    </>
                  )}
                </div>
              )
            )}
          </Spin>
        </>
      )}
    </section>
  )
}
