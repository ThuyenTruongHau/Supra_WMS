import type { MapData } from '@/types/warehouseMap';

const MAP_DEBUG_PREFIX = '[WarehouseMap]';

export interface ParsedMapNode {
  x: number;
  y: number;
  type: number;
  content: string;
  name: string;
  isTurn: number;
  shelfIsTurn: number;
  extraTypes: number[];
}

export function buildKeyIndex(keys: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  keys.forEach((key, position) => {
    index[key] = position;
  });
  return index;
}

export function isRenderableMapData(data: MapData | null | undefined): data is MapData {
  return Boolean(
    data &&
      Array.isArray(data.nodeKeys) &&
      data.nodeKeys.length > 0 &&
      Array.isArray(data.lineKeys) &&
      data.lineKeys.length > 0 &&
      Array.isArray(data.nodeArr) &&
      Array.isArray(data.lineArr) &&
      data.width > 0 &&
      data.height > 0,
  );
}

export function parseMapNode(
  row: (number | string | number[])[],
  nodeKeys: string[],
  mapHeight: number,
): ParsedMapNode {
  const index = buildKeyIndex(nodeKeys);

  return {
    x: row[index.x] as number,
    y: mapHeight - (row[index.y] as number),
    type: row[index.type] as number,
    content: row[index.content] as string,
    name: row[index.name] as string,
    isTurn: (row[index.isTurn] as number) ?? 0,
    shelfIsTurn: (row[index.shelfIsTurn] as number) ?? 0,
    extraTypes: (row[index.extraTypes] as number[]) ?? [],
  };
}

export function parseMapNodes(data: MapData): ParsedMapNode[] {
  return data.nodeArr.map((row) => parseMapNode(row, data.nodeKeys, data.height));
}

/** Khoảng cách gần nhất giữa các shelf (world units). */
export function computeMinShelfSpacing(
  nodes: Array<{ x: number; y: number; type: number }>,
): number {
  const shelves = nodes.filter((node) => node.type === 1);
  if (shelves.length < 2) return Number.POSITIVE_INFINITY;

  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < shelves.length; i++) {
    for (let j = i + 1; j < shelves.length; j++) {
      const dx = shelves[i].x - shelves[j].x;
      const dy = shelves[i].y - shelves[j].y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < min) min = dist;
    }
  }
  return min;
}

/**
 * Nửa cạnh ô shelf: ưu tiên baseSize, nhưng không vượt quá khoảng cách nút
 * (tránh chồng ô → nhìn kích thước không đều).
 * fillRatio 0.42 ≈ chừa ~16% khe giữa các ô.
 */
export function computeShelfHalfSize(
  baseSize: number,
  minShelfSpacing: number,
  sizeFactor = 0.7,
  fillRatio = 0.42,
): number {
  const fromBase = baseSize * sizeFactor;
  if (!Number.isFinite(minShelfSpacing) || minShelfSpacing <= 0) {
    return fromBase;
  }
  return Math.min(fromBase, minShelfSpacing * fillRatio);
}

const GRID_AXIS_TOLERANCE = 80;

function uniqueAxisValues(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[] = [];
  for (const value of sorted) {
    const last = groups[groups.length - 1];
    if (last === undefined || Math.abs(value - last) > GRID_AXIS_TOLERANCE) {
      groups.push(value);
    }
  }
  return groups;
}

function minPositiveGap(sorted: number[]): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = sorted[i] - sorted[i - 1];
    if (gap > 0) min = Math.min(min, gap);
  }
  return min;
}

export interface OperatorGridMetrics {
  count: number;
  cols: number;
  rows: number;
  minPitchX: number;
  minPitchY: number;
  worldCellPitch: number;
}

