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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Segmented, Spin } from 'antd'
import { Card } from '@/components/ui'
import { useAppStore } from '@/store/useAppStore'
import {
  useReportKpis,
  useReportStockAging,
  useReportStockAgingBucket,
  useReportTopProducts,
  useReportTrends,
} from '@/hooks/useDashboard'
import type {
  StockAgingBucketKey,
  StockAgingRow,
  TopProductsPeriod,
  TrendGranularity,
} from '@/types/dashboard'
import { formatInventoryValue, formatKpiNumber } from '@/utils/formatKpi'
import { parseQuantity } from '@/utils/formatQuantity'

const KPI_CARD_META = [
  {
    label: 'Tổng đơn nhập',
    color: '#3aa6a6',
    key: 'total_inbound_orders' as const,
    to: '/import',
  },
  {
    label: 'Tổng đơn xuất',
    color: '#0f3d46',
    key: 'total_outbound_orders' as const,
    to: '/export',
  },
  {
    label: 'Giá trị tồn kho',
    color: '#0f3460',
    key: 'total_inventory_value' as const,
    to: '/items',
  },
  {
    label: 'Cảnh báo',
    color: '#6b7280',
    key: 'unsolved_notifications' as const,
    to: '/notification',
  },
]

const TOP_PRODUCT_CHARTS = [
  { key: 'inbound_top' as const, title: 'Nhập nhiều', fill: '#3aa6a6' },
  { key: 'outbound_top' as const, title: 'Xuất nhiều', fill: '#0f3d46' },
  { key: 'stock_top' as const, title: 'Tồn nhiều', fill: '#0f3460' },
] as const

const STOCK_AGING_BUCKET_COLORS: Record<StockAgingBucketKey, string> = {
  lte_30: '#3aa6a6',
  days_31_60: '#0f3d46',
  gt_60: '#0f3460',
}

function formatStockCreatedAt(iso: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

function formatLotPreview(lot: string | null) {
  const trimmed = lot?.trim()
  if (!trimmed || trimmed === '/') return '—'
  return trimmed
}

function StockAgingRowList({
  rows,
  emptyText,
}: {
  rows: StockAgingRow[]
  emptyText: string
}) {
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-slate-400">{emptyText}</p>
  }
  return (
    <ul className="max-h-[380px] space-y-2 overflow-y-auto pr-1 text-sm">
      {rows.map((row) => (
        <li
          key={row.item_stock_id}
          className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
        >
          <p className="font-medium text-brand-dark truncate" title={row.sku}>
            {row.sku}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            <span>
              <span className="text-slate-400">Lot</span>{' '}
              {formatLotPreview(row.lot)}
            </span>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <span>
              <span className="text-slate-400">SL</span>{' '}
              {formatKpiNumber(parseQuantity(row.quantity))}
            </span>
            <span className="text-slate-300" aria-hidden>
              ·
            </span>
            <span>
              <span className="text-slate-400">Tạo</span>{' '}
              {formatStockCreatedAt(row.created_at)} — {row.holding_days} ngày
            </span>
          </p>
        </li>
      ))}
    </ul>
  )
}

function formatKpiValue(
  key: (typeof KPI_CARD_META)[number]['key'],
  kpis: ReturnType<typeof useReportKpis>['data'],
) {
  if (!kpis) return '—'
  if (key === 'total_inventory_value') {
    return formatInventoryValue(kpis.total_inventory_value)
  }
  return formatKpiNumber(kpis[key])
}

type TrendChartRow = {
  label: string
  nhap: number
  xuat: number
  tonQuantity: number
  tonValue: number
}

const TREND_AXIS_TICK = { fontSize: 11, fill: '#6b7280' }

function trendXAxisProps(granularity: TrendGranularity) {
  return {
    dataKey: 'label' as const,
    tick: TREND_AXIS_TICK,
    interval: 0 as const,
    angle: granularity === 'week' ? -25 : 0,
    textAnchor: (granularity === 'week' ? 'end' : 'middle') as 'end' | 'middle',
    height: granularity === 'week' ? 56 : 30,
  }
}

function OrdersTrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { dataKey: string; value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const byKey = Object.fromEntries(payload.map((p) => [p.dataKey, p.value]))
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-slate-800 mb-1">{label}</p>
      <p className="text-[#3aa6a6]">Nhập kho: {formatKpiNumber(byKey.nhap ?? 0)}</p>
      <p className="text-[#0f3d46]">Xuất kho: {formatKpiNumber(byKey.xuat ?? 0)}</p>
    </div>
  )
}

function InventoryTrendTooltip({
  active,
  payload,
  label,
  granularity,
}: {
  active?: boolean
  payload?: { dataKey: string; value: number }[]
  label?: string
  granularity: TrendGranularity
}) {
  if (!active || !payload?.length) return null
  const byKey = Object.fromEntries(payload.map((p) => [p.dataKey, p.value]))
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-semibold text-slate-800 mb-1">{label}</p>
      <p className="text-[#2563eb]">
        SL tồn: {formatKpiNumber(byKey.tonQuantity ?? 0)}
      </p>
      <p className="text-[#9333ea]">
        Giá trị tồn: {formatInventoryValue(byKey.tonValue ?? 0)}
      </p>
      {granularity === 'week' && (
        <p className="text-xs text-slate-400 mt-1">
          Tồn tuần = tổng theo ngày trong tuần
        </p>
      )}
    </div>
  )
}

function HorizontalBarChart({
  title,
  data,
  fill,
}: {
  title: string
  data: { name: string; value: number }[]
  fill: string
}) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm h-full">
      <h3 className="mb-4 text-base font-semibold text-brand-dark">{title}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={{ fontSize: 12, fill: '#374151' }}
          />
          <Tooltip />
          <Bar dataKey="value" name="Số lượng" fill={fill} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function OrdersTrendChart({
  data,
  granularity,
  yMax,
}: {
  data: TrendChartRow[]
  granularity: TrendGranularity
  yMax: number
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
        <XAxis {...trendXAxisProps(granularity)} />
        <YAxis
          tick={{ fontSize: 12, fill: '#6b7280' }}
          domain={[0, yMax]}
          allowDataOverflow
        />
        <Tooltip content={<OrdersTrendTooltip />} />
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
  )
}

