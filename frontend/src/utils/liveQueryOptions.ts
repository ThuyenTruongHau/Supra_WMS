/** Warehouse operational data — always fetch fresh from API. */
export const LIVE_QUERY_OPTIONS = {
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
};
