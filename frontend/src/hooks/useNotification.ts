import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotificationsApi,
  resolveNotificationApi,
} from "@/api/notification";
import type { GetNotificationsParams } from "@/types/notification";
import { LIVE_QUERY_OPTIONS } from "@/utils/liveQueryOptions";

export const NOTIFICATION_POLL_INTERVAL_MS = 2 * 60 * 1000;

export const useNotificationUnsolvedCount = (warehouseId: number) => {
  return useQuery({
    queryKey: ["notifications", "count", warehouseId],
    queryFn: () =>
      listNotificationsApi({
        warehouse_id: warehouseId,
        page: 1,
        page_size: 1,
      }),
    enabled: warehouseId > 0,
    select: (data) => data.total,
    refetchInterval: NOTIFICATION_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useNotifications = (params: GetNotificationsParams) => {
  return useQuery({
    queryKey: ["notifications", params],
    queryFn: () => listNotificationsApi(params),
    enabled: params.warehouse_id > 0,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useResolveNotification = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: number) =>
      resolveNotificationApi(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
};
