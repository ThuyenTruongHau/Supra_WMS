/**
 * Kích thước ô kệ tự tính theo khoảng cách thực giữa các ô trong từng layout
 * (nhóm theo tiền tố mã vị trí: AG, CN, BP, CC, VT…), đảm bảo không ô nào đè nhau.
 */

export type CellNode = {
  x: number;
  y: number;
  /** Khóa layout — các node cùng nhóm dùng chung kích thước ô. */
  group?: string;
};

export type CellMetricsOptions = {
  /** Tỉ lệ ô chiếm trong một bước lưới (pitch). */
  fillRatio?: number;
  /** Khe hở tối thiểu giữa hai ô, tính theo tỉ lệ pitch. */
  minGapRatio?: number;
  /** Dải chừa phía trên ô cho tên vị trí, tính theo tỉ lệ pitch dọc. */
  titleBandRatio?: number;
  /** Giới hạn tỉ lệ rộng / cao của ô. */
  minAspect?: number;
  maxAspect?: number;
  /** Phân vị dùng để ước lượng pitch từ khoảng cách hàng xóm gần nhất. */
  percentile?: number;
  /** Kích thước ô (world) khi layout chỉ có một ô. */
  fallbackSize?: number;
};

export type CellSize = {
  w: number;
  h: number;
  titleBand: number;
  pitchX: number;
  pitchY: number;
};

export type CellLayout = {
  sizes: CellSize[];
  byGroup: Map<string, CellSize>;
};

export type CellBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

const DEFAULTS: Required<CellMetricsOptions> = {
  fillRatio: 0.86,
  minGapRatio: 0.1,
  titleBandRatio: 0,
  minAspect: 0.5,
  maxAspect: 2.5,
  percentile: 0.1,
  fallbackSize: 600,
};

const DEFAULT_GROUP = '__default__';
/** Hai node gần nhau hơn tỉ lệ này của pitch coi là trùng dữ liệu, không dùng để co ô. */
const DUPLICATE_RATIO = 0.25;
/** Không co ô nhỏ hơn tỉ lệ này so với kích thước tính từ pitch. */
const MIN_SHRINK = 0.35;
/** Hàng xóm "ngang" khi |dy| <= |dx| * hệ số này (và ngược lại cho "dọc"). */
const AXIS_ALIGN_RATIO = 0.35;

/** AG386 / R1_C1_L1_BAG386 → "AG"; CN001 → "CN". */
export function layoutGroupKey(label: string | null | undefined): string {
  const raw = (label ?? '').trim();
  if (!raw) return DEFAULT_GROUP;
  const bin = raw.replace(/^R\d+[_-]C\d+[_-]L\d+[_-]B/i, '');
  const prefix = bin.match(/^[A-Za-z]+/);
  return prefix ? prefix[0].toUpperCase() : DEFAULT_GROUP;
}

function percentileOf(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function axisPitches(
  nodes: CellNode[],
  percentile: number,
): { pitchX: number | null; pitchY: number | null } {
  const horizontal: number[] = [];
  const vertical: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    let bestH = Number.POSITIVE_INFINITY;
    let bestV = Number.POSITIVE_INFINITY;
    const a = nodes[i];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = Math.abs(a.x - nodes[j].x);
      const dy = Math.abs(a.y - nodes[j].y);
      if (dx < 1e-6 && dy < 1e-6) continue;
      if (dy <= dx * AXIS_ALIGN_RATIO && dx < bestH) bestH = dx;
      if (dx <= dy * AXIS_ALIGN_RATIO && dy < bestV) bestV = dy;
    }
    if (Number.isFinite(bestH)) horizontal.push(bestH);
    if (Number.isFinite(bestV)) vertical.push(bestV);
  }
  return {
    pitchX: percentileOf(horizontal, percentile),
    pitchY: percentileOf(vertical, percentile),
  };
}

/** Bước lưới điển hình theo từng trục (mặc định trung vị) — null nếu trục đó chỉ có 1 hàng. */
export function estimateAxisPitch(
  nodes: CellNode[],
  percentile = 0.5,
): { pitchX: number | null; pitchY: number | null } {
  return axisPitches(nodes, percentile);
}

function sizeFromPitch(
  pitchX: number | null,
  pitchY: number | null,
  opts: Required<CellMetricsOptions>,
): CellSize {
  const px = pitchX ?? pitchY ?? opts.fallbackSize / opts.fillRatio;
  const py = pitchY ?? pitchX ?? opts.fallbackSize / opts.fillRatio;
  const titleBand = py * opts.titleBandRatio;
  let w = Math.min(px * opts.fillRatio, px * (1 - opts.minGapRatio));
  let h = Math.max(
    Math.min(py * opts.fillRatio, py * (1 - opts.minGapRatio)) - titleBand,
    py * 0.2,
  );
  if (w / h > opts.maxAspect) w = h * opts.maxAspect;
  if (w / h < opts.minAspect) h = w / opts.minAspect;
  return { w, h, titleBand, pitchX: px, pitchY: py };
}

/**
 * Tính kích thước ô cho từng node. Mỗi nhóm layout có kích thước riêng theo pitch
 * của nó, sau đó co lại (theo nhóm) nếu có cặp ô — kể cả khác nhóm — bị đè.
 */
