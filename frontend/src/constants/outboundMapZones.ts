export type OutboundDisplayZone = {
  /** URL `/export/zone/{id}` — khu operator (VT). */
  id: number;
  name: string;
  /** Zone vẽ trên map (VT + CC). */
  zoneIds: number[];
  /** Zone CC (DB id): click ô → cache Masan `cc-locations`. */
  ccZoneId: number;
  /**
   * `Zone.code` của `ccZoneId` — gửi BE `sorting-items-needed?zone=`
   * (khớp `bucket.zone` khi assign CC). Hardcode theo DB / settings.zone_cc.
   */
  ccBucketZoneCode: string;
  /** Zone VT (DB id): click ô → modal chọn mã hàng (vẫn gửi `ccBucketZoneCode` cho BE). */
  vtZoneId: number;
};

/**
 * Cặp khu operator: VT (8|9) trên map + CC (10|11) cho cache Masan.
 * Click VT → API `zone` = ccBucketZoneCode của CC tương ứng (không gửi zone id 8/9).
 */
export const OUTBOUND_DISPLAY_ZONES: OutboundDisplayZone[] = [
  {
    id: 8,
    name: "Khu vực chia chọn 1",
    zoneIds: [8, 10],
    vtZoneId: 8,
    ccZoneId: 10,
    ccBucketZoneCode: "Zone_CC_01",
  },
  {
    id: 9,
    name: "Khu vực chia chọn 2",
    zoneIds: [9, 11],
    vtZoneId: 9,
    ccZoneId: 11,
    ccBucketZoneCode: "Zone_CC_02",
  },
];

/** Param `zone` cho Masan sorting-items-needed (Zone.code CC 10 hoặc 11). */
export function outboundCcBucketZoneCodeFor(displayZoneId: number): string | null {
  return (
    OUTBOUND_DISPLAY_ZONES.find((zone) => zone.id === displayZoneId)
      ?.ccBucketZoneCode ?? null
  );
}

export function outboundCcZoneIdFor(displayZoneId: number): number | null {
  return (
    OUTBOUND_DISPLAY_ZONES.find((zone) => zone.id === displayZoneId)?.ccZoneId ??
    null
  );
}

/** Cả hai cặp, dùng khi một canvas cần vẽ đủ hai khu. */
export const OUTBOUND_MAP_ZONE_IDS = [8, 10, 9, 11];

export function outboundMapZoneIdsFor(zoneId: number): number[] {
  return OUTBOUND_DISPLAY_ZONES.find((zone) => zone.id === zoneId)?.zoneIds ?? [];
}

/** Zone CC — click chi tiết cache (`cc-locations`). */
export function outboundClickableZoneIdsFor(zoneId: number): number[] {
  const ccZoneId = outboundCcZoneIdFor(zoneId);
  return ccZoneId != null ? [ccZoneId] : [];
}

/** Zone VT — click chọn mã hàng (`sorting-items-needed`). */
export function outboundVtClickableZoneIdsFor(zoneId: number): number[] {
  const vtZoneId =
    OUTBOUND_DISPLAY_ZONES.find((zone) => zone.id === zoneId)?.vtZoneId ?? null;
  return vtZoneId != null ? [vtZoneId] : [];
}

const OUTBOUND_DETAIL_ZONE_IDS = new Set<number>(
  OUTBOUND_DISPLAY_ZONES.map((zone) => zone.id),
);

export function isOutboundDetailZoneId(zoneId: number): boolean {
  return OUTBOUND_DETAIL_ZONE_IDS.has(zoneId);
}
