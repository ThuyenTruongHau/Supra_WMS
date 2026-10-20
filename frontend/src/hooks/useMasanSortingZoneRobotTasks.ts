import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { getMasanSortingZoneRobotTasksApi } from "@/api/masan";

export function masanSortingZoneRobotTasksQueryKey(sortingZoneCode: string) {
  return ["masanSortingZoneRobotTasks", sortingZoneCode.trim()] as const;
}

export function isMasanSortingZoneRobotTasksAbortError(
  error: unknown,
): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  if (code === "ERR_CANCELED") return true;
  return axios.isCancel(error);
}

export function useMasanSortingZoneRobotTasks(
  sortingZoneCode: string | null | undefined,
  enabled: boolean,
) {
  const zone = (sortingZoneCode ?? "").trim();
  const queryEnabled = enabled && zone.length > 0;

  return useQuery({
    queryKey: masanSortingZoneRobotTasksQueryKey(zone),
    queryFn: ({ signal }) => getMasanSortingZoneRobotTasksApi(zone, signal),
    enabled: queryEnabled,
    staleTime: 0,
    placeholderData: keepPreviousData,
    refetchInterval: queryEnabled ? 5000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: queryEnabled,
    retry: (failureCount, error) => {
      if (isMasanSortingZoneRobotTasksAbortError(error)) return false;
      return failureCount < 1;
    },
  });
}
