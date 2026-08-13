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
 *  - Nodes: type=0 → small grey circle | type=1 → hatched square (shelf)
 *  - Node sizes are screen-constant (baseSize / scale) — never blow up on zoom
 *  - Click detection via inverse-transform → Euclidean distance (hitRadius)
 *  - Diagonal hatch pattern for shelves is generated once and cached
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
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useActiveWarehouseMap, useFullLocations, useDownloadWarehouseMap } from '@/hooks/useWarehouseMap';
import { message } from '@/components/ui';
import type { MapData, NodeInfo, FullLocationDetail } from '@/types/warehouseMap';
import { formatQuantity } from '@/utils/formatQuantity';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface WarehouseMapCanvasProps {
  /** Callback khi user click vào một node trên bản đồ. Trả về null nếu click vào khoảng trống. */
  onNodeClick?: (node: NodeInfo | null) => void;
  /** Ẩn thanh toolbar (dùng khi nhúng làm Picker) */
  hideToolbar?: boolean;
  /** Ẩn drawer chi tiết khi click vào kệ (dùng khi nhúng làm Picker) */
  hideDrawer?: boolean;
  /** Mã location đang được chọn — highlight màu xanh trên map */
  selectedLocationCodes?: string[];
}
import {
  ZOOM_MAX,
  ZOOM_FACTOR,
  HIT_RADIUS,
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
  PADDING,
  parseNode,
} from '@/utils/warehouseMapUtils';


// ─── Component ─────────────────────────────────────────────────────────────────