export function computeCellLayout(
  nodes: CellNode[],
  options: CellMetricsOptions = {},
): CellLayout {
  const opts = { ...DEFAULTS, ...options };
  const groupKeys = nodes.map((n) => n.group || DEFAULT_GROUP);

  const nodesByGroup = new Map<string, CellNode[]>();
  nodes.forEach((node, i) => {
    const key = groupKeys[i];
    const list = nodesByGroup.get(key);
    if (list) list.push(node);
    else nodesByGroup.set(key, [node]);
  });

  const base = new Map<string, CellSize>();
  for (const [key, list] of nodesByGroup) {
    const { pitchX, pitchY } = axisPitches(list, opts.percentile);
    base.set(key, sizeFromPitch(pitchX, pitchY, opts));
  }

  const shrink = new Map<string, number>();
  for (const key of base.keys()) shrink.set(key, 1);

  for (let i = 0; i < nodes.length; i++) {
    const gi = groupKeys[i];
    const si = base.get(gi)!;
    for (let j = i + 1; j < nodes.length; j++) {
      const gj = groupKeys[j];
      const sj = base.get(gj)!;
      const dx = Math.abs(nodes[i].x - nodes[j].x);
      const dy = Math.abs(nodes[i].y - nodes[j].y);
      const minPitch = Math.min(si.pitchX, si.pitchY, sj.pitchX, sj.pitchY);
      if (Math.hypot(dx, dy) < minPitch * DUPLICATE_RATIO) continue;

      const gapX = opts.minGapRatio * Math.min(si.pitchX, sj.pitchX);
      const gapY = opts.minGapRatio * Math.min(si.pitchY, sj.pitchY);
      const titleBand = Math.max(si.titleBand, sj.titleBand);
      const fitX = (dx - gapX) / ((si.w + sj.w) / 2);
      const fitY = (dy - gapY - titleBand) / ((si.h + sj.h) / 2);
      const pairScale = Math.max(fitX, fitY);
      if (pairScale >= 1) continue;

      const clamped = Math.max(MIN_SHRINK, pairScale);
      shrink.set(gi, Math.min(shrink.get(gi)!, clamped));
      shrink.set(gj, Math.min(shrink.get(gj)!, clamped));
    }
  }

  const byGroup = new Map<string, CellSize>();
  for (const [key, size] of base) {
    const s = shrink.get(key)!;
    byGroup.set(key, { ...size, w: size.w * s, h: size.h * s });
  }

  return {
    sizes: groupKeys.map((key) => byGroup.get(key)!),
    byGroup,
  };
}

/**
 * Tăng chiều cao nhóm (giữ nguyên rộng), vd. CC map chia chọn — `heightMultiplier` 1.1 ≈ +10%.
 */
export function boostGroupCellHeight(
  layout: CellLayout,
  groupKeys: string[],
  groups: string[],
  heightMultiplier: number,
): CellLayout {
  if (groups.length === 0) return layout;
  const mult =
    Number.isFinite(heightMultiplier) && heightMultiplier > 1
      ? heightMultiplier
      : 1;
  if (mult === 1) return layout;
  const targetGroups = new Set(groups);
  const byGroup = new Map(layout.byGroup);
  for (const key of targetGroups) {
    const prev = byGroup.get(key);
    if (!prev || prev.h <= 0) continue;
    byGroup.set(key, { ...prev, h: prev.h * mult });
  }
  return {
    sizes: groupKeys.map((key) => byGroup.get(key)!),
    byGroup,
  };
}

/** Bounding box của các ô (đã cộng nửa ô, dải tên phía trên và dải phụ phía dưới). */
export function computeCellBounds(
  nodes: Array<{ x: number; y: number }>,
  sizes: CellSize[],
  bottomBandRatio = 0,
): CellBounds | null {
  if (nodes.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  nodes.forEach((node, i) => {
    const size = sizes[i];
    const halfW = size.w / 2;
    const halfH = size.h / 2;
    minX = Math.min(minX, node.x - halfW);
    maxX = Math.max(maxX, node.x + halfW);
    minY = Math.min(minY, node.y - halfH - size.titleBand);
    maxY = Math.max(maxY, node.y + halfH + size.titleBand * bottomBandRatio);
  });
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

/** Trung vị khoảng cách tới hàng xóm gần nhất — dùng làm "bước lưới" điển hình. */
export function medianNearestDistance(nodes: Array<{ x: number; y: number }>): number | null {
  if (nodes.length < 2) return null;
  const nearest: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (d > 1e-6 && d < best) best = d;
    }
    if (Number.isFinite(best)) nearest.push(best);
  }
  return percentileOf(nearest, 0.5);
}

/** Tìm ô chứa điểm (wx, wy); nếu chồng nhiều ô thì chọn ô có tâm gần nhất. */
export function findCellAt<T extends { x: number; y: number }>(
  nodes: T[],
  sizes: CellSize[],
  wx: number,
  wy: number,
  accept?: (node: T) => boolean,
): number {
  let found = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (accept && !accept(node)) continue;
    const dx = Math.abs(wx - node.x);
    const dy = Math.abs(wy - node.y);
    if (dx > sizes[i].w / 2 || dy > sizes[i].h / 2) continue;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      found = i;
    }
  }
  return found;
}
