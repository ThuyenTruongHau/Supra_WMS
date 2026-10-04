import type { NodeInfo } from '@/types/warehouseMap';

// ─── Canvas Constants ───────────────────────────────────────────────────────────
//
// ZOOM_MIN is set dynamically per-map (stored in zoomMinRef) so the user can
// always zoom back out to the initial fit view, regardless of map dimensions.

export const ZOOM_MAX = 40;
export const ZOOM_FACTOR = 1.15;
export const HIT_RADIUS = 12; // world-space pixels at scale=1
export const BASE_NODE_SIZE = 200; // screen-space base size in px
export const LINE_COLOR = '#d0d0d0';
export const NODE_NORMAL_COLOR = '#9ca3af';
export const SHELF_FULL_COLOR = '#3aa6a6'; // Kệ có hàng — xanh brand sáng hơn
export const SHELF_EMPTY_COLOR = '#66625F'; // Kệ trống xám
export const SHELF_RESERVED_COLOR = '#06b6d4'; // Giữ chỗ — xanh nước biển
export const SHELF_IN_TRANSIT_COLOR = '#f97316'; // Đang luân chuyển — cam
export const SHELF_SELECTED_COLOR = '#22c55e'; // Kệ đang được chọn (picker)
export const SHELF_STROKE_COLOR = '#2d4f7c';
export const SHELF_SELECTED_STROKE_COLOR = '#15803d';
export const PADDING = 0.05; // 5% border padding when fitting to canvas
export const BOX_SELECT_DRAG_THRESHOLD = 4; // px — below this, treat as click not box
export const BOX_SELECT_FILL = 'rgba(34, 197, 94, 0.15)';
export const BOX_SELECT_STROKE = '#22c55e';

/** Type 1 (older maps) and type 12 (newer storage points) are both shelves. */
export function isShelfNodeType(type: number | null | undefined): boolean {
  return type === 1 || type === 12;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map JSON → canvas: dời gốc (xAttrMin/yAttrMin), lật trục Y.
 * Quay 90° CW chỉ bật khi `rotateClockwise90` (UI operator); admin giữ nguyên hướng map.
 */
export function toCanvasPoint(
  x: number,
  y: number,
  mapHeight: number,
  xAttrMin = 0,
  yAttrMin = 0,
  rotateClockwise90 = false,
): { x: number; y: number } {
  const canvasX = x - xAttrMin;
  const canvasY = mapHeight - (y - yAttrMin);
  if (rotateClockwise90) {
    return { x: canvasY, y: -canvasX };
  }
  return { x: canvasX, y: canvasY };
}

export function getShelfNodesInWorldRect(
  nodes: NodeInfo[],
  minWx: number,
  maxWx: number,
  minWy: number,
  maxWy: number,
): NodeInfo[] {
  return nodes.filter(
    (node) =>
      isShelfNodeType(node.type) &&
      node.content &&
      node.x >= minWx &&
      node.x <= maxWx &&
      node.y >= minWy &&
      node.y <= maxWy,
  );
}

/** Admin map: mặc định không quay 90°. */
export function parseNode(
  row: (number | string | number[])[],
  mapHeight: number,
  xAttrMin = 0,
  yAttrMin = 0,
  rotateClockwise90 = false,
): NodeInfo {
  const point = toCanvasPoint(
    row[0] as number,
    row[1] as number,
    mapHeight,
    xAttrMin,
    yAttrMin,
    rotateClockwise90,
  );
  return {
    x: point.x,
    y: point.y,
    type: row[2] as number,
    content: String(row[3]),
    name: String(row[4] ?? ''),
    isTurn: row[5] as number,
    shelfIsTurn: row[6] as number,
    extraTypes: (row[7] as number[]) ?? [],
  };
}
