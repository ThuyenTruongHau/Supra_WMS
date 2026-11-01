import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeftOutlined, ArrowRightOutlined, ExportOutlined, ReloadOutlined } from '@ant-design/icons'
import { Pagination, Segmented, Spin } from 'antd'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  getOutboundOrderProgressApi,
  getOutboundOrderProgressGroupDetailsApi,
  getOutboundOrdersApi,
} from '@/api/outboundOrder'
import { Button, cn } from '@/components/ui'
import type {
  OutboundProgressDimension,
  OutboundProgressGroupDetailRow,
  OutboundProgressGroupRow,
  OutboundProgressStatusBucket,
} from '@/types/outbound'
import { formatVietnamDateTime } from '@/utils/vietnamTime'

const POLL_INTERVAL_MS = 5_000
const CARD_PAGE_SIZE = 6
const METRICS = {
  commands: { label: 'Số lệnh', unit: 'lệnh' },
  quantity: { label: 'Số lượng', unit: '' },
} as const
type OutboundProgressUIMetric = keyof typeof METRICS

const DIMENSIONS: { value: OutboundProgressDimension; label: string }[] = [
  { value: 'vehicle', label: 'Xe' },
  { value: 'sku', label: 'Mã hàng' },
]

const STATUSES: { key: OutboundProgressStatusBucket; label: string; color: string }[] = [
  { key: 'waiting', label: 'Chưa thực hiện', color: '#cbd5e1' },
  { key: 'running', label: 'Đang thực hiện', color: '#3b82f6' },
  { key: 'completed', label: 'Đã hoàn thành', color: '#168c87' },
  { key: 'attention', label: 'Cần kiểm tra', color: '#ef4444' },
]
const DETAIL_STATUS_LABEL: Record<OutboundProgressStatusBucket, string> = {
  waiting: 'Chưa thực hiện',
  running: 'Đang thực hiện',
  completed: 'Hoàn thành',
  attention: 'Cần kiểm tra',
}
const CARD_TONE = {
  waiting: {
    shell: 'border-slate-200/90 bg-slate-50/90',
    rail: 'bg-slate-400',
    badge: 'border-slate-200 bg-white text-slate-600',
  },
  running: {
    shell: 'border-blue-200/80 bg-blue-50/40',
    rail: 'bg-blue-500',
    badge: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  completed: {
    shell: 'border-teal-200/80 bg-teal-50/40',
    rail: 'bg-brand-primary',
    badge: 'border-teal-200 bg-teal-50 text-teal-800',
  },
  attention: {
    shell: 'border-red-200/80 bg-red-50/40',
    rail: 'bg-red-500',
    badge: 'border-red-200 bg-red-50 text-red-800',
  },
} as const

const number = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })

function sumCounts(counts: { waiting: number; running: number; completed: number; attention: number }) {
  return counts.waiting + counts.running + counts.completed + counts.attention
}

function groupListForDimension(
  progress: NonNullable<Awaited<ReturnType<typeof getOutboundOrderProgressApi>>>,
  dimension: OutboundProgressDimension,
): OutboundProgressGroupRow[] {
  if (dimension === 'vehicle') return progress.by_vehicle
  if (dimension === 'sku') return progress.by_sku
  if (dimension === 'split_position') return progress.by_split_position
  return progress.by_split_zone
}

function groupCardTone(row: OutboundProgressGroupRow) {
  if (row.attention_quantity > 0) return CARD_TONE.attention
  if (row.completion_percent >= 100 && row.total_quantity > 0) return CARD_TONE.completed
  if (row.running_quantity > 0 || row.completed_quantity > 0) return CARD_TONE.running
  return CARD_TONE.waiting
}

function groupRingColor(row: OutboundProgressGroupRow) {
  if (row.attention_quantity > 0) return '#ef4444'
  if (row.completion_percent >= 100 && row.total_quantity > 0) return '#168c87'
  if (row.running_quantity > 0 || row.completed_quantity > 0) return '#3b82f6'
  return '#94a3b8'
}

function groupCardLabel(row: OutboundProgressGroupRow, dimension: OutboundProgressDimension) {
  if (dimension === 'sku') {
    const code = row.label.trim()
    return code || '—'
  }
  return row.label
}

function paginate<T>(items: T[], page: number) {
  const start = (page - 1) * CARD_PAGE_SIZE
  return items.slice(start, start + CARD_PAGE_SIZE)
}

