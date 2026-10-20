/** Location type kho chứa — giữ nguyên prefix A trên mã bin. */
export const STORAGE_LOCATION_TYPE = 'storage'

/** Nguồn nhãn vị trí từ API map / warehouse-locations (DB `location.location_name`). */
export type LocationLabelSource = {
  location_name?: string | null
  location_code?: string | null
  /** @deprecated Chỉ dùng khi location_name trống (legacy); ưu tiên location_name. */
  bin_code?: string | null
  bin?: string | null
}

/**
 * Nhãn hiển thị thống nhất (admin + operator): `location_name` trên DB.
 * Fallback `location_code` nếu chưa đặt tên; không dùng bin_code khi đã có location_name.
 */
export function getLocationDisplayLabel(
  source: LocationLabelSource,
  locationType?: string | null,
): string {
  const name = (source.location_name ?? '').trim()
  if (name) {
    const formatted = formatDisplayBin(name, locationType)
    return formatted || name
  }
  const code = (source.location_code ?? '').trim()
  if (code) return code
  const legacyBin = (source.bin_code ?? source.bin ?? '').trim()
  if (legacyBin) {
    const formatted = formatDisplayBin(legacyBin, locationType)
    return formatted || legacyBin
  }
  return ''
}

/**
 * Chuẩn hóa mã bin khi hiển thị.
 * Type khác storage → bỏ chữ A đầu (prefix map import).
 */
export function formatDisplayBin(
  bin: string | null | undefined,
  locationType?: string | null,
): string {
  const value = (bin || '').trim()
  if (!value) return ''
  let result = value
  const locType = (locationType || '').trim()
  if (locType && locType !== STORAGE_LOCATION_TYPE) {
    if (result.length > 1 && (result[0] === 'A' || result[0] === 'a')) {
      const stripped = result.slice(1).trim()
      result = stripped || result
    }
  }

  if (result.toUpperCase().startsWith('CX')) {
    result = 'VTC' + result.slice(2)
  }

  return result
}

/** Ô VT trên map: `VT1201`, `VTC…`, hoặc mã cũ `CX…`. */
export function isVtLocationCode(code: string | null | undefined): boolean {
  const value = (code ?? '').trim().toUpperCase()
  return value.startsWith('VT') || value.startsWith('CX')
}

/** Cùng tiêu chí VT với OperatorMapCanvas / click ô trên board. */
export function isVtMapLocation(
  locationCode: string | null | undefined,
  locationName?: string | null,
): boolean {
  if (isVtLocationCode(locationCode) || isVtLocationCode(locationName)) {
    return true
  }
  return (locationName ?? '').trim().toUpperCase().startsWith('VT')
}

export function isCcLocationCode(code: string | null | undefined): boolean {
  return (code ?? '').trim().toUpperCase().startsWith('CC')
}

/** Bỏ overlay chia hàng trên ô VT — map VT chỉ dùng tồn từ API status. */
export function stripVtKeysFromOverlayLabels(
  labels: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [code, text] of Object.entries(labels)) {
    if (isVtLocationCode(code)) continue
    const trimmed = (text || '').trim()
    if (trimmed) out[code] = trimmed
  }
  return out
}

/** Nhãn trên ô map khi `LocationStockLabel.bin` đã gán qua `getLocationDisplayLabel`. */
export function stockLabelLocationText(
  label: LocationLabelSource & {
    location_type?: string | null
    bin?: string | null
  },
): string {
  const precomputed = (label.bin ?? '').trim()
  if (precomputed) return precomputed
  return getLocationDisplayLabel(label, label.location_type)
}
