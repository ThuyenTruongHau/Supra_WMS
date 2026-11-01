import { Spin } from 'antd'
import { InboxOutlined } from '@ant-design/icons'
import { useReportStorageOccupancy } from '@/hooks/useDashboard'

const number = (value: number) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value)

const WARN_THRESHOLD = 80

function effectiveOccupancyPercent(
  total: number,
  occupied: number,
  reportedPercent: number,
) {
  if (total <= 0) return 0
  const fromRatio = Math.round((occupied / total) * 100)
  return Math.max(reportedPercent, fromRatio)
}

function occupancyState(total: number, occupied: number, reportedPercent: number) {
  const percent = effectiveOccupancyPercent(total, occupied, reportedPercent)
  const isFull = total > 0 && (occupied >= total || percent >= 100)
  const isNearFull = total > 0 && !isFull && percent > WARN_THRESHOLD
  return { percent, isFull, isNearFull }
}

function surfaceClass(isFull: boolean, isNearFull: boolean) {
  if (isFull) return 'border-red-300 bg-red-50'
  if (isNearFull) return 'border-amber-300 bg-amber-50'
  return 'border-stripe-hairline bg-white'
}

export default function StorageOccupancyCard({
  warehouseId,
  className = '',
  layout = 'default',
}: {
  warehouseId: number
  className?: string
  layout?: 'default' | 'kpi'
}) {
  const { data, isPending, isError, refetch, isFetching } = useReportStorageOccupancy(warehouseId)

  const total = data?.total_locations ?? 0
  const occupied = data?.occupied_locations ?? 0
  const reportedPercent = data?.occupancy_percent ?? 0
  const { percent, isFull, isNearFull } = occupancyState(total, occupied, reportedPercent)
  const surface = surfaceClass(isFull, isNearFull)

  const statusLine = isFull
    ? 'Kho đầy'
    : isNearFull
      ? 'Cảnh báo kho sắp đầy'
      : null

  const body =
    warehouseId <= 0 ? (
      <p className="mt-2 text-sm text-slate-500">Vui lòng chọn kho</p>
    ) : isPending && !data ? (
      <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
        <Spin size="small" />
        Đang tải…
      </div>
    ) : isError && !data ? (
      <p className="mt-2 text-sm text-red-600">
        Không tải được dữ liệu.{' '}
        <button
          type="button"
          className="font-medium text-brand-primary underline"
          onClick={() => void refetch()}
        >
          Thử lại
        </button>
      </p>
    ) : total <= 0 ? (
      <p className="mt-2 text-sm text-slate-500">Chưa có vị trí lưu trữ trong kho</p>
    ) : (
      <>
        <p className="mt-2 text-2xl font-bold tabular-nums text-brand-dark">
          {number(percent)}%{' '}
          <span className="text-base font-semibold text-slate-600">
            ({number(occupied)}/{number(total)})
          </span>
        </p>
        {statusLine ? (
          <p
            className={`mt-2 text-sm font-semibold ${isFull ? 'text-red-800' : 'text-amber-900'}`}
            role="status"
          >
            {statusLine}
          </p>
        ) : null}
      </>
    )

  const fetchingHint =
    isFetching && data ? (
      <p className="mt-2 text-xs text-slate-400" aria-live="polite">
        Đang cập nhật…
      </p>
    ) : null

  const shellClass = `rounded-xl border p-5 shadow-stripe-1 ${surface} ${className}`.trim()

  if (layout === 'kpi') {
    return (
      <div className={shellClass} aria-label="Tỉ lệ tồn kho">
        <p className="text-sm text-slate-500">Tỉ lệ tồn kho</p>
        {body}
        {fetchingHint}
      </div>
    )
  }

  return (
    <section aria-label="Tỉ lệ tồn kho" className={shellClass}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${
            isFull
              ? 'bg-red-100 text-red-700'
              : isNearFull
                ? 'bg-amber-100 text-amber-800'
                : 'bg-teal-50 text-brand-primary'
          }`}
          aria-hidden
        >
          <InboxOutlined />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-brand-dark">Tỉ lệ tồn kho</h3>
          {body}
          {fetchingHint}
        </div>
      </div>
    </section>
  )
}
