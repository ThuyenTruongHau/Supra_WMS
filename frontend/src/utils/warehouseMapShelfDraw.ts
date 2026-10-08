import type { LocationStockLabel } from '@/types/warehouseLocation'
import { formatDisplayBin } from '@/utils/locationBin'

/** Palette ô có hàng — SCADA / tech trên nền trắng */
export const SHELF_TECH = {
  occupiedFill: '#0f3d3a',
  occupiedStroke: '#2dd4bf',
  occupiedInset: 'rgba(45, 212, 191, 0.45)',
  occupiedCorner: '#5eead4',
  emptyFill: '#e2e8f0',
  emptyStroke: '#94a3b8',
  /** Ô cảnh báo đang lấy hàng (status=taking) — dark amber SCADA, đồng bộ ô teal */
  takingFill: '#2a2214',
  takingFillDeep: '#1a150c',
  takingStroke: '#e8a317',
  takingInset: 'rgba(232, 163, 23, 0.38)',
  takingCorner: '#f5d061',
  labelEmpty: '#64748b',
  labelPrimary: '#f0fdfa',
  labelMuted: '#99f6e4',
  labelFull: '#2dd4bf',
} as const

/** Palette highlight ô CX (chờ xuất) — ST giữ màu xanh lá SCADA mặc định. */
export const OUTBOUND_STATION_TECH = {
  emptyFill: '#ffedd5',
  emptyStroke: '#ea580c',
  emptyLabel: '#c2410c',
  occupiedFill: '#431407',
  occupiedStroke: '#fb923c',
  occupiedInset: 'rgba(251, 146, 60, 0.42)',
  occupiedCorner: '#fdba74',
  takingFill: '#2a2214',
  takingFillDeep: '#1a150c',
  takingStroke: '#f59e0b',
  takingInset: 'rgba(245, 158, 11, 0.38)',
  takingCorner: '#fcd34d',
} as const

function drawTechCornerAccents(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  size: number,
  inset: number,
  half: number,
  invScale: number,
  cornerColor: string,
) {
  const corner = half * 0.22
  const lw = invScale * 1.4
  ctx.strokeStyle = cornerColor
  ctx.lineWidth = lw
  ctx.lineCap = 'square'

  ctx.beginPath()
  ctx.moveTo(left + inset, top + inset + corner)
  ctx.lineTo(left + inset, top + inset)
  ctx.lineTo(left + inset + corner, top + inset)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(left + size - inset - corner, top + inset)
  ctx.lineTo(left + size - inset, top + inset)
  ctx.lineTo(left + size - inset, top + inset + corner)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(left + inset, top + size - inset - corner)
  ctx.lineTo(left + inset, top + size - inset)
  ctx.lineTo(left + inset + corner, top + size - inset)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(left + size - inset - corner, top + size - inset)
  ctx.lineTo(left + size - inset, top + size - inset)
  ctx.lineTo(left + size - inset, top + size - inset - corner)
  ctx.stroke()
}

export function drawOutboundStationCellByStatus(
  ctx: CanvasRenderingContext2D,
  status: string,
  x: number,
  y: number,
  half: number,
  invScale: number,
) {
  const left = x - half
  const top = y - half
  const size = half * 2
  const radius = Math.max(4, half * 0.15)

  ctx.beginPath()
  ctx.roundRect(left, top, size, size, radius)

  if (status === 'taking') {
    ctx.fillStyle = '#ea580c' // Orange 600
    ctx.fill()
    return
  }

  if (status !== 'empty') {
    ctx.fillStyle = '#d97706' // Amber 600
    ctx.fill()
    return
  }

  ctx.fillStyle = '#fffbeb' // Amber 50
  ctx.fill()
  ctx.strokeStyle = '#d97706'
  ctx.lineWidth = invScale * 1.5
  ctx.stroke()
}

export function fitLabelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let truncated = text
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return truncated.length > 0 ? `${truncated}…` : ''
}

/** Thu nhỏ font đến khi text vừa maxWidth (ưu tiên hiện đủ SKU). */
export function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  preferred: number,
  minSize: number,
  weight = '600',
  family = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
): number {
  let size = preferred
  ctx.font = `${weight} ${size}px ${family}`
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 0.5
    ctx.font = `${weight} ${size}px ${family}`
  }
  return size
}

/**
 * Bọc text tối đa maxLines dòng; chỉ thêm … ở dòng cuối nếu vẫn tràn.
 */
