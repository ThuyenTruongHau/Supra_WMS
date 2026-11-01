import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeftOutlined, ArrowRightOutlined, ImportOutlined, ReloadOutlined } from '@ant-design/icons'
import { Pagination, Segmented, Spin } from 'antd'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  getInboundOrderProgressApi,
  getInboundOrderProgressItemDetailsApi,
  getInboundOrdersApi,
} from '@/api/inboundOrder'
import { Button, cn } from '@/components/ui'
import type {
  InboundProgressCounts,
  InboundProgressItemDetailRow,
  InboundProgressItemRow,
  InboundProgressStatusBucket,
} from '@/types/inboundOrder'
import { formatVietnamDateTime } from '@/utils/vietnamTime'

const POLL_INTERVAL_MS = 5_000
const CARD_PAGE_SIZE = 6
const METRICS = {
  commands: { label: 'Số lệnh', unit: 'lệnh' },
  quantity: { label: 'Số lượng hàng', unit: 'hàng' },
} as const
type InboundProgressUIMetric = keyof typeof METRICS
const STATUSES: { key: InboundProgressStatusBucket; label: string; color: string }[] = [
  { key: 'waiting', label: 'Chưa thực hiện', color: '#cbd5e1' },
  { key: 'running', label: 'Đang thực hiện', color: '#3b82f6' },
  { key: 'completed', label: 'Đã hoàn thành', color: '#168c87' },
  { key: 'attention', label: 'Cần kiểm tra', color: '#ef4444' },
]
const DETAIL_STATUS_LABEL: Record<InboundProgressStatusBucket, string> = {
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

function sumCounts(counts: InboundProgressCounts) {
  return counts.waiting + counts.running + counts.completed + counts.attention
}

function itemRowKey(row: InboundProgressItemRow) {
  return row.item_id != null ? `item:${row.item_id}` : `sku:${row.sku ?? ''}`
}

function itemSkuCode(row: InboundProgressItemRow) {
  const code = row.sku?.trim()
  if (code) return code
  if (row.item_id != null) return `#${row.item_id}`
  return '—'
}

function itemCardTone(row: InboundProgressItemRow) {
  if (row.attention_quantity > 0) return CARD_TONE.attention
  if (row.completion_percent >= 100 && row.total_quantity > 0) return CARD_TONE.completed
  if (row.running_quantity > 0 || row.completed_quantity > 0) return CARD_TONE.running
  return CARD_TONE.waiting
}

function itemRingColor(row: InboundProgressItemRow) {
  if (row.attention_quantity > 0) return '#ef4444'
  if (row.completion_percent >= 100 && row.total_quantity > 0) return '#168c87'
  if (row.running_quantity > 0 || row.completed_quantity > 0) return '#3b82f6'
  return '#94a3b8'
}

function paginate<T>(items: T[], page: number) {
  const start = (page - 1) * CARD_PAGE_SIZE
  return items.slice(start, start + CARD_PAGE_SIZE)
}

function MiniProgressRing({ percent, accent = '#168c87' }: { percent: number; accent?: string }) {
  const done = Math.min(100, Math.max(0, percent))
  const ringData = [
    { value: done, color: accent },
    { value: 100 - done, color: '#f1f5f9' },
  ]
  return (
    <div
      className="relative h-11 w-11 shrink-0"
      role="img"
      aria-label={`${Math.round(done)}% đã nhập`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={ringData}
            dataKey="value"
            innerRadius={14}
            outerRadius={20}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {ringData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums text-brand-dark">
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

export default function InboundProgressCard({ warehouseId }: { warehouseId: number }) {
  const [metric, setMetric] = useState<InboundProgressUIMetric>('commands')
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null)
  const [itemPage, setItemPage] = useState(1)
  const [detailPage, setDetailPage] = useState(1)

  const latestQuery = useQuery({
    queryKey: ['inbound_orders', warehouseId, 'current-progress'],
    queryFn: async () => {
      const params = { warehouse_id: warehouseId, page: 1, page_size: 1 }
      const active = await getInboundOrdersApi({ ...params, status: 'in_progress' })
      if (active.items.length) return active.items[0]
      const completed = await getInboundOrdersApi({ ...params, status: 'completed' })
      return completed.items[0] ?? null
    },
    enabled: warehouseId > 0,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })
  const order = latestQuery.data

  const progressQuery = useQuery({
    queryKey: ['inboundOrderProgress', order?.order_code],
    queryFn: () => getInboundOrderProgressApi(order!.order_code),
    enabled: warehouseId > 0 && !!order,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  const progress = progressQuery.data
  const selectedItem = useMemo(() => {
    if (!selectedItemKey || !progress) return null
    return progress.items.find((row) => itemRowKey(row) === selectedItemKey) ?? null
  }, [selectedItemKey, progress])

  const itemDetailsQuery = useQuery({
    queryKey: [
      'inboundOrderProgressItemDetails',
      order?.order_code,
      selectedItem?.item_id ?? null,
      selectedItem?.sku ?? null,
    ],
    queryFn: () =>
      getInboundOrderProgressItemDetailsApi(order!.order_code, {
        item_id: selectedItem!.item_id ?? undefined,
        sku: selectedItem!.item_id == null ? selectedItem!.sku ?? undefined : undefined,
      }),
    enabled: warehouseId > 0 && !!order && !!selectedItem,
    staleTime: 0,
  })

  const detailLines = useMemo(
    () => itemDetailsQuery.data ?? [],
    [itemDetailsQuery.data],
  )

  const itemPageCount = Math.max(1, Math.ceil((progress?.items.length ?? 0) / CARD_PAGE_SIZE))
  const effectiveItemPage = Math.min(itemPage, itemPageCount)
  const detailPageCount = Math.max(1, Math.ceil(detailLines.length / CARD_PAGE_SIZE))
  const effectiveDetailPage = Math.min(detailPage, detailPageCount)

  const pagedItems = useMemo(
    () => (progress ? paginate(progress.items, effectiveItemPage) : []),
    [progress, effectiveItemPage],
  )
  const pagedDetails = useMemo(
    () => paginate(detailLines, effectiveDetailPage),
    [detailLines, effectiveDetailPage],
  )

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
    : isRunning ? 'Đang nhập'
    : 'Chờ nhập'
  const loading = latestQuery.isPending || (!!order && progressQuery.isPending)
  const failed = latestQuery.isError || (!!order && progressQuery.isError)
  const hasData = !!order && progress !== undefined
  const refreshing = latestQuery.isFetching || progressQuery.isFetching

  const refresh = async () => {
    await latestQuery.refetch()
    await progressQuery.refetch()
    if (selectedItem) await itemDetailsQuery.refetch()
  }

  const openItem = (row: InboundProgressItemRow) => {
    setDetailPage(1)
    setSelectedItemKey(itemRowKey(row))
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
            {(total > 0 ? chartData : [{ key: 'empty', color: '#f1f5f9' }]).map((entry) => <Cell key={entry.key} fill={entry.color} />)}
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

  const quantityCards = selectedItem ? (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          icon={<ArrowLeftOutlined />}
          className="!h-9 !px-2.5 !text-sm"
          aria-label="Quay lại danh sách mã hàng"
          onClick={() => setSelectedItemKey(null)}
        >
          Mã hàng
        </Button>
        <p className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-brand-dark">
          {itemSkuCode(selectedItem)}
          <span className="ml-2 text-xs font-normal tabular-nums text-slate-500">
            {number(selectedItem.completed_quantity)} / {number(selectedItem.total_quantity)}
          </span>
        </p>
      </div>
      {itemDetailsQuery.isPending ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Spin size="small" />
          Đang tải nhóm lệnh…
        </div>
      ) : itemDetailsQuery.isError ? (
        <p className="py-10 text-center text-sm text-red-600">Không tải được chi tiết mã hàng</p>
      ) : detailLines.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">Không có nhóm lệnh cho mã này</p>
      ) : (
        <>
          <ItemDetailTable lines={pagedDetails} />
          <CardPagination
            page={effectiveDetailPage}
            total={detailLines.length}
            unitLabel="nhóm"
            onChange={setDetailPage}
          />
        </>
      )}
    </div>
  ) : (
    <div className="min-w-0">
      {(progress?.items.length ?? 0) === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Chưa có dữ liệu mã hàng</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Tiến độ theo mã hàng">
            {pagedItems.map((row) => {
              const tone = itemCardTone(row)
              const sku = itemSkuCode(row)
              return (
                <button
                  key={itemRowKey(row)}
                  type="button"
                  title="Nhấp để xem nhóm lệnh"
                  aria-label={`${sku}, ${number(row.completed_quantity)} trên ${number(row.total_quantity)} hàng`}
                  onClick={() => openItem(row)}
                  className={cn(
                    'group relative flex w-full items-center gap-2 overflow-hidden rounded-xl border py-2.5 pl-3.5 pr-2.5 text-left shadow-stripe-1 transition duration-200 hover:-translate-y-0.5',
                    tone.shell,
                  )}
                >
                  <span className={cn('absolute inset-y-0 left-0 w-1.5', tone.rail)} aria-hidden />
                  <span className="relative z-10 min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm font-bold text-brand-dark">{sku}</span>
                    <span className="mt-0.5 block text-xs tabular-nums text-slate-500">
                      <span className="font-semibold text-brand-dark">{number(row.completed_quantity)}</span>
                      {' / '}
                      {number(row.total_quantity)}
                    </span>
                  </span>
                  <MiniProgressRing percent={row.completion_percent} accent={itemRingColor(row)} />
                </button>
              )
            })}
          </div>
          <CardPagination
            page={effectiveItemPage}
            total={progress!.items.length}
            unitLabel="mã"
            onChange={setItemPage}
          />
        </>
      )}
    </div>
  )

  return (
    <section aria-label="Tiến độ nhập hàng" className="flex min-w-0 flex-col rounded-xl border border-stripe-hairline bg-white shadow-stripe-1">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-lg text-brand-primary" aria-hidden>
            <ImportOutlined />
          </span>
          <div>
            <h3 className="font-bold text-brand-dark">Nhập hàng</h3>
            <p className="mt-0.5 text-xs text-slate-500">{order?.status === 'completed' ? 'Phiên hoàn thành gần nhất' : 'Phiên đang nhập'}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          icon={<ReloadOutlined spin={refreshing} />}
          aria-label="Làm mới tiến độ nhập hàng"
          title="Làm mới tiến độ nhập hàng"
          disabled={warehouseId <= 0 || refreshing}
          onClick={() => void refresh()}
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        {warehouseId <= 0 ? (
          <p className="flex min-h-72 flex-1 items-center justify-center text-center text-sm text-slate-500">
            Vui lòng chọn kho để xem tiến độ nhập hàng
          </p>
        ) : loading ? (
          <div role="status" className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 text-sm text-slate-500">
            <Spin />
            Đang tải tiến độ nhập hàng…
          </div>
        ) : failed && !hasData ? (
          <div role="alert" className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 text-center text-sm text-slate-500">
            <p>Không thể tải tiến độ nhập hàng</p>
            <Button variant="secondary" onClick={() => void refresh()}>Thử lại</Button>
          </div>
        ) : !order ? (
          <p className="flex min-h-72 flex-1 items-center justify-center text-center text-sm text-slate-500">
            Chưa có phiên đang nhập hoặc đã hoàn thành
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
              <Segmented<InboundProgressUIMetric>
                aria-label="Chọn chỉ số tiến độ nhập hàng"
                value={metric}
                onChange={(value) => {
                  setMetric(value)
                  setItemPage(1)
                  setDetailPage(1)
                  if (value === 'commands') setSelectedItemKey(null)
                }}
                options={Object.entries(METRICS).map(([value, meta]) => ({ value: value as InboundProgressUIMetric, label: meta.label }))}
              />
            </div>

            <div className="grid items-start gap-4 sm:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)]">
              {chartBlock}
              <div className="min-w-0">
                {!(metric === 'quantity' && selectedItem) && (
                  <p className="mb-3 text-sm text-slate-500">
                    Tổng <strong className="font-bold tabular-nums text-brand-dark">{number(total)}</strong> {METRICS[metric].unit}
                  </p>
                )}
                {metric === 'commands' ? (
                  <dl className="space-y-3" aria-label="Thống kê tiến độ nhập hàng">
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
                  quantityCards
                )}
              </div>
            </div>

            <dl className="mt-5 space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-slate-500">Mã đơn nhập</dt>
                <dd className="min-w-0 break-all font-bold text-brand-dark">{order.order_code}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Trạng thái</dt>
                <dd className={`rounded-full px-2.5 py-1 text-xs font-semibold ${progress.commands.attention > 0 ? 'bg-red-50 text-red-700' : isComplete ? 'bg-teal-50 text-teal-700' : isRunning ? 'bg-blue-50 text-blue-700' : 'bg-slate-200/60 text-slate-600'}`}>
                  {statusLabel}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="shrink-0 text-slate-500">Biển số xe</dt>
                <dd className="flex flex-wrap justify-end gap-1.5">
                  {progress.vehicles.length ? progress.vehicles.map((vehicle) => (
                    <span key={vehicle} className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-medium text-brand-dark">{vehicle}</span>
                  )) : <span className="text-slate-400">Chưa có thông tin</span>}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-slate-500">Thời gian tạo</dt>
                <dd className="font-medium tabular-nums text-brand-dark">{formatVietnamDateTime(order.created_at)}</dd>
              </div>
            </dl>
          </>
        ) : null}

        <Link to="/import" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stripe-primary-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
          Xem nhập hàng <ArrowRightOutlined />
        </Link>
      </div>
    </section>
  )
}

function ItemDetailTable({ lines }: { lines: InboundProgressItemDetailRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table
        className="w-full table-fixed border-collapse text-[11px] leading-snug sm:text-xs"
        aria-label="Nhóm lệnh theo mã hàng"
      >
        <colgroup>
          <col className="w-[26%]" />
          <col />
          <col className="w-[34%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
            <th scope="col" className="px-2 py-1.5 text-left font-semibold">
              Số lượng
            </th>
            <th scope="col" className="px-2 py-1.5 text-left font-semibold">
              Vị trí
            </th>
            <th scope="col" className="px-2 py-1.5 text-right font-semibold">
              Trạng thái
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const location = line.to_location_name?.trim() || '—'
            const tone = CARD_TONE[line.progress_status]
            const qtyLabel = `${number(line.quantity)}${line.unit_name ? ` ${line.unit_name}` : ''}`
            return (
              <tr key={line.detail_id} className="border-b border-slate-100 last:border-b-0">
                <td className="px-2 py-1.5 align-middle tabular-nums text-brand-dark" title={qtyLabel}>
                  <span className="line-clamp-2 break-all">{qtyLabel}</span>
                </td>
                <td className="px-2 py-1.5 align-middle font-medium text-brand-dark" title={location}>
                  <span className="line-clamp-2 break-words">{location}</span>
                </td>
                <td className="px-2 py-1.5 align-middle text-right">
                  <span
                    className={cn(
                      'inline-block max-w-full truncate rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-tight',
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
