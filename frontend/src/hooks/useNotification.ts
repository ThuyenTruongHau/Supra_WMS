import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotificationsApi,
  resolveNotificationApi,
} from "@/api/notification";
import type { GetNotificationsParams } from "@/types/notification";
import { LIVE_QUERY_OPTIONS } from "@/utils/liveQueryOptions";

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