export function wrapTextMaxLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const value = text.trim()
  if (!value || maxLines < 1) return []
  if (ctx.measureText(value).width <= maxWidth) return [value]

  const lines: string[] = []
  let remaining = value

  while (remaining.length > 0 && lines.length < maxLines) {
    if (lines.length === maxLines - 1) {
      lines.push(fitLabelText(ctx, remaining, maxWidth))
      break
    }

    let low = 1
    let high = remaining.length
    let fit = 1
    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      if (ctx.measureText(remaining.slice(0, mid)).width <= maxWidth) {
        fit = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    let breakAt = fit
    const spaceIdx = remaining.lastIndexOf(' ', fit)
    if (spaceIdx >= Math.floor(fit * 0.35)) {
      breakAt = spaceIdx
    }

    lines.push(remaining.slice(0, breakAt).trimEnd())
    remaining = remaining.slice(breakAt).trimStart()
  }

  return lines.filter(Boolean)
}

/**
 * Ô có hàng kiểu công nghệ: nền teal, viền mint, inset + góc L (không glow).
 */
export function drawTechOccupiedCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  invScale: number,
) {
  const left = x - half
  const top = y - half
  const size = half * 2
  const radius = Math.max(4, half * 0.15)

  ctx.beginPath()
  ctx.roundRect(left, top, size, size, radius)
  ctx.fillStyle = '#0d9488' // Teal 600
  ctx.fill()
}

/**
 * Ô cảnh báo (status=taking): nền bronze tối + viền vàng kim — điểm robot đang lấy hàng.
 */
export function drawTechTakingCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  invScale: number,
) {
  const left = x - half
  const top = y - half
  const size = half * 2
  const radius = Math.max(4, half * 0.15)

  ctx.beginPath()
  ctx.roundRect(left, top, size, size, radius)
  ctx.fillStyle = '#0f766e' // Teal 700 (darker for taking)
  ctx.fill()

  ctx.strokeStyle = '#f59e0b' // Amber 500 border for taking status
  ctx.lineWidth = invScale * 2.5
  ctx.stroke()
}

/** Ô CC / sorting đã gán xe — đồng bộ với palette cam outbound, tách khỏi xám trống / teal có hàng. */
export const SHELF_ASSIGNED_TECH = {
  fill: '#ffedd5',
  stroke: '#ea580c',
  plate: '#c2410c',
  plateHighlighted: '#fb923c',
} as const

/** Vẽ ô trống đã gán biển số (CC Masan, sorting có VEH). */
export function drawAssignedCcShelf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  invScale: number,
) {
  const size = half * 2
  const radius = Math.max(4, half * 0.15)
  ctx.beginPath()
  ctx.roundRect(x - half, y - half, size, size, radius)
  ctx.fillStyle = SHELF_ASSIGNED_TECH.fill
  ctx.fill()
  ctx.strokeStyle = SHELF_ASSIGNED_TECH.stroke
  ctx.lineWidth = invScale * 1.1
  ctx.stroke()
}

/** Ô CC có hàng chờ operator xác nhận lấy (WS pending-stock). */
export const SHELF_PENDING_CONFIRM_TECH = {
  fill: '#ffedd5',
  stroke: '#ea580c',
  labelPrimary: '#7c2d12',
  labelQty: '#9a3412',
  divider: 'rgba(234, 88, 12, 0.55)',
} as const

export function drawPendingStockConfirmShelf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  invScale: number,
) {
  const size = half * 2
  const radius = Math.max(4, half * 0.15)
  ctx.beginPath()
  ctx.roundRect(x - half, y - half, size, size, radius)
  ctx.fillStyle = SHELF_PENDING_CONFIRM_TECH.fill
  ctx.fill()
  ctx.strokeStyle = SHELF_PENDING_CONFIRM_TECH.stroke
  ctx.lineWidth = invScale * 1.35
  ctx.stroke()
}

/** Biển số từ overlay sorting (`VEH::…`). */
export function parseVehicleFromStationOverlay(overlay: string): string {
  for (const line of overlay.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.toUpperCase().startsWith('VEH::')) {
      return trimmed.replace(/^VEH::/i, '').trim()
    }
  }
  return ''
}

