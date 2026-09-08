/** Location type kho chứa — giữ nguyên prefix A trên mã bin. */
export const STORAGE_LOCATION_TYPE = 'storage'

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