/** Ước lượng lưới cols×rows và bước ô từ tọa độ focus nodes. */
export function computeOperatorGridMetrics(
  nodes: Array<{ x: number; y: number }>,
): OperatorGridMetrics {
  if (nodes.length === 0) {
    return {
      count: 0,
      cols: 1,
      rows: 1,
      minPitchX: Number.POSITIVE_INFINITY,
      minPitchY: Number.POSITIVE_INFINITY,
      worldCellPitch: Number.POSITIVE_INFINITY,
    };
  }

  const xs = uniqueAxisValues(nodes.map((node) => node.x));
  const ys = uniqueAxisValues(nodes.map((node) => node.y));
  const minPitchX =
    xs.length > 1 ? minPositiveGap(xs) : Number.POSITIVE_INFINITY;
  const minPitchY =
    ys.length > 1 ? minPositiveGap(ys) : Number.POSITIVE_INFINITY;
  const worldCellPitch = Math.min(minPitchX, minPitchY);

  return {
    count: nodes.length,
    cols: Math.max(xs.length, 1),
    rows: Math.max(ys.length, 1),
    minPitchX,
    minPitchY,
    worldCellPitch,
  };
}

export function boundsFromFocusNodes(
  nodes: Array<{ x: number; y: number }>,
  pad: number,
): MapContentBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

export interface OperatorMapViewportInput {
  canvasWidth: number;
  canvasHeight: number;
  fitPaddingRatio: number;
  shelfFillRatio: number;
  baseNodeSize: number;
  shelfSizeFactor: number;
}

export interface OperatorMapViewport {
  bounds: MapContentBounds;
  scale: number;
  shelfHalf: number;
  cols: number;
  rows: number;
  offsetX: number;
  offsetY: number;
}

export interface OperatorVirtualGridCell {
  content: string;
  col: number;
  row: number;
  screenX: number;
  screenY: number;
  screenHalf: number;
}

export interface OperatorVirtualGridLayout {
  cells: OperatorVirtualGridCell[];
  cols: number;
  rows: number;
  gapPx: number;
  columnGapPx: number;
  rowGapPx: number;
}

