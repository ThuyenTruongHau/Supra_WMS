import { useQuery } from "@tanstack/react-query";
import { getRobotDataApi } from "@/api/robot";

export function useRobotData(enabled = true) {
  return useQuery({
    queryKey: ["robotData"],
    queryFn: ({ signal }) => getRobotDataApi(signal),
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
