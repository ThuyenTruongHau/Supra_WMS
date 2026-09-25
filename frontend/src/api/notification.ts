import axiosInstance from "./axiosInstance";
import type {
  GetNotificationsParams,
  Notification,
  NotificationListResponse,
} from "@/types/notification";

const BASE = "/api/v1/notifications";

export const listNotificationsApi = async (
  params: GetNotificationsParams,
): Promise<NotificationListResponse> => {
  const { data } = await axiosInstance.get<NotificationListResponse>(BASE, {
    params: {
      warehouse_id: params.warehouse_id,
      page: params.page ?? 1,
      page_size: params.page_size ?? 20,
      q: params.q,
    },
  });
  return data;
};

export const resolveNotificationApi = async (
  notificationId: number,
): Promise<Notification> => {
  const { data } = await axiosInstance.post<Notification>(
    `${BASE}/${notificationId}/resolve`,
  );
  return data;
};
