/**
 * WarehouseMapCanvas
 *
 * Production-grade interactive warehouse map renderer using HTML5 Canvas.
 *
 * Features:
 *  - Loads map data from backend API via React Query
 *  - Automatically re-fetches when the selected zone changes (Zustand → queryKey)
 *  - Renderable locations API determines full/empty shelf status
 *  - Zoom centred on cursor (mousewheel) with configurable min/max
 *  - Smooth pan (left-button drag)
 *  - Lines drawn exclusively from the `path` array (index 6 of lineArr)
 *  - Nodes: type=0 → small grey circle | type=1 or 12 → shelf rectangle
 *  - Shelf size follows each layout's real pitch (mapCellMetrics) — cells never overlap
 *  - Labels drawn in screen px with level-of-detail by on-screen cell size
 *  - DPR-aware backing store so the map stays sharp at any zoom
 *  - Click detection via inverse-transform → rectangle hit-test on the cell
 *  - Admin can import new map ZIP via import dialog
 */

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from 'react';
import WarehouseMapDrawer from './WarehouseMapDrawer';
import WarehouseMapImportDialog from './WarehouseMapImportDialog';
import WarehouseMapToolbar from './WarehouseMapToolbar';
import WarehouseMapOverlays from './WarehouseMapOverlays';
import WarehouseMapLegend from './WarehouseMapLegend';
import WarehouseMapZoomControls from './WarehouseMapZoomControls';
import WarehouseMapLocationSearch from './WarehouseMapLocationSearch';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';

import { useActiveWarehouseMap, useFullLocations, useDownloadWarehouseMap } from '@/hooks/useWarehouseMap';
import { message } from '@/components/ui';
import type { MapData, NodeInfo, FullLocationDetail } from '@/types/warehouseMap';
import { formatQuantity } from '@/utils/formatQuantity';
import { getApiErrorMessage } from '@/utils/apiErrorMessage';
import {
  computeCellBounds,
  computeCellLayout,
  findCellAt,
  layoutGroupKey,
  type CellBounds,
  type CellMetricsOptions,
  type CellSize,
} from '@/utils/mapCellMetrics';
import {
  applyCameraTransform,
  applyScreenTransform,
  clearCanvas,
  clientToCanvasCss,
  resizeCanvasToContainer,
  type CanvasCssSize,
} from '@/utils/canvasDpr';
import {
  ZOOM_MAX,
  ZOOM_FACTOR,
  BASE_NODE_SIZE,
  LINE_COLOR,
  NODE_NORMAL_COLOR,
  SHELF_FULL_COLOR,
  SHELF_EMPTY_COLOR,
  SHELF_RESERVED_COLOR,
  SHELF_IN_TRANSIT_COLOR,
  SHELF_SELECTED_COLOR,
  SHELF_STROKE_COLOR,
  SHELF_SELECTED_STROKE_COLOR,
  BOX_SELECT_DRAG_THRESHOLD,
  BOX_SELECT_FILL,
  BOX_SELECT_STROKE,
  getShelfNodesInWorldRect,
  isShelfNodeType,
  parseNode,
  toCanvasPoint,
} from '@/utils/warehouseMapUtils';
import { resolveLocationSearchBatch } from '@/utils/warehouseMapLocationSearch';

// ─── Layout / zoom tuning ───────────────────────────────────────────────────────

const ADMIN_CELL_OPTIONS: CellMetricsOptions = {
  fillRatio: 0.86,
  minGapRatio: 0.1,
  titleBandRatio: 0,
  minAspect: 0.6,
  maxAspect: 2.2,
};
const FIT_PADDING_RATIO = 0.04;
const ZOOM_MIN_OF_FIT = 0.6;
/** Zoom tối đa sao cho ô nhỏ nhất to cỡ này trên màn hình. */
const MAX_CELL_SCREEN_PX = 480;
const CLICK_DRAG_THRESHOLD_PX = 4;
const WAYPOINT_RADIUS = BASE_NODE_SIZE * 0.3;

/**
 * Preview hàng trong ô có tồn (world space, phóng theo zoom): SKU, Lot, Qty mỗi thứ
 * một dòng, chữ to hết mức vừa ô; thêm "+N more..." nếu có nhiều mặt hàng.
 */