function drawLocationTitleAboveShelf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  locationName: string,
  options: {
    scale: number
    highlighted: boolean
    nameColor?: string
    nameColorHighlighted?: string
  },
) {
  const { scale, highlighted, nameColor, nameColorHighlighted } = options
  const sans = '"Plus Jakarta Sans", system-ui, sans-serif'
  const maxW = half * 1.85
  const nameSize = Math.max(6, half * 0.26 * scale)
  const margin = nameSize * 0.4

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${nameSize}px ${sans}`
  ctx.fillStyle =
    highlighted && nameColorHighlighted
      ? nameColorHighlighted
      : highlighted
        ? '#FFFFFF'
        : (nameColor ?? '#64748b')
  ctx.fillText(fitLabelText(ctx, locationName, maxW), x, y - half - margin)
}

/** Biển số trong ngoặc — dưới viền dưới ô, chữ nhỏ, co để vừa chiều ngang. */
function drawVehiclePlateBelowShelf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  vehiclePlate: string,
  options: { scale: number; highlighted: boolean },
) {
  const plateRaw = vehiclePlate.trim()
  if (!plateRaw) return

  const { scale, highlighted } = options
  const sans = '"Plus Jakarta Sans", system-ui, sans-serif'
  const plateText = `(${plateRaw})`
  const maxW = half * 2.35
  const preferred = Math.max(4, half * 0.14 * scale)
  const minSize = 3.5
  const plateSize = fitFontSize(ctx, plateText, maxW, preferred, minSize, '700', sans)
  const bottomEdge = y + half
  const gapBelowShelf = Math.max(plateSize * 0.35, half * 0.1 * scale)
  const plateY = bottomEdge + gapBelowShelf + plateSize * 0.5

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${plateSize}px ${sans}`
  ctx.fillStyle = highlighted
    ? SHELF_ASSIGNED_TECH.plateHighlighted
    : SHELF_ASSIGNED_TECH.plate
  const text =
    ctx.measureText(plateText).width <= maxW
      ? plateText
      : fitLabelText(ctx, plateText, maxW)
  ctx.fillText(text, x, plateY)
}

/**
 * Overlay sorting station:
 * Tên vị trí phía trên ô; biển số trong ngoặc dưới ô; trong ô: SKU / SL.
 */