function MiniProgressRing({ percent, accent = '#168c87' }: { percent: number; accent?: string }) {
  const done = Math.min(100, Math.max(0, percent))
  const data = [
    { value: done, color: accent },
    { value: 100 - done, color: '#e2e8f0' },
  ]
  return (
    <div className="relative h-11 w-11 shrink-0" aria-label={`${Math.round(done)}% đã xuất`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={14} outerRadius={20} stroke="none" isAnimationActive={false}>
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-slate-600">
        {Math.round(done)}%
      </span>
    </div>
  )
}

function CardPagination({
  page,
  total,
  unitLabel,
  onChange,
}: {
  page: number
  total: number
  unitLabel: string
  onChange: (page: number) => void
}) {
  if (total <= CARD_PAGE_SIZE) return null
  return (
    <Pagination
      size="small"
      current={page}
      pageSize={CARD_PAGE_SIZE}
      total={total}
      showSizeChanger={false}
      hideOnSinglePage
      showTotal={(t, [from, to]) => `${from}–${to} / ${t} ${unitLabel}`}
      onChange={onChange}
      className="mt-3 flex justify-end"
    />
  )
}

function dimensionLabel(dimension: OutboundProgressDimension) {
  return DIMENSIONS.find((d) => d.value === dimension)?.label ?? dimension
}

export default function OutboundProgressCard({ warehouseId }: { warehouseId: number }) {
  const [metric, setMetric] = useState<OutboundProgressUIMetric>('commands')
  const [dimension, setDimension] = useState<OutboundProgressDimension>('vehicle')
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null)
  const [groupPage, setGroupPage] = useState(1)
  const [detailPage, setDetailPage] = useState(1)

  const latestQuery = useQuery({
    queryKey: ['outbound_orders', warehouseId, 'current-progress'],
    queryFn: async () => {
      const params = { warehouse_id: warehouseId, page: 1, page_size: 1 }
      const active = await getOutboundOrdersApi({ ...params, status: 'in_progress' })
      if (active.items.length) return active.items[0]
      const completed = await getOutboundOrdersApi({ ...params, status: 'completed' })
      return completed.items[0] ?? null
    },
    enabled: warehouseId > 0,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })
  const order = latestQuery.data

  const progressQuery = useQuery({
    queryKey: ['outboundOrderProgress', order?.id],
    queryFn: () => getOutboundOrderProgressApi(order!.id),
    enabled: warehouseId > 0 && !!order,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const progress = progressQuery.data
  const groups = useMemo(
    () => (progress ? groupListForDimension(progress, dimension) : []),
    [progress, dimension],
  )
  const selectedGroup = useMemo(() => {
    if (!selectedGroupKey || !groups.length) return null
    return groups.find((row) => row.key === selectedGroupKey) ?? null
  }, [selectedGroupKey, groups])

  const groupDetailsQuery = useQuery({
    queryKey: [
      'outboundOrderProgressGroupDetails',
      order?.id,
      dimension,
      selectedGroupKey,
    ],
    queryFn: () =>
      getOutboundOrderProgressGroupDetailsApi(order!.id, {
        dimension,
        key: selectedGroupKey!,
      }),
    enabled: warehouseId > 0 && !!order && !!selectedGroupKey,
    staleTime: 0,
  })

  const detailLines = useMemo(() => groupDetailsQuery.data ?? [], [groupDetailsQuery.data])

  const groupPageCount = Math.max(1, Math.ceil(groups.length / CARD_PAGE_SIZE))
  const effectiveGroupPage = Math.min(groupPage, groupPageCount)
  const detailPageCount = Math.max(1, Math.ceil(detailLines.length / CARD_PAGE_SIZE))
  const effectiveDetailPage = Math.min(detailPage, detailPageCount)

  const pagedGroups = useMemo(() => paginate(groups, effectiveGroupPage), [groups, effectiveGroupPage])
  const pagedDetails = useMemo(() => paginate(detailLines, effectiveDetailPage), [detailLines, effectiveDetailPage])

  const counts = progress ? progress[metric] : null
  const total = counts ? sumCounts(counts) : 0
  const percent = counts && total > 0 ? (counts.completed / total) * 100 : 0
  const chartData = counts
    ? STATUSES.filter((status) => status.key !== 'attention' || counts.attention > 0).map((status) => ({
        ...status,
        value: counts[status.key],
      }))
    : []
  const commandTotal = progress ? sumCounts(progress.commands) : 0
  const isComplete = progress != null && commandTotal > 0 && progress.commands.completed === commandTotal
  const isRunning = progress != null && (progress.commands.running > 0 || progress.commands.completed > 0)
  const statusLabel = progress == null ? ''
    : progress.commands.attention > 0 ? 'Cần kiểm tra'
    : isComplete ? 'Hoàn thành'
    : isRunning ? 'Đang xuất'
    : 'Chờ xuất'
  const loading = latestQuery.isPending || (!!order && progressQuery.isPending)
  const failed = latestQuery.isError || (!!order && progressQuery.isError)
  const hasData = !!order && progress !== undefined
  const refreshing = latestQuery.isFetching || progressQuery.isFetching

  const refresh = async () => {
    await latestQuery.refetch()
    await progressQuery.refetch()
    if (selectedGroupKey) await groupDetailsQuery.refetch()
  }

  const openGroup = (row: OutboundProgressGroupRow) => {
    setDetailPage(1)
    setSelectedGroupKey(row.key)
  }

  const chartBlock = (
    <div
      role="img"
      aria-label={`${METRICS[metric].label}: hoàn thành ${number(counts?.completed ?? 0)} trên ${number(total)}, ${number(percent)}%`}
      className="relative mx-auto h-[232px] w-full max-w-[240px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={total > 0 ? chartData : [{ label: 'Chưa có dữ liệu', value: 1, color: '#f1f5f9' }]}
            dataKey="value"
            nameKey="label"
            innerRadius={72}
            outerRadius={96}
            paddingAngle={total > 0 ? 2 : 0}
            stroke="none"
            isAnimationActive={false}
          >
            {(total > 0 ? chartData : [{ key: 'empty', color: '#f1f5f9' }]).map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Pie>
          {total > 0 && <Tooltip formatter={(value) => number(Number(value ?? 0))} />}
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-brand-dark">{total > 0 ? `${number(Math.round(percent))}%` : '—'}</span>
        <span className="mt-1 text-xs text-slate-500">{total > 0 ? 'hoàn thành' : 'Chưa có dữ liệu'}</span>
      </div>
    </div>
  )

  const quantityPanel = selectedGroup ? (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          icon={<ArrowLeftOutlined />}
          className="!h-9 !px-2.5 !text-sm"
          aria-label={`Quay lại danh sách ${dimensionLabel(dimension)}`}
          onClick={() => setSelectedGroupKey(null)}
        >
          {dimensionLabel(dimension)}
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-brand-dark">
          {groupCardLabel(selectedGroup, dimension)}
          <span className="ml-2 text-xs font-normal tabular-nums text-slate-500">
            {number(selectedGroup.completed_quantity)} / {number(selectedGroup.total_quantity)}
          </span>
        </p>
      </div>
      {groupDetailsQuery.isPending ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Spin size="small" />
          Đang tải chi tiết…
        </div>
      ) : groupDetailsQuery.isError ? (
        <p className="py-10 text-center text-sm text-red-600">Không tải được chi tiết</p>
      ) : detailLines.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Không có dòng cho nhóm này</p>
      ) : (
        <>
          <GroupDetailTable lines={pagedDetails} hideDimension={dimension} />
          <CardPagination
            page={effectiveDetailPage}
            total={detailLines.length}
            unitLabel="dòng"
            onChange={setDetailPage}
          />
        </>
      )}
    </div>
  ) : (
    <div className="min-w-0">
      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Chưa có dữ liệu</p>
      ) : (
        <>
          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            aria-label={`Tiến độ theo ${dimensionLabel(dimension)}`}
          >
            {pagedGroups.map((row) => {
              const tone = groupCardTone(row)
              const label = groupCardLabel(row, dimension)
              return (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => openGroup(row)}
                  className={cn(
                    'flex min-h-[4.25rem] items-center gap-2 rounded-lg border p-2.5 transition-colors hover:brightness-[0.98]',
                    tone.shell,
                  )}
                >
                  <span className={cn('h-10 w-1 shrink-0 self-center rounded-full', tone.rail)} aria-hidden />
                  <div className="min-w-0 flex-1 text-center">
                    <p
                      className={cn(
                        'truncate font-semibold text-brand-dark',
                        dimension === 'sku' && 'font-mono text-sm',
                      )}
                      title={label}
                    >
                      {label}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-slate-600">
                      {number(row.completed_quantity)} / {number(row.total_quantity)}
                    </p>
                  </div>
                  <MiniProgressRing percent={row.completion_percent} accent={groupRingColor(row)} />
                </button>
              )
            })}
          </div>
          <CardPagination page={effectiveGroupPage} total={groups.length} unitLabel="nhóm" onChange={setGroupPage} />
        </>
      )}
    </div>
  )

  return (
    <section aria-label="Tiến độ xuất hàng" className="flex min-w-0 flex-col rounded-xl border border-stripe-hairline bg-white shadow-stripe-1">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg text-slate-600" aria-hidden>
            <ExportOutlined />
          </span>
          <div>
            <h3 className="font-bold text-brand-dark">Xuất hàng</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {order?.status === 'completed' ? 'Phiên hoàn thành gần nhất' : 'Phiên đang xuất'}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          icon={<ReloadOutlined spin={refreshing} />}
          aria-label="Làm mới tiến độ xuất hàng"
          title="Làm mới tiến độ xuất hàng"
          disabled={warehouseId <= 0 || refreshing}
          onClick={() => void refresh()}
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        {warehouseId <= 0 ? (
          <p className="flex min-h-72 flex-1 items-center justify-center text-center text-sm text-slate-500">
            Vui lòng chọn kho để xem tiến độ xuất hàng
          </p>
        ) : loading ? (
          <div role="status" className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 text-sm text-slate-500">
            <Spin />
            Đang tải tiến độ xuất hàng…
          </div>
        ) : failed && !hasData ? (
          <div role="alert" className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-slate-500">
            <p>Không thể tải tiến độ xuất hàng</p>
            <Button variant="secondary" onClick={() => void refresh()}>Thử lại</Button>
          </div>
        ) : !order ? (
          <p className="flex min-h-72 flex-1 items-center justify-center text-center text-sm text-slate-500">
            Chưa có phiên đang xuất hoặc đã hoàn thành
          </p>
        ) : progress ? (
          <>
            {failed && (
              <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Chưa thể cập nhật. Đang hiển thị dữ liệu từ lần tải thành công gần nhất.
              </p>
            )}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-600">Tiến độ theo</p>
              <Segmented<OutboundProgressUIMetric>
                aria-label="Chọn chỉ số tiến độ xuất hàng"
                value={metric}
                onChange={(value) => {
                  setMetric(value)
                  setGroupPage(1)
                  setDetailPage(1)
                  if (value === 'commands') setSelectedGroupKey(null)
                }}
                options={Object.entries(METRICS).map(([value, meta]) => ({
                  value: value as OutboundProgressUIMetric,
                  label: meta.label,
                }))}
              />
            </div>

            <div className="grid items-start gap-4 sm:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)]">
              {chartBlock}
              <div className="min-w-0">
                {!(metric === 'quantity' && selectedGroup) && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <p className="text-sm text-slate-500">
                      {metric === 'quantity' ? (
                        <>
                          Số lượng{' '}
                          <strong className="font-bold tabular-nums text-brand-dark">{number(total)}</strong>
                        </>
                      ) : (
                        <>
                          Tổng <strong className="font-bold tabular-nums text-brand-dark">{number(total)}</strong>{' '}
                          {METRICS[metric].unit}
                        </>
                      )}
                    </p>
                    {metric === 'quantity' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-slate-500">Nhóm theo</span>
                        <Segmented<OutboundProgressDimension>
                          aria-label="Chọn chiều tiến độ xuất hàng"
                          size="small"
                          value={dimension}
                          onChange={(value) => {
                            setDimension(value)
                            setGroupPage(1)
                            setDetailPage(1)
                            setSelectedGroupKey(null)
                          }}
                          options={DIMENSIONS.map((d) => ({ value: d.value, label: d.label }))}
                        />
                      </div>
                    )}
                  </div>
                )}
                {metric === 'commands' ? (
                  <dl className="space-y-3" aria-label="Thống kê tiến độ xuất hàng">
                    {chartData.map((entry) => (
                      <div key={entry.key} className="flex items-center justify-between gap-2 text-sm">
                        <dt className="flex min-w-0 items-center gap-2 text-slate-600">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} aria-hidden />
                          {entry.label}
                        </dt>
                        <dd className="shrink-0 font-semibold tabular-nums text-brand-dark">{number(entry.value)}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  quantityPanel
                )}
              </div>
            </div>

            <dl className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-slate-500">Mã đơn xuất</dt>
                <dd className="min-w-0 break-all font-bold text-brand-dark">{order.order_code}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Trạng thái</dt>
                <dd
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    progress.commands.attention > 0
                      ? 'bg-red-50 text-red-700'
                      : isComplete
                        ? 'bg-teal-50 text-teal-700'
                        : isRunning
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-slate-200/60 text-slate-600'
                  }`}
                >
                  {statusLabel}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <dt className="shrink-0 text-slate-500">Thông số</dt>
                <dd className="text-right font-semibold tabular-nums text-brand-dark">
                  {number(progress.vehicle_count)} xe - {number(progress.trip_count)} trip -{' '}
                  {number(progress.customer_count)} khách hàng
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-slate-500">Thời gian tạo</dt>
                <dd className="font-medium tabular-nums text-brand-dark">{formatVietnamDateTime(order.created_at)}</dd>
              </div>
            </dl>
          </>
        ) : null}

        <Link
          to={order ? `/export/${order.id}` : '/export'}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stripe-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
        >
          Xem xuất hàng <ArrowRightOutlined />
        </Link>
      </div>
    </section>
  )
}

function GroupDetailTable({
  lines,
  hideDimension,
}: {
  lines: OutboundProgressGroupDetailRow[]
  hideDimension: OutboundProgressDimension
}) {
  const showSku = hideDimension !== 'sku'
  const showVehicle = hideDimension !== 'vehicle'
  const showPosition = hideDimension !== 'split_position'
  const showFromLocation = true

  const cellCenter = 'px-2 py-2 align-middle text-center'
  const headCenter = 'px-2 py-1.5 text-center font-semibold'

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full table-fixed border-collapse text-[11px] leading-snug sm:text-xs" aria-label="Chi tiết nhóm tiến độ xuất">
        <colgroup>
          <col className="w-[16%]" />
          {showSku && <col />}
          {showPosition && <col />}
          {showFromLocation && <col />}
          {showVehicle && <col />}
          <col className="w-[26%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <th scope="col" className={headCenter}>
              Số lượng
            </th>
            {showSku && (
              <th scope="col" className={headCenter}>
                Mã hàng
              </th>
            )}
            {showPosition && (
              <th scope="col" className={headCenter}>
                Vị trí chia
              </th>
            )}
            {showFromLocation && (
              <th scope="col" className={headCenter}>
                Vị trí lấy
              </th>
            )}
            {showVehicle && (
              <th scope="col" className={headCenter}>
                Xe
              </th>
            )}
            <th scope="col" className={headCenter}>
              Trạng thái
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const tone = CARD_TONE[line.progress_status]
            const qtyLabel = `${number(line.quantity)}${line.unit ? ` ${line.unit}` : ''}`
            const fromLoc = line.from_location_name?.trim() ?? ''
            return (
              <tr key={line.detail_id} className="border-b border-slate-100 last:border-b-0">
                <td className={cn(cellCenter, 'tabular-nums text-brand-dark')} title={qtyLabel}>
                  <span className="mx-auto line-clamp-2 max-w-full break-all">{qtyLabel}</span>
                </td>
                {showSku && (
                  <td className={cn(cellCenter, 'font-mono text-brand-dark')} title={line.sku ?? undefined}>
                    <span className="mx-auto line-clamp-2 max-w-full break-all">{line.sku?.trim() || '—'}</span>
                  </td>
                )}
                {showPosition && (
                  <td className={cn(cellCenter, 'text-brand-dark')} title={line.split_position?.trim() || undefined}>
                    <span className="mx-auto line-clamp-2 max-w-full break-words">{line.split_position?.trim() ?? ''}</span>
                  </td>
                )}
                {showFromLocation && (
                  <td className={cn(cellCenter, 'text-brand-dark')} title={fromLoc || undefined}>
                    <span className="mx-auto line-clamp-2 max-w-full break-words">{fromLoc}</span>
                  </td>
                )}
                {showVehicle && (
                  <td className={cn(cellCenter, 'text-brand-dark')} title={line.vehicle_no ?? undefined}>
                    <span className="mx-auto line-clamp-2 max-w-full break-words">{line.vehicle_no?.trim() || '—'}</span>
                  </td>
                )}
                <td className={cellCenter}>
                  <span
                    className={cn(
                      'mx-auto inline-block max-w-full truncate rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-tight',
                      tone.badge,
                    )}
                    title={DETAIL_STATUS_LABEL[line.progress_status]}
                  >
                    {DETAIL_STATUS_LABEL[line.progress_status]}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