function drawShelfStockPreview(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  loc: FullLocationDetail,
) {
  const stock = loc.item_stock[0];
  const extraCount = loc.item_stock.length - 1;
  const lines = [
    stock.sku,
    stock.lot_number || 'N/A',
    `Qty: ${formatQuantity(stock.quantity, '0')}`,
  ];
  const moreText = extraCount > 0 ? `+${extraCount} more...` : '';

  const maxTextWidth = cellW * 0.9;
  const lineGap = 1.2;
  const moreRatio = 0.7;
  const lineUnits = lines.length + (moreText ? moreRatio : 0);
  let fontSize = (cellH * 0.9) / (lineUnits * lineGap);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Thu nhỏ đến khi dòng dài nhất vừa chiều ngang ô.
  ctx.font = `600 ${fontSize}px sans-serif`;
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
  if (widest > maxTextWidth) {
    fontSize *= maxTextWidth / widest;
  }
  const moreFontSize = fontSize * moreRatio;
  const lineHeight = fontSize * lineGap;
  const totalHeight = lineHeight * lines.length + (moreText ? moreFontSize * lineGap : 0);
  let currentY = y - totalHeight / 2 + lineHeight / 2;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = fontSize * 0.15;
  ctx.shadowOffsetY = fontSize * 0.06;
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.97)';
  for (const line of lines) {
    ctx.fillText(line, x, currentY, maxTextWidth);
    currentY += lineHeight;
  }

  if (moreText) {
    currentY += (moreFontSize * lineGap - lineHeight) / 2;
    ctx.font = `italic 400 ${moreFontSize}px sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.shadowColor = 'transparent';
    ctx.fillText(moreText, x, currentY, maxTextWidth);
  }

  ctx.restore();
}

// ─── Props ──────────────────────────────────────────────────────────────────────

interface WarehouseMapCanvasProps {
  /** Chỉ xem map và thông tin ô; không import hoặc tải file map. */
  readOnly?: boolean;
  /** Callback khi user click vào một node trên bản đồ. Trả về null nếu click vào khoảng trống. */
  onNodeClick?: (node: NodeInfo | null) => void;
  /** Ẩn thanh toolbar (dùng khi nhúng làm Picker) */
  hideToolbar?: boolean;
  /** Ẩn drawer chi tiết khi click vào kệ (dùng khi nhúng làm Picker) */
  hideDrawer?: boolean;
  /** Mã location đang được chọn — highlight màu xanh trên map */
  selectedLocationCodes?: string[];
  /** Ghi đè warehouse đang chọn trên header (vd. map kiểm kê theo phiếu). */
  warehouseId?: number;
  /** Dữ liệu vị trí/tồn tùy chỉnh — dùng cho map kiểm kê thay API full-locations. */
  locationOverrides?: FullLocationDetail[];
  /** Bỏ gọi API preview/full-locations; chỉ dùng locationOverrides. */
  skipFullLocationsFetch?: boolean;
  /** Bật kéo vùng chọn nhiều điểm (picker mode). */
  enableBoxSelect?: boolean;
  /** Khi true, kéo chuột trái vẽ vùng chọn thay vì pan. */
  boxSelectActive?: boolean;
  /** Callback khi hoàn tất kéo vùng — trả về các shelf node trong vùng. */
  onBoxSelect?: (nodes: NodeInfo[]) => void;
  /** Thanh tìm vị trí theo location_name trên map. */
  enableLocationSearch?: boolean;
}


// ─── Component ─────────────────────────────────────────────────────────────────

const WarehouseMapCanvas: React.FC<WarehouseMapCanvasProps> = ({
  readOnly = false,
  onNodeClick,
  hideToolbar = false,
  hideDrawer = false,
  selectedLocationCodes = [],
  warehouseId: warehouseIdProp,
  locationOverrides,
  skipFullLocationsFetch = false,
  enableBoxSelect = false,
  boxSelectActive = false,
  onBoxSelect,
  enableLocationSearch = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Zustand stores ────────────────────────────────────────────────────────
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);
  const resolvedWarehouseId = warehouseIdProp ?? selectedWarehouseId;
  const user = useAuthStore((s) => s.user);
  const isAdmin = !!user?.access?.is_admin;

  // ─── React Query hooks ─────────────────────────────────────────────────────
  const {
    data: mapApiData,
    isLoading,
    isError,
    error,
  } = useActiveWarehouseMap(resolvedWarehouseId);

  const { data: fullLocationsData, refetch: refetchFullLocations } =
    useFullLocations(skipFullLocationsFetch ? 0 : resolvedWarehouseId);

  const effectiveLocations = useMemo(() => {
    if (locationOverrides) {
      return {
        location_codes: locationOverrides
          .filter((loc) => loc.item_stock.length > 0)
          .map((loc) => loc.location_code),
        locations: locationOverrides,
      };
    }
    return {
      location_codes: fullLocationsData?.location_codes ?? [],
      locations: fullLocationsData?.locations ?? [],
    };
  }, [locationOverrides, fullLocationsData]);

  const fullLocationCodes = useMemo(
    () => new Set(effectiveLocations.location_codes),
    [effectiveLocations.location_codes],
  );

  // Map data (parsed once per API response, never mutated)
  const mapDataRef = useRef<MapData | null>(null);
  const nodesRef = useRef<NodeInfo[]>([]);
  const shelfNodesRef = useRef<NodeInfo[]>([]);
  const shelfSizesRef = useRef<CellSize[]>([]);
  const shelfBoundsRef = useRef<CellBounds | null>(null);
  /** Cạnh ngắn nhỏ nhất của ô (world) — dùng tính zoom tối đa. */
  const smallestCellMinRef = useRef(0);
  const cssSizeRef = useRef<CanvasCssSize>({ width: 1, height: 1, dpr: 1 });
  const fullCodesRef = useRef<Set<string>>(new Set());
  const fullLocationsMapRef = useRef<Map<string, FullLocationDetail>>(new Map());
  const selectedCodesRef = useRef<Set<string>>(new Set());
  const searchHighlightCodesRef = useRef<Set<string>>(new Set());
  const searchPulseRef = useRef(0);
  const searchPulseRafRef = useRef<number | null>(null);
  const searchPulseStartRef = useRef(0);

  const selectedCodesKey = useMemo(
    () => selectedLocationCodes.join('\u0000'),
    [selectedLocationCodes],
  );

  useEffect(() => {
    selectedCodesRef.current = new Set(
      selectedLocationCodes.map((code) => String(code)),
    );
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCodesKey]);

  // Keep fullCodesRef in sync
  useEffect(() => {
    fullCodesRef.current = fullLocationCodes;
    
    const map = new Map<string, FullLocationDetail>();
    if (effectiveLocations.locations) {
      for (const loc of effectiveLocations.locations) {
        if (loc.location_code) {
          map.set(loc.location_code, loc);
        }
      }
    }
    fullLocationsMapRef.current = map;

    // Re-draw when renderable locations change
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullLocationCodes, effectiveLocations]);

  // Transform state (mutable refs — no re-render needed for every frame)
  const scaleRef = useRef(1);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);

  // Dynamic zoom floor — updated after each fitToCanvas() call so the user
  // can always scroll back to the initial overview, even for huge maps.
  const zoomMinRef = useRef(0.001);
  const zoomMaxRef = useRef(ZOOM_MAX);

  // Pan state
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const panMovedRef = useRef(false);

  // Box-select state
  const isBoxSelectingRef = useRef(false);
  const boxStartScreenRef = useRef({ x: 0, y: 0 });
  const boxEndScreenRef = useRef({ x: 0, y: 0 });
  const suppressNextClickRef = useRef(false);
  const boxSelectActiveRef = useRef(boxSelectActive);
  const enableBoxSelectRef = useRef(enableBoxSelect);

  useEffect(() => {
    boxSelectActiveRef.current = boxSelectActive;
    enableBoxSelectRef.current = enableBoxSelect;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = boxSelectActive ? 'crosshair' : 'grab';
    }
  }, [boxSelectActive, enableBoxSelect]);

  // UI state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | undefined>();
  const [detailRefreshToken, setDetailRefreshToken] = useState(0);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // Download mutation
  const downloadMutation = useDownloadWarehouseMap();

  // ─── Draw ───────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mapData = mapDataRef.current;
    if (!mapData) return;

    const { width: cssW, height: cssH, dpr } = cssSizeRef.current;
    const scale = scaleRef.current;
    const offX = offsetXRef.current;
    const offY = offsetYRef.current;
    clearCanvas(ctx, canvas);

    // Apply camera transform
    ctx.save();
    applyCameraTransform(ctx, dpr, scale, offX, offY);

    const invScale = 1 / scale;

    // ── Draw Lines ────────────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = invScale * 1.5; // screen-constant line

    for (const lineRow of mapData.lineArr) {
      // path is always at index 6 per lineKeys spec
      const rawPath = lineRow[6];
      if (!rawPath || !Array.isArray(rawPath) || rawPath.length === 0) continue;

      // ── Auto-detect path format ──────────────────────────────────────────
      // Format A (nested): [[x0,y0], [x1,y1], ...]
      // Format B (flat):   [x0, y0, x1, y1, ...]
      let coords: { x: number; y: number }[] = [];

      if (Array.isArray(rawPath[0])) {
        // Format A — each element is a [x, y] pair
        for (const pt of rawPath as unknown as number[][]) {
          if (pt && pt.length >= 2 && pt[0] != null && pt[1] != null) {
            // Y-flip for path coordinates: same rule as nodes
            coords.push(
              toCanvasPoint(pt[0], pt[1], mapData.height, mapData.xAttrMin ?? 0, mapData.yAttrMin ?? 0),
            );
          }
        }
      } else {
        // Format B — flat array [x0, y0, x1, y1, ...], filter nulls first
        const pts = (rawPath as (number | null)[]).filter(
          (v): v is number => v != null && typeof v === 'number',
        );
        // Must be even (x,y pairs)
        const len = pts.length % 2 === 0 ? pts.length : pts.length - 1;
        for (let i = 0; i < len; i += 2) {
          // Y-flip for path coordinates: same rule as nodes
          coords.push(
            toCanvasPoint(
              pts[i],
              pts[i + 1],
              mapData.height,
              mapData.xAttrMin ?? 0,
              mapData.yAttrMin ?? 0,
            ),
          );
        }
      }

      if (coords.length < 2) continue;

      ctx.moveTo(coords[0].x, coords[0].y);
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i].x, coords[i].y);
      }
    }
    ctx.stroke();

    // ── Visible world rect (culling) ─────────────────────────────────────────
    const viewMinX = -offX * invScale;
    const viewMaxX = (cssW - offX) * invScale;
    const viewMinY = -offY * invScale;
    const viewMaxY = (cssH - offY) * invScale;

    // ── Draw Waypoints (small grey circles) ──────────────────────────────────
    ctx.fillStyle = NODE_NORMAL_COLOR;
    ctx.beginPath();
    for (const node of nodesRef.current) {
      if (node.type !== 0) continue;
      if (node.x < viewMinX || node.x > viewMaxX || node.y < viewMinY || node.y > viewMaxY) {
        continue;
      }
      ctx.moveTo(node.x + WAYPOINT_RADIUS, node.y);
      ctx.arc(node.x, node.y, WAYPOINT_RADIUS, 0, Math.PI * 2);
    }
    ctx.fill();

    // ── Draw Shelves ─────────────────────────────────────────────────────────
    const shelves = shelfNodesRef.current;
    const sizes = shelfSizesRef.current;

    for (let i = 0; i < shelves.length; i++) {
      const node = shelves[i];
      const size = sizes[i];
      const { x, y } = node;
      const halfW = size.w / 2;
      const halfH = size.h / 2;
      if (
        x + halfW < viewMinX ||
        x - halfW > viewMaxX ||
        y + halfH < viewMinY ||
        y - halfH > viewMaxY
      ) {
        continue;
      }

      const isSelected = selectedCodesRef.current.has(String(node.content));
      const isFull = fullCodesRef.current.has(node.content);
      const locDetail = fullLocationsMapRef.current.get(node.content);
      const locationStatus = locDetail?.status;

      if (isSelected) {
        ctx.fillStyle = SHELF_SELECTED_COLOR;
      } else if (locationStatus === 'reserved') {
        ctx.fillStyle = SHELF_RESERVED_COLOR;
      } else if (locationStatus === 'in_transit') {
        ctx.fillStyle = SHELF_IN_TRANSIT_COLOR;
      } else if (isFull || locationStatus === 'has_stock') {
        ctx.fillStyle = SHELF_FULL_COLOR;
      } else {
        ctx.fillStyle = SHELF_EMPTY_COLOR;
      }
      ctx.fillRect(x - halfW, y - halfH, size.w, size.h);

      ctx.strokeStyle = isSelected ? SHELF_SELECTED_STROKE_COLOR : SHELF_STROKE_COLOR;
      ctx.lineWidth = invScale * (isSelected ? 2 : 1);
      ctx.strokeRect(x - halfW, y - halfH, size.w, size.h);

      // Item stock preview (skip when selected for clearer highlight)
      if (isFull && !isSelected && locDetail && locDetail.item_stock?.length > 0) {
        drawShelfStockPreview(ctx, x, y, size.w, size.h, locDetail);
      }

      const isSearchHit = searchHighlightCodesRef.current.has(String(node.content));
      if (isSearchHit) {
        const pulse = searchPulseRef.current;
        const glowPad = Math.max(size.w, size.h) * (0.1 + pulse * 0.08);
        ctx.save();
        ctx.strokeStyle = `rgba(250, 204, 21, ${0.7 + pulse * 0.3})`;
        ctx.lineWidth = invScale * (3 + pulse * 2.5);
        ctx.shadowColor = 'rgba(251, 191, 36, 0.95)';
        ctx.shadowBlur = invScale * (10 + pulse * 22);
        ctx.strokeRect(
          x - halfW - glowPad,
          y - halfH - glowPad,
          size.w + glowPad * 2,
          size.h + glowPad * 2,
        );
        ctx.fillStyle = `rgba(250, 204, 21, ${0.22 + pulse * 0.28})`;
        ctx.fillRect(x - halfW, y - halfH, size.w, size.h);
        ctx.restore();
      }
    }

    ctx.restore();

    // ── Selection box overlay (screen space) ─────────────────────────────────
    if (isBoxSelectingRef.current && enableBoxSelectRef.current) {
      const x1 = Math.min(boxStartScreenRef.current.x, boxEndScreenRef.current.x);
      const y1 = Math.min(boxStartScreenRef.current.y, boxEndScreenRef.current.y);
      const w = Math.abs(boxEndScreenRef.current.x - boxStartScreenRef.current.x);
      const h = Math.abs(boxEndScreenRef.current.y - boxStartScreenRef.current.y);

      ctx.save();
      applyScreenTransform(ctx, dpr);
      ctx.fillStyle = BOX_SELECT_FILL;
      ctx.strokeStyle = BOX_SELECT_STROKE;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(x1, y1, w, h);
      ctx.strokeRect(x1, y1, w, h);
      ctx.restore();
    }
  }, []);

  // ─── Fit Map to Canvas ──────────────────────────────────────────────────────

  const fitToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const mapData = mapDataRef.current;
    if (!canvas || !mapData) return;

    // Fit the area that actually contains shelves, not the whole map frame.
    const bounds = shelfBoundsRef.current ?? {
      minX: 0,
      minY: 0,
      width: mapData.width,
      height: mapData.height,
    };
    const { width: cW, height: cH } = cssSizeRef.current;

    const pad = Math.min(cW, cH) * FIT_PADDING_RATIO;
    const availW = Math.max(cW - pad * 2, 1);
    const availH = Math.max(cH - pad * 2, 1);

    const scale = Math.min(availW / bounds.width, availH / bounds.height);

    scaleRef.current = scale;
    offsetXRef.current = pad + (availW - bounds.width * scale) / 2 - bounds.minX * scale;
    offsetYRef.current = pad + (availH - bounds.height * scale) / 2 - bounds.minY * scale;

    zoomMinRef.current = scale * ZOOM_MIN_OF_FIT;
    const smallestCell = smallestCellMinRef.current;
    zoomMaxRef.current =
      smallestCell > 0
        ? Math.max(scale * 2, MAX_CELL_SCREEN_PX / smallestCell)
        : Math.max(scale * 2, ZOOM_MAX);
  }, []);

  // ─── Resize Observer ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ro = new ResizeObserver(() => {
      cssSizeRef.current = resizeCanvasToContainer(canvas, container);

      if (mapDataRef.current) {
        fitToCanvas();
        draw();
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, [draw, fitToCanvas]);

  // ─── Apply map data to canvas (shared helper) ──────────────────────────────

  const applyMapData = useCallback(
    (data: MapData) => {
      if (!data.nodeArr || !data.lineArr) {
        return;
      }
      mapDataRef.current = data;
      const parsedNodes = data.nodeArr.map((row) =>
        parseNode(row, data.height, data.xAttrMin ?? 0, data.yAttrMin ?? 0),
      );
      nodesRef.current = parsedNodes;

      const shelves = parsedNodes.filter((node) => isShelfNodeType(node.type));
      const layout = computeCellLayout(
        shelves.map((node) => ({
          x: node.x,
          y: node.y,
          group: layoutGroupKey(node.name || node.content),
        })),
        ADMIN_CELL_OPTIONS,
      );
      shelfNodesRef.current = shelves;
      shelfSizesRef.current = layout.sizes;
      shelfBoundsRef.current = computeCellBounds(shelves, layout.sizes);

      smallestCellMinRef.current = layout.sizes.length
        ? Math.min(...layout.sizes.map((size) => Math.min(size.w, size.h)))
        : 0;

      if (canvasRef.current && containerRef.current) {
        cssSizeRef.current = resizeCanvasToContainer(canvasRef.current, containerRef.current);
      }
      fitToCanvas();
      draw();
    },
    [draw, fitToCanvas],
  );

  // ─── React Query data → Canvas ─────────────────────────────────────────────
  // When API data arrives or changes (zone switch), apply it to the canvas.
  useEffect(() => {
    if (!mapApiData) return;
    applyMapData(mapApiData);
  }, [mapApiData, applyMapData]);

  // ─── Mouse → World coordinate conversion ────────────────────────────────────

  const screenToWorld = useCallback((sx: number, sy: number) => {
    return {
      wx: (sx - offsetXRef.current) / scaleRef.current,
      wy: (sy - offsetYRef.current) / scaleRef.current,
    };
  }, []);

  // ─── Canvas rect helper ──────────────────────────────────────────────────────

  const getCanvasPos = useCallback((e: MouseEvent | WheelEvent) => {
    const pos = clientToCanvasCss(canvasRef.current!, e.clientX, e.clientY, cssSizeRef.current);
    return { cx: pos.x, cy: pos.y };
  }, []);

  const getShelfNodesInScreenRect = useCallback(
    (sx1: number, sy1: number, sx2: number, sy2: number) => {
      const topLeft = screenToWorld(Math.min(sx1, sx2), Math.min(sy1, sy2));
      const bottomRight = screenToWorld(Math.max(sx1, sx2), Math.max(sy1, sy2));

      return getShelfNodesInWorldRect(
        nodesRef.current,
        Math.min(topLeft.wx, bottomRight.wx),
        Math.max(topLeft.wx, bottomRight.wx),
        Math.min(topLeft.wy, bottomRight.wy),
        Math.max(topLeft.wy, bottomRight.wy),
      );
    },
    [screenToWorld],
  );

  // ─── Zoom (wheel + buttons) ───────────────────────────────────────────────────

  const applyZoom = useCallback(
    (zoomIn: boolean, pivotCx?: number, pivotCy?: number) => {
      if (!canvasRef.current) return;

      const cx = pivotCx ?? cssSizeRef.current.width / 2;
      const cy = pivotCy ?? cssSizeRef.current.height / 2;

      const factor = zoomIn ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newScale = Math.min(
        zoomMaxRef.current,
        Math.max(zoomMinRef.current, scaleRef.current * factor),
      );
      if (newScale === scaleRef.current) return;

      const { wx, wy } = screenToWorld(cx, cy);
      scaleRef.current = newScale;
      offsetXRef.current = cx - wx * newScale;
      offsetYRef.current = cy - wy * newScale;

      draw();
    },
    [draw, screenToWorld],
  );

  const handleZoomIn = useCallback(() => {
    applyZoom(true);
  }, [applyZoom]);

  const handleZoomOut = useCallback(() => {
    applyZoom(false);
  }, [applyZoom]);

  const handleFitView = useCallback(() => {
    fitToCanvas();
    draw();
  }, [draw, fitToCanvas]);

  const stopSearchPulse = useCallback(() => {
    if (searchPulseRafRef.current != null) {
      cancelAnimationFrame(searchPulseRafRef.current);
      searchPulseRafRef.current = null;
    }
  }, []);

  const syncSearchPulse = useCallback(() => {
    if (searchHighlightCodesRef.current.size === 0) {
      searchPulseRef.current = 0;
      stopSearchPulse();
      draw();
      return;
    }

    if (searchPulseRafRef.current != null) return;

    searchPulseStartRef.current = performance.now();

    const tick = (now: number) => {
      if (searchHighlightCodesRef.current.size === 0) {
        searchPulseRef.current = 0;
        searchPulseRafRef.current = null;
        draw();
        return;
      }
      const elapsed = now - searchPulseStartRef.current;
      searchPulseRef.current = (Math.sin(elapsed / 160) + 1) / 2;
      draw();
      searchPulseRafRef.current = requestAnimationFrame(tick);
    };

    searchPulseRafRef.current = requestAnimationFrame(tick);
  }, [draw, stopSearchPulse]);

  useEffect(() => () => stopSearchPulse(), [stopSearchPulse]);

  const handleLocationSearchQuery = useCallback(
    (rawQuery: string) => {
      const query = rawQuery.trim();
      if (!query) {
        searchHighlightCodesRef.current = new Set();
        syncSearchPulse();
        return;
      }

      const batch = resolveLocationSearchBatch(
        query,
        effectiveLocations.locations,
        shelfNodesRef.current,
      );

      searchHighlightCodesRef.current = new Set(batch.highlightedCodes);
      syncSearchPulse();

      if (batch.foundLabels.length > 0) {
        const preview =
          batch.foundLabels.length <= 4
            ? batch.foundLabels.join(', ')
            : `${batch.foundLabels.slice(0, 4).join(', ')} (+${batch.foundLabels.length - 4})`;
        message.success(`Đã highlight ${batch.foundLabels.length} vị trí: ${preview}`);
      }

      if (batch.notFoundTerms.length > 0) {
        message.warning(`Không tìm thấy: ${batch.notFoundTerms.join(', ')}`);
      }

      if (batch.notOnMapLabels.length > 0) {
        message.warning(
          `Chưa có trên bản đồ: ${batch.notOnMapLabels.join(', ')}`,
        );
      }

    },
    [effectiveLocations.locations, syncSearchPulse],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const { cx, cy } = getCanvasPos(e);
      applyZoom(e.deltaY < 0, cx, cy);
    },
    [applyZoom, getCanvasPos],
  );

  // ─── Pan ─────────────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return;

      const useBoxSelect =
        enableBoxSelectRef.current &&
        (boxSelectActiveRef.current || e.shiftKey);

      if (useBoxSelect) {
        const { cx, cy } = getCanvasPos(e);
        isBoxSelectingRef.current = true;
        boxStartScreenRef.current = { x: cx, y: cy };
        boxEndScreenRef.current = { x: cx, y: cy };
        if (canvasRef.current) canvasRef.current.style.cursor = 'crosshair';
        return;
      }

      const { cx, cy } = getCanvasPos(e);
      isPanningRef.current = true;
      panMovedRef.current = false;
      panStartRef.current = { x: cx, y: cy };
      lastMouseRef.current = { x: cx, y: cy };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    },
    [getCanvasPos],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isBoxSelectingRef.current) {
        const { cx, cy } = getCanvasPos(e);
        boxEndScreenRef.current = { x: cx, y: cy };
        draw();
        return;
      }

      if (!isPanningRef.current) return;
      const { cx, cy } = getCanvasPos(e);
      if (
        !panMovedRef.current &&
        Math.hypot(cx - panStartRef.current.x, cy - panStartRef.current.y) >
          CLICK_DRAG_THRESHOLD_PX
      ) {
        panMovedRef.current = true;
      }
      offsetXRef.current += cx - lastMouseRef.current.x;
      offsetYRef.current += cy - lastMouseRef.current.y;
      lastMouseRef.current = { x: cx, y: cy };
      draw();
    },
    [draw, getCanvasPos],
  );

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (isBoxSelectingRef.current) {
      const { x: sx1, y: sy1 } = boxStartScreenRef.current;
      const { x: sx2, y: sy2 } = boxEndScreenRef.current;
      const dragDx = Math.abs(sx2 - sx1);
      const dragDy = Math.abs(sy2 - sy1);

      isBoxSelectingRef.current = false;

      if (
        dragDx >= BOX_SELECT_DRAG_THRESHOLD ||
        dragDy >= BOX_SELECT_DRAG_THRESHOLD
      ) {
        suppressNextClickRef.current = true;
        const nodes = getShelfNodesInScreenRect(sx1, sy1, sx2, sy2);
        onBoxSelect?.(nodes);
      }

      if (canvasRef.current) {
        canvasRef.current.style.cursor = boxSelectActiveRef.current
          ? 'crosshair'
          : 'grab';
      }
      draw();
      return;
    }

    if (e.type === 'mouseup' && isPanningRef.current && panMovedRef.current) {
      suppressNextClickRef.current = true;
    }
    isPanningRef.current = false;
    panMovedRef.current = false;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = boxSelectActiveRef.current
        ? 'crosshair'
        : 'grab';
    }
  }, [draw, getShelfNodesInScreenRect, onBoxSelect]);

  // ─── Click → Hit Detection → Drawer ────────────────────────────────────────

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!mapDataRef.current) return;

      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }

      const { cx, cy } = getCanvasPos(e);
      const { wx, wy } = screenToWorld(cx, cy);

      const hitIndex = findCellAt(shelfNodesRef.current, shelfSizesRef.current, wx, wy);
      const closest: NodeInfo | null = hitIndex >= 0 ? shelfNodesRef.current[hitIndex] : null;

      if (closest) {
        setSelectedNode(closest);
        const loc = fullLocationsMapRef.current.get(closest.content);
        setSelectedLocationId(loc?.id);
        if (!hideDrawer) setDrawerVisible(true);

        const isOverviewMode = !hideDrawer && !skipFullLocationsFetch;
        if (isOverviewMode) {
          void refetchFullLocations();
          setDetailRefreshToken((token) => token + 1);
        }

        // Picker mode (hideDrawer): luôn trả node cho parent.
        // Map view: chỉ callback khi kệ không full (giữ hành vi cũ).
        if (hideDrawer || !fullCodesRef.current.has(closest.content)) {
          onNodeClick?.(closest);
        }
      } else {
        setDrawerVisible(false);
        setSelectedLocationId(undefined);
        onNodeClick?.(null);
      }
    },
    [
      getCanvasPos,
      screenToWorld,
      hideDrawer,
      skipFullLocationsFetch,
      refetchFullLocations,
      onNodeClick,
    ],
  );

  // ─── Attach Canvas Event Listeners ──────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);
    canvas.addEventListener('click', handleClick);

    canvas.style.cursor = 'grab';

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseUp);
      canvas.removeEventListener('click', handleClick);
    };
  }, [handleWheel, handleMouseDown, handleMouseMove, handleMouseUp, handleClick]);

  // ─── Derive UI state ──────────────────────────────────────────────────────

  const hasData = !!mapApiData;
  const nodesCount = mapApiData?.nodeArr?.length ?? 0;
  const linesCount = mapApiData?.lineArr?.length;
  const errorMessage = isError
    ? getApiErrorMessage(error, 'Không thể tải bản đồ')
    : null;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full font-sans">
      {/* ── Toolbar ── */}
      {!hideToolbar && (
        <WarehouseMapToolbar
          isAdmin={isAdmin}
          readOnly={readOnly}
          hasData={hasData}
          isLoading={isLoading}
          errorMessage={errorMessage}
          nodesCount={nodesCount}
          linesCount={linesCount}
          downloadLoading={downloadMutation.isPending}
          onImportClick={() => {
            if (!readOnly) setImportDialogOpen(true);
          }}
          onDownloadClick={() => {
            if (readOnly) return;
            downloadMutation.mutate(
              { warehouseId: resolvedWarehouseId },
              {
                onSuccess: () => message.success('Đã tải xuống bản đồ'),
                onError: () => message.error('Không thể tải xuống bản đồ'),
              },
            );
          }}
        />
      )}

      {/* ── Canvas Area ── */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden rounded-b-xl border border-slate-200 shadow-inner bg-transparent"
      >
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* Overlays: loading / error / full */}
        <WarehouseMapOverlays
          isLoading={isLoading}
          isError={isError}
          hasData={hasData}
          errorMessage={errorMessage}
          isAdmin={isAdmin && !readOnly}
        />

        {hasData && !isLoading && !isError && <WarehouseMapLegend />}

        {enableLocationSearch && hasData && !isLoading && !isError && (
          <WarehouseMapLocationSearch onQueryChange={handleLocationSearchQuery} />
        )}

        {hasData && !isLoading && !isError && (
          <WarehouseMapZoomControls
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onFit={handleFitView}
          />
        )}

        {/* Drawer Component */}
        {!hideDrawer && (
          <WarehouseMapDrawer
            visible={drawerVisible}
            onClose={() => {
              setDrawerVisible(false);
              setSelectedLocationId(undefined);
            }}
            node={selectedNode}
            locationId={selectedLocationId}
            refreshToken={detailRefreshToken}
          />
        )}
      </div>

      {/* Import Dialog — admin only */}
      {!hideToolbar && isAdmin && !readOnly && (
        <WarehouseMapImportDialog
          open={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          warehouseId={resolvedWarehouseId}
        />
      )}
    </div>
  );
};

export default WarehouseMapCanvas;
