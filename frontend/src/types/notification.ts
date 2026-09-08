export type NotificationType = 'alert' | 'info' | 'success' | 'system'

export type NotificationPriority = 'high' | 'medium' | 'low'

export type NotificationCategory =
  | 'inventory'
  | 'inbound'
  | 'outbound'
  | 'audit'
  | 'robot'
  | 'system'

export interface AppNotification {
  id: string
  type: NotificationType
  priority: NotificationPriority
  category: NotificationCategory
  title: string
  message: string
  createdAt: string
  link?: string
  linkLabel?: string
  meta?: string
}

export type NotificationTab = 'all' | 'unread' | 'alert' | 'system'
