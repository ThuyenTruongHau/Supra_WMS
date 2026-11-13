import { useMemo } from 'react'
import { Tooltip } from 'antd'
import { createQrDataUrl } from '@/utils/printQrCodeLabels'
import type { ItemStockQrCodeEntry } from '@/types/itemStock'

type ItemStockQrDisplayProps = {
  qrCodes: ItemStockQrCodeEntry[] | undefined
  loading?: boolean
  size?: number
  layout?: 'inline' | 'stacked'
}

export default function ItemStockQrDisplay({
  qrCodes,
  loading = false,
  size = 72,
  layout = 'stacked',
}: ItemStockQrDisplayProps) {
  const codes = qrCodes ?? []

  const primaryDataUrl = useMemo(() => {
    if (!codes.length) return null
    try {
      return createQrDataUrl(codes[0].code, size)
    } catch {
      return null
    }
  }, [codes, size])

  if (loading) {
    return <span className="text-slate-400">…</span>
  }

  if (!codes.length) {
    return <span className="text-slate-400">—</span>
  }

  const codeLines = codes.map((entry) => entry.code)
  const label =
    codeLines.length === 1 ? (
      <span className="font-mono text-xs text-slate-700 break-all">{codeLines[0]}</span>
    ) : (
      <Tooltip title={codeLines.join('\n')}>
        <span className="font-mono text-xs text-slate-700 break-all cursor-default">
          {codeLines.join(', ')}
        </span>
      </Tooltip>
    )

  if (layout === 'inline') {
    return (
      <div className="inline-flex items-center gap-2">
        {primaryDataUrl ? (
          <img
            src={primaryDataUrl}
            alt={codes[0].code}
            title={codes[0].code}
            width={size}
            height={size}
            className="rounded border border-slate-200 bg-white shrink-0"
          />
        ) : null}
        {label}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {primaryDataUrl ? (
        <img
          src={primaryDataUrl}
          alt={codes[0].code}
          title={codes[0].code}
          width={size}
          height={size}
          className="rounded border border-slate-200 bg-white"
        />
      ) : null}
      {label}
    </div>
  )
}