const WarehouseMapCanvas: React.FC<WarehouseMapCanvasProps> = ({
  onNodeClick,
  hideToolbar = false,
  hideDrawer = false,
  selectedLocationCodes = [],
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Zustand stores ────────────────────────────────────────────────────────
  const selectedWarehouseId = useAppStore((s) => s.selectedWarehouseId);
  const roleCanonical = useAuthStore((s) => s.role_canonical);
  const role = useAuthStore((s) => s.role);
  const isAdmin =
    roleCanonical === 'A001' ||
    roleCanonical?.toLowerCase() === 'admin' ||
    role?.toLowerCase() === 'admin';

  // ─── React Query hooks ─────────────────────────────────────────────────────
  const {
    data: mapApiData,
    isLoading,
    isError,
    error,
  } = useActiveWarehouseMap(selectedWarehouseId);

  const { data: fullLocationsData } = useFullLocations(selectedWarehouseId);

  const fullLocationCodes = useMemo(
    () => new Set(fullLocationsData?.location_codes ?? []),
    [fullLocationsData],
  );

  // Map data (parsed once per API response, never mutated)
  const mapDataRef = useRef<MapData | null>(null);
  const nodesRef = useRef<NodeInfo[]>([]);
  const fullCodesRef = useRef<Set<string>>(new Set());
  const fullLocationsMapRef = useRef<Map<string, FullLocationDetail>>(new Map());
  const selectedCodesRef = useRef<Set<string>>(new Set());

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
    if (fullLocationsData?.locations) {
      for (const loc of fullLocationsData.locations) {
        if (loc.location_code) {
          map.set(loc.location_code, loc);
        }
      }
    }
    fullLocationsMapRef.current = map;

    // Re-draw when renderable locations change
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullLocationCodes, fullLocationsData]);

  // Transform state (mutable refs — no re-render needed for every frame)
  const scaleRef = useRef(1);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);

  // Dynamic zoom floor — updated after each fitToCanvas() call so the user
  // can always scroll back to the initial overview, even for huge maps.
  const zoomMinRef = useRef(0.001);

  // Pan state
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // UI state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | undefined>();
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

    const { width: W, height: H } = canvas;
    ctx.clearRect(0, 0, W, H);

    // Apply camera transform
    ctx.save();
    ctx.setTransform(scaleRef.current, 0, 0, scaleRef.current, offsetXRef.current, offsetYRef.current);

    const invScale = 1 / scaleRef.current;

    // ── Draw Lines ────────────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = invScale * 2; // screen-constant 2px line

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
            coords.push({ x: pt[0], y: mapData.height - pt[1] });
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
          coords.push({ x: pts[i], y: mapData.height - pts[i + 1] });
        }
      }

      if (coords.length < 2) continue;

      ctx.moveTo(coords[0].x, coords[0].y);
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i].x, coords[i].y);
      }
    }
    ctx.stroke();

    // ── Draw Nodes ────────────────────────────────────────────────────────────
    const baseSize = BASE_NODE_SIZE;

    for (const node of nodesRef.current) {
      const { x, y, type } = node;

      if (type === 0) {
        // Normal waypoint: small grey circle
        ctx.beginPath();
        ctx.arc(x, y, baseSize * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = NODE_NORMAL_COLOR;
        ctx.fill();
      } else if (type === 1) {
        const half = baseSize * 0.7;
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
        ctx.fillRect(x - half * 1.5, y - half, half * 3, half * 2);

        ctx.strokeStyle = isSelected ? SHELF_SELECTED_STROKE_COLOR : SHELF_STROKE_COLOR;
        ctx.lineWidth = invScale * (isSelected ? 1.2 : 0.8);
        ctx.strokeRect(x - half * 1.5, y - half, half * 3, half * 2);

        // Draw item stock text (skip overlay when selected for clearer highlight)
        if (isFull && !isSelected) {
          const locDetailForText = fullLocationsMapRef.current.get(node.content);
          if (locDetailForText && locDetailForText.item_stock && locDetailForText.item_stock.length > 0) {
            ctx.save();
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const maxTextWidth = half * 2.8; 
            // Display only 1 item to make it prominent, show "+N more" if others exist
            const stock = locDetailForText.item_stock[0];
            const hasMore = locDetailForText.item_stock.length > 1;

            // Uniform large font size for both lines
            const fontSize = half * 0.32;
            const moreFontSize = half * 0.22;
            
            const lineHeight = fontSize * 1.5;
            const moreLineHeight = moreFontSize * 1.5;
            
            // Total height is 2 main lines + optional "more" line
            const totalHeight = lineHeight * 2 + (hasMore ? moreLineHeight : 0);
            
            let currentY = y - totalHeight / 2 + lineHeight / 2;
            
            // Add subtle shadow for premium look
            ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
            ctx.shadowBlur = half * 0.08;
            ctx.shadowOffsetY = half * 0.04;
            
            ctx.font = `500 ${fontSize}px sans-serif`;
            
            // 1. Draw SKU & Lot with a nice bullet separator
            const textTop = `${stock.sku}  •  ${stock.lot_number || 'N/A'}`;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.fillText(textTop, x, currentY, maxTextWidth);
            
            // 2. Draw Qty
            currentY += lineHeight;
            const qtyText = `Qty: ${formatQuantity(stock.quantity, "0")}`;
            
            ctx.fillText(qtyText, x, currentY, maxTextWidth);
            
            // 3. Draw More
            if (hasMore) {
               currentY += (lineHeight / 2 + moreLineHeight / 2);
               ctx.font = `italic 400 ${moreFontSize}px sans-serif`;
               ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
               ctx.shadowColor = 'transparent';
               ctx.fillText(`+${locDetailForText.item_stock.length - 1} more...`, x, currentY, maxTextWidth);
            }

            ctx.restore();
          }
        }
      }
    }

    ctx.restore();
  }, []);

  // ─── Fit Map to Canvas ──────────────────────────────────────────────────────

  const fitToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const mapData = mapDataRef.current;
    if (!canvas || !mapData) return;

    const { width: mapW, height: mapH } = mapData;
    const cW = canvas.width;
    const cH = canvas.height;

    const pad = Math.min(cW, cH) * PADDING;
    const availW = cW - pad * 2;
    const availH = cH - pad * 2;

    const scaleX = availW / mapW;
    const scaleY = availH / mapH;
    const scale = Math.min(scaleX, scaleY); // maintain aspect ratio

    scaleRef.current = scale;
    offsetXRef.current = pad + (availW - mapW * scale) / 2;
    offsetYRef.current = pad + (availH - mapH * scale) / 2;

    // Allow zooming back out to exactly the fit view (scale * 0.8 gives a tiny margin)
    zoomMinRef.current = scale * 0.8;
  }, []);

  // ─── Resize Observer ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

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
      const parsedNodes = data.nodeArr.map((row) => parseNode(row, data.height));
      nodesRef.current = parsedNodes;

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
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  }, []);

  // ─── Wheel → Zoom centred on cursor ─────────────────────────────────────────

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const { cx, cy } = getCanvasPos(e);

      const zoomIn = e.deltaY < 0;
      const factor = zoomIn ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newScale = Math.min(ZOOM_MAX, Math.max(zoomMinRef.current, scaleRef.current * factor));

      // Pivot around the cursor: keep world point under cursor fixed
      // worldX = (cx - offsetX) / scale  →  offsetX' = cx - worldX * newScale
      const { wx, wy } = screenToWorld(cx, cy);
      scaleRef.current = newScale;
      offsetXRef.current = cx - wx * newScale;
      offsetYRef.current = cy - wy * newScale;

      draw();
    },
    [draw, getCanvasPos, screenToWorld],
  );

  // ─── Pan ─────────────────────────────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0) return;
      isPanningRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      offsetXRef.current += dx;
      offsetYRef.current += dy;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      draw();
    },
    [draw],
  );

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, []);

  // ─── Click → Hit Detection → Drawer ────────────────────────────────────────

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (!mapDataRef.current) return;

      const { cx, cy } = getCanvasPos(e);
      const { wx, wy } = screenToWorld(cx, cy);

      // hitRadius is in world coordinates — stays constant regardless of zoom
      // (a constant screen-space radius would be HIT_RADIUS / scaleRef.current)
      const hitRadiusWorld = HIT_RADIUS / scaleRef.current;

      let closest: NodeInfo | null = null;
      let closestDist = Infinity;

      for (const node of nodesRef.current) {
        const dx = wx - node.x;
        const dy = wy - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < hitRadiusWorld && dist < closestDist && node.type == 1) {
          closestDist = dist;
          closest = node;
        }
      }

      if (closest) {
        setSelectedNode(closest);
        const loc = fullLocationsMapRef.current.get(closest.content);
        setSelectedLocationId(loc?.id);
        if (!hideDrawer) setDrawerVisible(true);
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
    [getCanvasPos, screenToWorld, hideDrawer, onNodeClick],
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
    ? (error?.response?.data?.detail ?? error?.message ?? 'Không thể tải bản đồ')
    : null;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full w-full font-sans">
      {/* ── Toolbar ── */}
      {!hideToolbar && (
        <WarehouseMapToolbar
          isAdmin={isAdmin}
          hasData={hasData}
          isLoading={isLoading}
          errorMessage={errorMessage}
          nodesCount={nodesCount}
          linesCount={linesCount}
          downloadLoading={downloadMutation.isPending}
          onImportClick={() => setImportDialogOpen(true)}
          onDownloadClick={() => {
            downloadMutation.mutate(
              { warehouseId: selectedWarehouseId },
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
          isAdmin={isAdmin}
        />

        {hasData && !isLoading && !isError && <WarehouseMapLegend />}

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
          />
        )}
      </div>

      {/* Import Dialog — admin only */}
      {!hideToolbar && isAdmin && (
        <WarehouseMapImportDialog
          open={importDialogOpen}
          onClose={() => setImportDialogOpen(false)}
          warehouseId={selectedWarehouseId}
        />
      )}
    </div>
  );
};

export default WarehouseMapCanvas;