function InventoryTrendChart({
  data,
  granularity,
}: {
  data: TrendChartRow[]
  granularity: TrendGranularity
}) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis {...trendXAxisProps(granularity)} />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickFormatter={(v) => formatKpiNumber(v)}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickFormatter={(v) =>
            new Intl.NumberFormat('vi-VN', {
              notation: 'compact',
              maximumFractionDigits: 1,
            }).format(Number(v))
          }
        />
        <Tooltip
          content={<InventoryTrendTooltip granularity={granularity} />}
        />
        <Legend />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="tonQuantity"
          name="SL tồn"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="tonValue"
          name="Giá trị tồn"
          stroke="#9333ea"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export default function ReportPage() {
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId)
  const warehouseId = selectedWarehouseId || 0
  const [trendGranularity, setTrendGranularity] =
    useState<TrendGranularity>('day')
  const [topProductsPeriod, setTopProductsPeriod] =
    useState<TopProductsPeriod>('week')
  const { data: kpis, isLoading, isFetching } = useReportKpis(warehouseId)
  const {
    data: trends,
    isLoading: isTrendLoading,
  } = useReportTrends(warehouseId, trendGranularity)
  const {
    data: topProducts,
    isLoading: isTopProductsLoading,
  } = useReportTopProducts(warehouseId, topProductsPeriod)
  const [selectedAgingBucket, setSelectedAgingBucket] =
    useState<StockAgingBucketKey | null>(null)
  const {
    data: stockAging,
    isLoading: isStockAgingLoading,
  } = useReportStockAging(warehouseId)
  const {
    data: agingBucketDetail,
    isLoading: isAgingBucketLoading,
  } = useReportStockAgingBucket(warehouseId, selectedAgingBucket)

  useEffect(() => {
    setSelectedAgingBucket(null)
  }, [warehouseId])

  useEffect(() => {
    if (!stockAging?.buckets?.length) return
    setSelectedAgingBucket((prev) => {
      if (prev && stockAging.buckets.some((b) => b.key === prev)) return prev
      return stockAging.buckets.reduce((best, b) =>
        parseQuantity(b.total_quantity) > parseQuantity(best.total_quantity)
          ? b
          : best,
      ).key
    })
  }, [stockAging])

  const stockAgingPieData = useMemo(() => {
    if (!stockAging?.buckets?.length) return []
    return stockAging.buckets.map((b) => ({
      key: b.key,
      name: b.label,
      value: parseQuantity(b.total_quantity),
      sharePercent: b.percent,
      color: STOCK_AGING_BUCKET_COLORS[b.key],
    }))
  }, [stockAging])

  const trendChartData = useMemo<TrendChartRow[]>(() => {
    if (!trends?.points?.length) return []
    return trends.points.map((point) => ({
      label: point.label,
      nhap: point.inbound_orders,
      xuat: point.outbound_orders,
      tonQuantity: parseQuantity(point.inventory_quantity),
      tonValue: parseQuantity(point.inventory_value),
    }))
  }, [trends])

  const ordersYMax = useMemo(() => {
    if (!trendChartData.length) return 2
    const peak = Math.max(
      ...trendChartData.flatMap((d) => [d.nhap, d.xuat]),
    )
    return peak + 2
  }, [trendChartData])

  const kpiCards = useMemo(
    () =>
      KPI_CARD_META.map((card) => ({
        ...card,
        value: warehouseId ? formatKpiValue(card.key, kpis) : '—',
      })),
    [kpis, warehouseId],
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-brand-dark">Báo cáo</h2>
        <span className="text-sm text-gray-400">Tháng 6 / 2026</span>
      </div>

      {!warehouseId ? (
        <Card className="p-6 text-center text-slate-500">
          Vui lòng chọn kho để xem KPI báo cáo
        </Card>
      ) : (
        <Spin spinning={isLoading && !kpis}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpiCards.map((card) => (
              <NavLink
                key={card.label}
                to={card.to}
                className="block rounded-xl transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                title={`Xem ${card.label.toLowerCase()}`}
              >
                <Card className="h-full cursor-pointer hover:border-slate-200">
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p
                    className={`mt-2 text-3xl font-bold ${isFetching && kpis ? 'opacity-70' : ''}`}
                    style={{ color: card.color }}
                  >
                    {card.value}
                  </p>
                </Card>
              </NavLink>
            ))}
          </div>
        </Spin>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-brand-dark">Xu hướng kho</h3>
          <Segmented
            value={trendGranularity}
            onChange={(value) => setTrendGranularity(value as TrendGranularity)}
            options={[
              { label: '12 ngày', value: 'day' },
              { label: '12 tuần', value: 'week' },
            ]}
            disabled={!warehouseId}
          />
        </div>
        {!warehouseId ? (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="py-12 text-center text-slate-500">
              Vui lòng chọn kho để xem biểu đồ xu hướng
            </p>
          </div>
        ) : (
          <Spin spinning={isTrendLoading && !trends}>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <h4 className="mb-4 text-sm font-semibold text-brand-dark">
                  Đơn nhập / xuất
                </h4>
                <OrdersTrendChart
                  data={trendChartData}
                  granularity={trendGranularity}
                  yMax={ordersYMax}
                />
              </div>
              <div className="rounded-xl bg-white p-5 shadow-sm">
                <h4 className="mb-4 text-sm font-semibold text-brand-dark">
                  Tồn kho (SL & giá trị)
                </h4>
                <InventoryTrendChart
                  data={trendChartData}
                  granularity={trendGranularity}
                />
              </div>
            </div>
          </Spin>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-brand-dark">
            Top 5 sản phẩm
          </h3>
          <Segmented
            value={topProductsPeriod}
            onChange={(value) =>
              setTopProductsPeriod(value as TopProductsPeriod)
            }
            options={[
              { label: '1 tuần', value: 'week' },
              { label: '1 tháng', value: 'month' },
            ]}
            disabled={!warehouseId}
          />
        </div>
        {!warehouseId ? (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="py-12 text-center text-slate-500">
              Vui lòng chọn kho để xem top sản phẩm
            </p>
          </div>
        ) : (
          <Spin spinning={isTopProductsLoading && !topProducts}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {TOP_PRODUCT_CHARTS.map((chart) => {
                const rows = topProducts?.[chart.key] ?? []
                const data = rows.map((row) => ({
                  name: row.label,
                  value: row.total_quantity,
                }))
                return (
                  <HorizontalBarChart
                    key={chart.key}
                    title={chart.title}
                    data={data}
                    fill={chart.fill}
                  />
                )
              })}
            </div>
          </Spin>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm w-full">
        <h3 className="mb-4 text-base font-semibold text-brand-dark">
          Tỉ lệ thời gian tồn hàng
        </h3>
        {!warehouseId ? (
          <p className="py-12 text-center text-slate-500">
            Vui lòng chọn kho để xem tỉ lệ thời gian tồn hàng
          </p>
        ) : (
          <Spin spinning={isStockAgingLoading && !stockAging}>
            <div className="grid min-h-[440px] grid-cols-1 gap-6 md:grid-cols-[3fr_4fr_3fr]">
              <div className="min-h-[200px] md:min-h-[440px]">
                <h4 className="mb-3 text-sm font-semibold text-brand-dark">
                  Tồn lâu nhất
                </h4>
                <StockAgingRowList
                  rows={stockAging?.longest_holding ?? []}
                  emptyText="Chưa có tồn hợp lệ"
                />
              </div>
              <div className="flex min-h-[360px] items-center justify-center px-4 py-4 md:min-h-[440px] md:px-6 md:py-6 [&_.recharts-wrapper]:!overflow-visible [&_.recharts-surface]:overflow-visible">
                {stockAgingPieData.every((d) => d.value <= 0) ? (
                  <p className="text-sm text-slate-400">Không có dữ liệu tồn</p>
                ) : (
                  <div className="flex w-full max-w-sm flex-col items-center">
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                        <Pie
                          data={stockAgingPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={0}
                          outerRadius={118}
                          paddingAngle={2}
                          label={false}
                          labelLine={false}
                          onClick={(_, index) => {
                            const slice = stockAgingPieData[index]
                            if (slice?.key) setSelectedAgingBucket(slice.key)
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          {stockAgingPieData.map((entry) => (
                            <Cell
                              key={entry.key}
                              fill={entry.color}
                              stroke={
                                selectedAgingBucket === entry.key
                                  ? '#1e293b'
                                  : '#fff'
                              }
                              strokeWidth={
                                selectedAgingBucket === entry.key ? 2 : 1
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, _name, item) => {
                            const p = item?.payload as {
                              sharePercent?: number
                              name?: string
                            }
                            const share = Number(p?.sharePercent ?? 0)
                            return [
                              `${formatKpiNumber(Number(value ?? 0))} (${share.toFixed(1)}%)`,
                              p?.name ?? 'Số lượng',
                            ]
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul
                      className="mt-3 w-full space-y-2 border-t border-slate-100 pt-3"
                      aria-label="Chú thích biểu đồ tồn hàng"
                    >
                      {stockAgingPieData.map((entry) => (
                        <li key={entry.key}>
                          <button
                            type="button"
                            onClick={() => setSelectedAgingBucket(entry.key)}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                              selectedAgingBucket === entry.key
                                ? 'bg-slate-100 ring-1 ring-slate-200'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="font-medium text-slate-700 truncate">
                                {entry.name}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-600">
                              {entry.sharePercent.toFixed(0)}%
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="min-h-[200px] md:min-h-[440px]">
                <h4 className="mb-3 text-sm font-semibold text-brand-dark">
                  Chi tiết nhóm
                </h4>
                <div className="mb-3 flex flex-wrap gap-2">
                  {stockAging?.buckets.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setSelectedAgingBucket(b.key)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        selectedAgingBucket === b.key
                          ? 'border-brand-primary bg-brand-primary/10 text-brand-dark'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                <Spin spinning={isAgingBucketLoading && !agingBucketDetail}>
                  <StockAgingRowList
                    rows={agingBucketDetail?.items ?? []}
                    emptyText="Không có dòng trong nhóm này"
                  />
                </Spin>
              </div>
            </div>
          </Spin>
        )}
      </div>
    </div>
  )
}
