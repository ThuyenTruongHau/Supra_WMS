import type { FullLocationDetail, NodeInfo } from '@/types/warehouseMap';

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export interface ResolvedMapLocation {
  locationCode: string;
  displayLabel: string;
}

/**
 * Tìm location_code từ location_name (ưu tiên), location_code, bin_code hoặc mã node trên map.
 */
export function resolveLocationFromSearchQuery(
  rawQuery: string,
  locations: FullLocationDetail[],
  shelfNodes: NodeInfo[],
): ResolvedMapLocation | null {
  const query = norm(rawQuery);
  if (!query) return null;

  type Candidate = ResolvedMapLocation & { rank: number };

  const candidates: Candidate[] = [];

  const push = (
    locationCode: string,
    displayLabel: string,
    rank: number,
  ) => {
    const code = String(locationCode).trim();
    if (!code) return;
    candidates.push({ locationCode: code, displayLabel, rank });
  };

  for (const loc of locations) {
    const name = norm(loc.location_name);
    const code = norm(loc.location_code);
    const bin = norm(loc.bin_code);
    const label =
      (loc.location_name || loc.location_code || loc.bin_code || '').trim() ||
      loc.location_code;

    if (name === query) push(loc.location_code, label, 0);
    else if (code === query) push(loc.location_code, label, 1);
    else if (bin === query) push(loc.location_code, label, 2);
    else if (name.startsWith(query)) push(loc.location_code, label, 10);
    else if (code.startsWith(query)) push(loc.location_code, label, 11);
    else if (name.includes(query)) push(loc.location_code, label, 20);
    else if (code.includes(query)) push(loc.location_code, label, 21);
    else if (bin.includes(query)) push(loc.location_code, label, 22);
  }

  for (const node of shelfNodes) {
    const content = norm(node.content);
    const name = norm(node.name);
    const label = (node.name || node.content || '').trim() || node.content;
    if (content === query) push(node.content, label, 3);
    else if (name === query) push(node.content, label, 4);
    else if (content.startsWith(query)) push(node.content, label, 12);
    else if (name.startsWith(query)) push(node.content, label, 13);
    else if (content.includes(query)) push(node.content, label, 23);
    else if (name.includes(query)) push(node.content, label, 24);
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.rank - b.rank || a.displayLabel.localeCompare(b.displayLabel));
  const best = candidates[0];
  return { locationCode: best.locationCode, displayLabel: best.displayLabel };
}

/** Tách nhiều vị trí: cách nhau bằng dấu phẩy (có hoặc không khoảng trắng). */
export function splitLocationSearchTerms(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function locationCodeExistsOnMap(
  shelfNodes: NodeInfo[],
  locationCode: string,
): boolean {
  const code = String(locationCode).trim();
  return shelfNodes.some((node) => String(node.content) === code);
}

export interface LocationSearchBatchResult {
  highlightedCodes: string[];
  foundLabels: string[];
  notFoundTerms: string[];
  notOnMapLabels: string[];
}

export function resolveLocationSearchBatch(
  rawQuery: string,
  locations: FullLocationDetail[],
  shelfNodes: NodeInfo[],
): LocationSearchBatchResult {
  const terms = splitLocationSearchTerms(rawQuery);
  const highlightedCodes: string[] = [];
  const foundLabels: string[] = [];
  const notFoundTerms: string[] = [];
  const notOnMapLabels: string[] = [];
  const seenCodes = new Set<string>();

  for (const term of terms) {
    const resolved = resolveLocationFromSearchQuery(term, locations, shelfNodes);
    if (!resolved) {
      notFoundTerms.push(term);
      continue;
    }
    if (!locationCodeExistsOnMap(shelfNodes, resolved.locationCode)) {
      notOnMapLabels.push(resolved.displayLabel);
      continue;
    }
    if (seenCodes.has(resolved.locationCode)) continue;
    seenCodes.add(resolved.locationCode);
    highlightedCodes.push(resolved.locationCode);
    foundLabels.push(resolved.displayLabel);
  }

  return {
    highlightedCodes,
    foundLabels,
    notFoundTerms,
    notOnMapLabels,
  };
}