function nearestAxisIndex(value: number, axis: number[]): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < axis.length; i += 1) {
    const dist = Math.abs(value - axis[i]);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Gán mỗi ô focus vào cột/hàng lưới (giữ thứ tự tương đối từ map). */
export function assignFocusNodesToGrid(
  nodes: Array<{ x: number; y: number; content: string }>,
): Array<{
  content: string;
  col: number;
  row: number;
  colCount: number;
  rowCount: number;
}> {
  if (nodes.length === 0) return [];

  // Override for exactly 28 BCN nodes (CN01->CN28) to force 7x4 grid
  const isAllCN = nodes.length > 0 && nodes.every(n => n.content.includes('BCN'));
  if (isAllCN && nodes.length === 28) {
    let allParsed = true;
    const parsedNodes = nodes.map(n => {
      const match = n.content.match(/BCN(\d+)/i);
      if (match) {
        return { ...n, num: parseInt(match[1], 10) };
      }
      allParsed = false;
      return { ...n, num: 0 };
    });
    
    if (allParsed) {
      // Sort by num to ensure correct sequential layout
      parsedNodes.sort((a, b) => a.num - b.num);
      return parsedNodes.map((node, index) => ({
        content: node.content,
        col: index % 7,
        row: Math.floor(index / 7),
        colCount: 7,
        rowCount: 4,
      }));
    }
  }

  const xs = uniqueAxisValues(nodes.map((node) => node.x));
  const ys = uniqueAxisValues(nodes.map((node) => node.y));
  const colCount = Math.max(xs.length, 1);
  const rowCount = Math.max(ys.length, 1);

  return nodes.map((node) => ({
    content: node.content,
    col: nearestAxisIndex(node.x, xs),
    row: nearestAxisIndex(node.y, ys),
    colCount,
    rowCount,
  }));
}

/**
 * Lưới ảo screen-space: chia đều ô trong canvas, bỏ qua khoảng cách world.
 * Ô cùng kích thước, vừa khung, khe nhỏ giữa các ô.
 */
export function computeOperatorVirtualGridLayout(
  focusNodes: Array<{ x: number; y: number; content: string }>,
  input: {
    canvasWidth: number;
    canvasHeight: number;
    fitPaddingRatio: number;
    cellGapPx?: number;
    cellFillRatio?: number;
  },
): OperatorVirtualGridLayout | null {
  if (focusNodes.length === 0) return null;

  const assigned = assignFocusNodesToGrid(focusNodes);
  const cols = assigned[0]?.colCount ?? 1;
  const rows = assigned[0]?.rowCount ?? 1;
  const gapPx = Math.max(input.cellGapPx ?? 8, 2);
  const fill = Math.min(Math.max(input.cellFillRatio ?? 0.9, 0.5), 0.98);
  const pad =
    Math.min(input.canvasWidth, input.canvasHeight) * input.fitPaddingRatio;
  const availW = Math.max(input.canvasWidth - pad * 2, 1);
  const availH = Math.max(input.canvasHeight - pad * 2, 1);

  const slotW = Math.max((availW - gapPx * (cols + 1)) / cols, 0);
  const slotH = Math.max((availH - gapPx * (rows + 1)) / rows, 0);
  const cellSize = Math.max(Math.min(slotW, slotH) * fill, 2); // Ensure positive size
  const screenHalf = cellSize / 2;
  const columnGapPx = Math.max(slotW + gapPx - cellSize, 2);
  const rowGapPx = Math.max(slotH + gapPx - cellSize, 2);

  const cells: OperatorVirtualGridCell[] = assigned.map(
    ({ content, col, row }) => ({
      content,
      col,
      row,
      screenX: pad + gapPx + col * (slotW + gapPx) + slotW / 2,
      screenY: pad + gapPx + row * (slotH + gapPx) + slotH / 2,
      screenHalf,
    }),
  );

  return {
    cells,
    cols,
    rows,
    gapPx,
    columnGapPx,
    rowGapPx,
  };
}

/**
 * @deprecated Dùng computeOperatorVirtualGridLayout cho operator UI.
 */
export function computeOperatorMapViewport(
  focusNodes: Array<{ x: number; y: number }>,
  input: OperatorMapViewportInput,
): OperatorMapViewport | null {
  if (focusNodes.length === 0) return null;

  const grid = computeOperatorGridMetrics(focusNodes);
  const pad = Math.min(input.canvasWidth, input.canvasHeight) * input.fitPaddingRatio;
  const availW = Math.max(input.canvasWidth - pad * 2, 1);
  const availH = Math.max(input.canvasHeight - pad * 2, 1);

  const pitch = Number.isFinite(grid.worldCellPitch)
    ? grid.worldCellPitch
    : input.baseNodeSize * input.shelfSizeFactor;

  const shelfHalf = pitch * input.shelfFillRatio * 0.5;
  const bounds = boundsFromFocusNodes(focusNodes, shelfHalf * 0.45);

  const scaleFromBounds = Math.min(
    availW / bounds.width,
    availH / bounds.height,
  );

  let scaleFromGrid = scaleFromBounds;
  const hasGridPitch =
    grid.cols > 0 &&
    grid.rows > 0 &&
    Number.isFinite(grid.minPitchX) &&
    Number.isFinite(grid.minPitchY) &&
    grid.minPitchX > 0 &&
    grid.minPitchY > 0;

  if (hasGridPitch) {
    scaleFromGrid = Math.min(
      availW / (grid.cols * grid.minPitchX),
      availH / (grid.rows * grid.minPitchY),
    );
  }

  // Ưu tiên scale theo lưới để ô phủ gần hết khung; bounds chỉ là fallback.
  const scale = hasGridPitch ? scaleFromGrid : scaleFromBounds;
  const offsetX =
    pad + (availW - bounds.width * scale) / 2 - bounds.minX * scale;
  const offsetY =
    pad + (availH - bounds.height * scale) / 2 - bounds.minY * scale;

  return {
    bounds,
    scale,
    shelfHalf,
    cols: grid.cols,
    rows: grid.rows,
    offsetX,
    offsetY,
  };
}


export function parseLinePath(
  lineRow: (string | number | (number | null)[])[],
  lineKeys: string[],
  mapHeight: number,
): { x: number; y: number }[] {
  const index = buildKeyIndex(lineKeys);
  const rawPath = lineRow[index.path];

  if (!rawPath || !Array.isArray(rawPath) || rawPath.length === 0) {
    return [];
  }

  if (Array.isArray(rawPath[0])) {
    const coords: { x: number; y: number }[] = [];
    for (const point of rawPath as unknown as number[][]) {
      if (point && point.length >= 2 && point[0] != null && point[1] != null) {
        coords.push({ x: point[0], y: mapHeight - point[1] });
      }
    }
    return coords;
  }

  const points = (rawPath as (number | null)[]).filter(
    (value): value is number => value != null && typeof value === 'number',
  );
  const length = points.length % 2 === 0 ? points.length : points.length - 1;
  const coords: { x: number; y: number }[] = [];

  for (let i = 0; i < length; i += 2) {
    coords.push({ x: points[i], y: mapHeight - points[i + 1] });
  }

  return coords;
}

export interface MapContentBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

function updateBounds(
  bounds: MapContentBounds,
  x: number,
  y: number,
): MapContentBounds {
  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
    width: 0,
    height: 0,
  };
}

