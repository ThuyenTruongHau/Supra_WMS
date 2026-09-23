export type NotificationStatus = "unsolved" | "resolved";
export type NotificationType = "alert" | "significant" | "info";

export interface Notification {
  id: number;
  warehouse_id: number;
  title: string;
  message: string;
  action: string;
  notification_type: NotificationType;
  status: NotificationStatus;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface NotificationListResponse {
  items: Notification[];
  total: number;
  page: number;
  page_size: number;
}

export interface GetNotificationsParams {
  warehouse_id: number;
  page?: number;
  page_size?: number;
  q?: string;
}