export function drawStationOverlayLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  overlay: string,
  highlighted = false,
  fallbackLocationCode?: string,
  textScale = 1,
  externalVehiclePlate?: string,
  overlayVariant: 'default' | 'pendingConfirm' = 'default',
) {
  // Giảm scale xuống một chút so với Inbound để vừa với các ô xếp khít nhau của Outbound
  const scale = (Number.isFinite(textScale) && textScale > 0 ? textScale : 1) * 0.85

  const maxW = half * 1.72
  const mono = '"Plus Jakarta Sans", system-ui, sans-serif'
  const sans = '"Plus Jakarta Sans", system-ui, sans-serif'

  const rawLines = overlay
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  let sku = ''
  let qty = ''
  let vehicle = ''

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    if (line.toUpperCase().startsWith('SL::') || line.toUpperCase().startsWith('SL:')) {
      qty = line.replace(/^SL::?/i, '').trim()
    } else if (line.toUpperCase().startsWith('SKU::')) {
      sku = line.replace(/^SKU::/i, '').trim()
    } else if (line.toUpperCase().startsWith('VEH::')) {
      vehicle = line.replace(/^VEH::/i, '').trim()
    } else {
      // Fallback cho dữ liệu cũ nếu chưa update cache
      if (i === 0 && !qty && !sku) {
        sku = line
      } else if (!vehicle) {
        vehicle = line
      }
    }
  }

  const vehiclePlate =
    (externalVehiclePlate || '').trim() ||
    vehicle ||
    parseVehicleFromStationOverlay(overlay)

  if (fallbackLocationCode) {
    ctx.save()
    if (highlighted) {
      ctx.shadowColor = '#3AAFA9'
      ctx.shadowBlur = Math.max(5, half * 0.1)
    }
    drawLocationTitleAboveShelf(ctx, x, y, half, fallbackLocationCode, {
      scale,
      highlighted,
    })
    ctx.restore()
  }

  if (vehiclePlate) {
    ctx.save()
    if (highlighted) {
      ctx.shadowColor = '#3AAFA9'
      ctx.shadowBlur = Math.max(5, half * 0.1)
    }
    drawVehiclePlateBelowShelf(ctx, x, y, half, vehiclePlate, {
      scale,
      highlighted,
    })
    ctx.restore()
  }

  if (rawLines.length === 0) return

  ctx.save()
  if (highlighted) {
    ctx.shadowColor = '#3AAFA9'
    ctx.shadowBlur = Math.max(5, half * 0.1)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const pendingConfirm = overlayVariant === 'pendingConfirm'
  const drawDivider = (yPos: number) => {
    ctx.beginPath()
    ctx.moveTo(x - half * 0.8, yPos)
    ctx.lineTo(x + half * 0.8, yPos)
    ctx.strokeStyle = pendingConfirm
      ? SHELF_PENDING_CONFIRM_TECH.divider
      : 'rgba(255, 255, 255, 0.95)'
    ctx.lineWidth = Math.max(4, half * 0.07)
    ctx.stroke()
  }


  const preferredSku = half * 0.27 * scale
  const minSku = Math.max(5, half * 0.13 * scale)
  const baseSkuSize = sku ? fitFontSize(ctx, sku, maxW, preferredSku, minSku, '700', mono) : 0
  const skuSize = sku ? Math.max(4.5, Math.min(baseSkuSize * 0.86, half * 0.2 * scale)) : 0

  const preferredQty = half * 0.35 * scale
  const minQty = Math.max(6, half * 0.16 * scale)
  const baseQtySize = qty ? fitFontSize(ctx, qty, maxW, preferredQty, minQty, '800', sans) : 0
  const qtySize = qty ? Math.max(6, Math.min(baseQtySize, half * 0.35 * scale)) : 0

  const skuStep = sku ? skuSize * 1.2 : 0
  const qtyStep = qty ? qtySize * 1.2 : 0
  const lineGap = half * 0.12 * scale

  const partsCount = (sku ? 1 : 0) + (qty ? 1 : 0)
  const numDividers = Math.max(0, partsCount - 1)

  const blockHeight = skuStep + qtyStep + numDividers * lineGap
  let cursorY = y - blockHeight / 2

  if (sku) {
    cursorY += skuStep / 2
    ctx.font = `700 ${skuSize}px ${mono}`
    ctx.fillStyle = pendingConfirm
      ? SHELF_PENDING_CONFIRM_TECH.labelPrimary
      : highlighted
        ? '#FFFFFF'
        : SHELF_TECH.labelPrimary
    ctx.fillText(fitLabelText(ctx, sku, maxW), x, cursorY)

    if (qty) {
      let dividerY = cursorY + skuStep / 2 + lineGap / 2
      drawDivider(dividerY)
      cursorY += skuStep / 2 + lineGap
    } else {
      cursorY += skuStep / 2
    }
  }

  if (qty) {
    cursorY += qtyStep / 2
    ctx.font = `800 ${qtySize}px ${sans}`
    ctx.fillStyle = pendingConfirm
      ? SHELF_PENDING_CONFIRM_TECH.labelQty
      : highlighted
        ? '#D7ECEB'
        : '#FFFFFF'
    ctx.fillText(fitLabelText(ctx, qty, maxW), x, cursorY)
    cursorY += qtyStep / 2
  }

  ctx.restore()
}

/**
 * Label trong ô: tên vị trí (bin) → SKU → SL → Full.
 * @param textScale — hệ số phóng chữ (operator map dùng > 1).
 */