export function computeMapContentBounds(data: MapData): MapContentBounds {
  let bounds: MapContentBounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    width: 0,
    height: 0,
  };

  for (const node of parseMapNodes(data)) {
    bounds = updateBounds(bounds, node.x, node.y);
  }

  for (const lineRow of data.lineArr) {
    for (const point of parseLinePath(lineRow, data.lineKeys, data.height)) {
      bounds = updateBounds(bounds, point.x, point.y);
    }
  }

  if (!Number.isFinite(bounds.minX)) {
    return {
      minX: 0,
      minY: 0,
      maxX: data.width,
      maxY: data.height,
      width: data.width,
      height: data.height,
    };
  }

  bounds.width = Math.max(bounds.maxX - bounds.minX, 1);
  bounds.height = Math.max(bounds.maxY - bounds.minY, 1);
  return bounds;
}

export function detectCoordinateMismatch(data: MapData): {
  mismatched: boolean;
  rawXMax: number | null;
  rawYMax: number | null;
  contentBounds: MapContentBounds;
} {
  const xIndex = data.nodeKeys.indexOf('x');
  const yIndex = data.nodeKeys.indexOf('y');
  let rawXMax: number | null = null;
  let rawYMax: number | null = null;

  if (xIndex >= 0 && yIndex >= 0) {
    for (const row of data.nodeArr) {
      const rawX = row[xIndex];
      const rawY = row[yIndex];
      if (typeof rawX === 'number') {
        rawXMax = rawXMax == null ? rawX : Math.max(rawXMax, rawX);
      }
      if (typeof rawY === 'number') {
        rawYMax = rawYMax == null ? rawY : Math.max(rawYMax, rawY);
      }
    }
  }

  const contentBounds = computeMapContentBounds(data);
  const mismatched =
    (rawXMax != null && rawXMax > data.width) ||
    (rawYMax != null && rawYMax > data.height) ||
    contentBounds.minY < 0 ||
    contentBounds.maxX > data.width ||
    contentBounds.maxY > data.height;

  return { mismatched, rawXMax, rawYMax, contentBounds };
}

export function summarizeMapDataForLog(data: MapData | null | undefined) {
  if (!data) {
    return { present: false };
  }

  const shelfCount = data.nodeArr.filter((row) => {
    const typeIndex = data.nodeKeys.indexOf('type');
    return typeIndex >= 0 && row[typeIndex] === 1;
  }).length;

  return {
    present: true,
    renderable: isRenderableMapData(data),
    type: data.type ?? null,
    width: data.width,
    height: data.height,
    xAttrMin: data.xAttrMin ?? null,
    yAttrMin: data.yAttrMin ?? null,
    nodeKeys: data.nodeKeys,
    lineKeys: data.lineKeys,
    nodeCount: data.nodeArr.length,
    lineCount: data.lineArr.length,
    shelfCount,
    sampleNode: data.nodeArr[0] ?? null,
    sampleLine: data.lineArr[0] ?? null,
    ...(isRenderableMapData(data)
      ? (() => {
          const mismatch = detectCoordinateMismatch(data);
          return {
            coordinateMismatch: mismatch.mismatched,
            rawXMax: mismatch.rawXMax,
            rawYMax: mismatch.rawYMax,
            contentBounds: mismatch.contentBounds,
          };
        })()
      : {}),
  };
}

export function logMapDebug(stage: string, payload: Record<string, unknown>) {
  console.info(MAP_DEBUG_PREFIX, stage, payload);
}
