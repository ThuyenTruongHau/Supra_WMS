export type OutboundDisplayZone = {
  id: number;
  name: string;
  zoneIds: number[];
};

/** Hai ô tổng quan xuất kho. `id` là zone trên URL chi tiết; `zoneIds` là map của ô đó. */
export const OUTBOUND_DISPLAY_ZONES: OutboundDisplayZone[] = [
  {
    id: 8,
    name: "Khu vực chia chọn (Sorting Zone 1)",
    zoneIds: [8, 10],
  },
  {
    id: 9,
    name: "Khu vực xuất hàng (Sorting Zone 2)",
    zoneIds: [9, 11],
  },
];

/** Cả hai cặp, dùng khi một canvas cần vẽ đủ hai khu. */
export const OUTBOUND_MAP_ZONE_IDS = [8, 10, 9, 11];

export function outboundMapZoneIdsFor(zoneId: number): number[] {
  return OUTBOUND_DISPLAY_ZONES.find((zone) => zone.id === zoneId)?.zoneIds ?? [];
}

const OUTBOUND_DETAIL_ZONE_IDS = new Set<number>(
  OUTBOUND_DISPLAY_ZONES.map((zone) => zone.id),
);

export function isOutboundDetailZoneId(zoneId: number): boolean {
  return OUTBOUND_DETAIL_ZONE_IDS.has(zoneId);
}