export function drawShelfStockLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  label: LocationStockLabel | undefined,
  textScale = 1,
  highlighted = false,
  highlightOutbound = false,
  externalVehiclePlate?: string,
) {
  if (!label) return

  ctx.save()
  if (highlighted) {
    ctx.shadowColor = '#3AAFA9'
    ctx.shadowBlur = Math.max(5, half * 0.1)
  }
  const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 1
  const maxW = half * 1.85
  const mono = '"Plus Jakarta Sans", system-ui, sans-serif'
  const sans = '"Plus Jakarta Sans", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (label.is_empty) {
    const emptyLabel =
      formatDisplayBin(label.bin, label.location_type) ||
      (label.location_code || '').trim() ||
      ''
    if (!emptyLabel) {
      ctx.restore()
      return
    }
    const isBypass = (label.bin || '').toUpperCase().startsWith('BP')
    drawLocationTitleAboveShelf(ctx, x, y, half, emptyLabel, {
      scale,
      highlighted,
      nameColor: isBypass
        ? '#dc2626'
        : highlightOutbound
          ? OUTBOUND_STATION_TECH.emptyLabel
          : SHELF_TECH.labelEmpty,
      nameColorHighlighted: '#FFFFFF',
    })
    const emptyPlate = (externalVehiclePlate || '').trim()
    if (emptyPlate) {
      drawVehiclePlateBelowShelf(ctx, x, y, half, emptyPlate, {
        scale,
        highlighted,
      })
    }
    ctx.restore()
    return
  }

  let rawSku = String(label.product_sku || label.product_name || 'Hàng')
  let sku = rawSku.length > 6 ? rawSku.slice(0, 4) + rawSku.slice(6) : rawSku
  // Tên vị trí (mã bin) — luôn hiện khi có, không phụ thuộc SKU.
  const locationText = formatDisplayBin(label.bin, label.location_type)

  const qty =
    Number.isInteger(label.quantity) || Math.abs(label.quantity % 1) < 1e-6
      ? String(Math.round(label.quantity))
      : String(label.quantity)
  const lineSl = qty

  const preferredSku = half * 0.27 * scale
  const minSku = Math.max(5, half * 0.13 * scale)
  const baseSkuSize = fitFontSize(ctx, sku, maxW, preferredSku, minSku, '700', mono)
  const metaSize = Math.max(4.5, Math.min(baseSkuSize * 0.86, half * 0.2 * scale))
  const skuSize = metaSize
  const qtySize = Math.max(6, Math.min(baseSkuSize * 1.2, half * 0.3 * scale)) // Smaller count

  if (locationText) {
    const isBypass = (label.bin || '').toUpperCase().startsWith('BP')
    drawLocationTitleAboveShelf(ctx, x, y, half, locationText, {
      scale,
      highlighted,
      nameColor: isBypass ? '#dc2626' : '#64748b',
      nameColorHighlighted: '#FFFFFF',
    })
  }

  const stockPlate = (externalVehiclePlate || '').trim()
  if (stockPlate) {
    drawVehiclePlateBelowShelf(ctx, x, y, half, stockPlate, {
      scale,
      highlighted,
    })
  }

  const skuStep = skuSize * 1.12
  const metaStep = metaSize * 1.15
  const qtyStep = qtySize * 1.15
  const lot = (label.lot_number || '').trim()

  const lineGap = half * 0.12 * scale
  const numDividers = lot ? 2 : 1
  const blockHeight = skuStep + qtyStep + (lot ? metaStep : 0) + numDividers * lineGap
  let cursorY = y - blockHeight / 2 + skuStep / 2

  const drawDivider = (yPos: number) => {
    ctx.beginPath()
    ctx.moveTo(x - half * 0.8, yPos)
    ctx.lineTo(x + half * 0.8, yPos)
    ctx.strokeStyle = highlighted ? '#ffffff' : 'rgba(255, 255, 255, 0.92)'
    ctx.lineWidth = Math.max(4, half * 0.07)
    ctx.stroke()
  }

  // SKU
  ctx.font = `700 ${skuSize}px ${mono}`
  ctx.fillStyle = highlighted ? '#FFFFFF' : SHELF_TECH.labelPrimary
  ctx.fillText(fitLabelText(ctx, sku, maxW), x, cursorY)

  let dividerY = cursorY + skuStep / 2 + lineGap / 2
  drawDivider(dividerY)
  cursorY += skuStep / 2 + qtyStep / 2 + lineGap

  // SL (Quantity)
  ctx.font = `800 ${qtySize}px ${sans}` // Bolder and larger
  ctx.fillStyle = highlighted ? '#D7ECEB' : SHELF_TECH.labelPrimary
  ctx.fillText(fitLabelText(ctx, lineSl, maxW), x, cursorY)

  // Lot nguyên bản từ DB, ví dụ 040526
  if (lot) {
    dividerY = cursorY + qtyStep / 2 + lineGap / 2
    drawDivider(dividerY)
    cursorY += qtyStep / 2 + metaStep / 2 + lineGap

    ctx.font = `700 ${metaSize}px ${mono}`
    ctx.fillStyle = highlighted ? '#D7ECEB' : SHELF_TECH.labelPrimary
    ctx.fillText(fitLabelText(ctx, lot, maxW), x, cursorY)
  }
  ctx.restore()
}

export function drawOutboundSortingShelfLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  label: LocationStockLabel | undefined,
  overlay: string | undefined,
  textScale = 1,
  highlighted = false,
  highlightOutbound = false,
  fallbackCode = '',
) {
  ctx.save()
  if (highlighted) {
    ctx.shadowColor = '#3AAFA9'
    ctx.shadowBlur = Math.max(5, half * 0.1)
  }
  const scale = Number.isFinite(textScale) && textScale > 0 ? textScale : 1
  const maxW = half * 1.85
  const mono = '"Plus Jakarta Sans", system-ui, sans-serif'
  const sans = '"Plus Jakarta Sans", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let locationText = fallbackCode
  if (label && !label.is_empty) {
    locationText = formatDisplayBin(label.bin, label.location_type)
  }
  const isVTC = locationText.toUpperCase().startsWith('VTC') || locationText.toUpperCase().startsWith('CX')

  // Vẽ tên vị trí (bin) BÊN NGOÀI, PHÍA TRÊN ô
  if (locationText) {
    const isBypass = (label?.bin || fallbackCode).toUpperCase().startsWith('BP')
    const binLabelSize = Math.max(6, half * 0.26 * scale)
    ctx.font = `700 ${binLabelSize}px ${sans}`
    ctx.fillStyle = isBypass ? '#dc2626' : '#64748b'
    const margin = binLabelSize * 0.8
    ctx.fillText(locationText, x, y - half - margin)
  }

  const lines = overlay ? overlay.split('\n') : []

  // Xử lý riêng cho Sorting Station (CC / ST)
  if (!isVTC) {
    const vehicleNumber = lines[0]?.trim() || ''
    const overlayQty = lines[1]?.replace(/^SL:\s*/i, '') || ''

    if (vehicleNumber) {
      // Ô trống chờ chia nhưng có gán xe -> Hiện Biển số xe & SL
      const skuSize = Math.max(5, half * 0.2 * scale)
      const qtySize = Math.max(6, half * 0.35 * scale)
      const vehicleSize = skuSize

      const vehicleStep = vehicleSize * 1.15
      const qtyStep = qtySize * 1.15
      const lineGap = half * 0.12 * scale

      const hasQty = !!overlayQty
      const numDividers = hasQty ? 2 : 1
      const blockHeight = vehicleStep + (hasQty ? qtyStep : 0) + numDividers * lineGap
      let cursorY = y - blockHeight / 2 + vehicleStep / 2

      const drawDivider = (yPos: number) => {
        ctx.beginPath()
        ctx.moveTo(x - half * 0.8, yPos)
        ctx.lineTo(x + half * 0.8, yPos)
        ctx.strokeStyle = highlighted ? '#ffffff' : 'rgba(255, 255, 255, 0.92)'
        ctx.lineWidth = Math.max(4, half * 0.07)
        ctx.stroke()
      }

      ctx.font = `700 ${vehicleSize}px ${mono}`
      ctx.fillStyle = highlighted ? '#FFFFFF' : SHELF_TECH.labelPrimary
      ctx.fillText(fitLabelText(ctx, vehicleNumber, maxW), x, cursorY)

      if (hasQty) {
        let dividerY = cursorY + vehicleStep / 2 + lineGap / 2
        drawDivider(dividerY)
        cursorY += vehicleStep / 2 + qtyStep / 2 + lineGap

        ctx.font = `800 ${qtySize}px ${sans}`
        ctx.fillStyle = highlighted ? '#D7ECEB' : SHELF_TECH.labelPrimary
        ctx.fillText(fitLabelText(ctx, overlayQty, maxW), x, cursorY)
      }
    } else {
      // Ô trống hoàn toàn -> Hiển thị mã bin ở giữa
      const emptyLabel = locationText || fallbackCode || ''
      if (!emptyLabel) {
        ctx.restore()
        return
      }
      const binLabelSize = Math.max(6, half * 0.26 * scale)
      const isBypass = (label?.bin || fallbackCode).toUpperCase().startsWith('BP')

      ctx.font = `700 ${binLabelSize}px ${sans}`
      ctx.fillStyle = highlighted
        ? '#FFFFFF'
        : isBypass
          ? '#dc2626'
          : highlightOutbound
            ? OUTBOUND_STATION_TECH.emptyLabel
            : SHELF_TECH.labelEmpty
      const margin = binLabelSize * 0.8
      ctx.fillText(fitLabelText(ctx, emptyLabel, maxW), x, y - half - margin)
    }
    ctx.restore()
    return
  }

  // Xử lý cho VTC (Luôn hiển thị 3 tầng nếu có dữ liệu, kể cả khi label empty do dùng dữ liệu mô phỏng)
  let rawSku = String(label?.product_sku || label?.product_name || lines[0]?.trim() || '')
  if (!rawSku && (!label || label.is_empty)) {
    // VTC hoàn toàn trống
    const emptyLabel = locationText || fallbackCode || ''
    if (!emptyLabel) {
      ctx.restore()
      return
    }
    const binLabelSize = Math.max(6, half * 0.26 * scale)
    const isBypass = (label?.bin || fallbackCode).toUpperCase().startsWith('BP')

    ctx.font = `700 ${binLabelSize}px ${sans}`
    ctx.fillStyle = highlighted
      ? '#FFFFFF'
      : isBypass
        ? '#dc2626'
        : highlightOutbound
          ? OUTBOUND_STATION_TECH.emptyLabel
          : SHELF_TECH.labelEmpty
    const margin = binLabelSize * 0.8
    ctx.fillText(fitLabelText(ctx, emptyLabel, maxW), x, y - half - margin)
    ctx.restore()
    return
  }

  let sku = rawSku.length > 6 ? rawSku.slice(0, 4) + rawSku.slice(6) : rawSku

  let qty = ''
  if (label && label.quantity != null) {
    qty = Number.isInteger(label.quantity) || Math.abs(label.quantity % 1) < 1e-6
      ? String(Math.round(label.quantity))
      : String(label.quantity)
  }

  const overlayQty = lines[1]?.replace(/^SL:\s*/i, '') || ''
  if (!qty || qty === '0') qty = overlayQty

  // Lấy vehicle number từ dòng 3 của overlay nếu có
  const vehicleNumber = lines[2]?.trim() || ''

  const preferredSku = half * 0.27 * scale
  const minSku = Math.max(5, half * 0.13 * scale)
  const baseSkuSize = fitFontSize(ctx, sku, maxW, preferredSku, minSku, '700', mono)
  const metaSize = Math.max(4.5, Math.min(baseSkuSize * 0.86, half * 0.2 * scale))
  const skuSize = metaSize
  const qtySize = Math.max(6, Math.min(baseSkuSize * 1.5, half * 0.35 * scale))

  const skuStep = skuSize * 1.12
  const metaStep = metaSize * 1.15
  const qtyStep = qtySize * 1.15

  const lineGap = half * 0.12 * scale
  const hasVehicle = !!vehicleNumber
  const numDividers = hasVehicle ? 2 : 1
  const blockHeight = skuStep + qtyStep + (hasVehicle ? metaStep : 0) + numDividers * lineGap
  let cursorY = y - blockHeight / 2 + skuStep / 2

  const drawDivider = (yPos: number) => {
    ctx.beginPath()
    ctx.moveTo(x - half * 0.8, yPos)
    ctx.lineTo(x + half * 0.8, yPos)
    ctx.strokeStyle = highlighted ? '#ffffff' : 'rgba(255, 255, 255, 0.92)'
    ctx.lineWidth = Math.max(4, half * 0.07)
    ctx.stroke()
  }

  // DÒNG 1: SKU
  ctx.font = `700 ${skuSize}px ${mono}`
  ctx.fillStyle = highlighted ? '#FFFFFF' : SHELF_TECH.labelPrimary
  ctx.fillText(fitLabelText(ctx, sku, maxW), x, cursorY)

  let dividerY = cursorY + skuStep / 2 + lineGap / 2
  drawDivider(dividerY)
  cursorY += skuStep / 2 + qtyStep / 2 + lineGap

  // DÒNG 2: QUANTITY
  ctx.font = `800 ${qtySize}px ${sans}`
  ctx.fillStyle = highlighted ? '#D7ECEB' : SHELF_TECH.labelPrimary
  ctx.fillText(fitLabelText(ctx, qty, maxW), x, cursorY)

  // DÒNG 3: VEHICLE NUMBER
  if (hasVehicle) {
    dividerY = cursorY + qtyStep / 2 + lineGap / 2
    drawDivider(dividerY)
    cursorY += qtyStep / 2 + metaStep / 2 + lineGap

    ctx.font = `700 ${metaSize}px ${mono}`
    ctx.fillStyle = highlighted ? '#D7ECEB' : SHELF_TECH.labelPrimary
    ctx.fillText(fitLabelText(ctx, vehicleNumber, maxW), x, cursorY)
  }
  ctx.restore()
}
