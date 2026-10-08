import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
  callerMasanInboundApi,
  getMasanInboundDetailsApi,
} from "@/api/masan";
import type { ApiErrorResponse } from "@/types/apiError";
import type {
  MasanInboundCallerRequest,
  MasanInboundCallerResponse,
  MasanInboundDetailFilter,
} from "@/types/masan";
import { LIVE_QUERY_OPTIONS } from "@/utils/liveQueryOptions";

export const useMasanInboundDetails = (
  inboundOrderId: number | null | undefined,
  filter: MasanInboundDetailFilter | null,
) => {
  return useQuery({
    queryKey: ["masanInboundDetails", inboundOrderId, filter],
    queryFn: () => getMasanInboundDetailsApi(inboundOrderId!, filter!),
    enabled: !!inboundOrderId && !!filter,
    ...LIVE_QUERY_OPTIONS,
  });
};

export const useCallerMasanInbound = () => {
  const queryClient = useQueryClient();
  return useMutation<
    MasanInboundCallerResponse,
    AxiosError<ApiErrorResponse>,
    MasanInboundCallerRequest
  >({
    mutationFn: callerMasanInboundApi,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["masanInboundDetails"] });
      queryClient.invalidateQueries({ queryKey: ["inboundOrderDetails"] });
      queryClient.invalidateQueries({ queryKey: ["inbound_orders"] });
      queryClient.invalidateQueries({ queryKey: ["inbound_assigned_details"] });
    },
  });
};
