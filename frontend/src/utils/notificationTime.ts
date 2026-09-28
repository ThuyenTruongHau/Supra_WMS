import dayjs from 'dayjs'

export function formatNotificationTime(value: string): string {
  const date = dayjs(value)
  const now = dayjs()
  const diffMinutes = now.diff(date, 'minute')

  if (diffMinutes < 1) return 'Vừa xong'
  if (diffMinutes < 60) return `${diffMinutes} phút trước`

  const diffHours = now.diff(date, 'hour')
  if (diffHours < 24) return `${diffHours} giờ trước`

  const diffDays = now.diff(date, 'day')
  if (diffDays === 1) return 'Hôm qua'
  if (diffDays < 7) return `${diffDays} ngày trước`

  return date.format('DD/MM/YYYY HH:mm')
}

export function isToday(value: string): boolean {
  return dayjs(value).isSame(dayjs(), 'day')
}
