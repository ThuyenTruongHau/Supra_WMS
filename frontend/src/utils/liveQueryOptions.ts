/** Warehouse operational data — always fetch fresh from API. */
export const LIVE_QUERY_OPTIONS = {
  staleTime: 0,
  gcTime: 0,
  refetchOnMount: "always" as const,
};

/** Query roots whose data depends on stock reservations and location occupancy. */
export const INVENTORY_QUERY_ROOTS = [
  "items",
  "item_analyze",
  "warehouse-map",
  "full-locations",
  "inbound-buffer-locations",
  "outbound-buffer-locations",
  "storage-area-locations",
  "location-detail",
] as const;
