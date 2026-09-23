/**
 * OperatorMapCanvas — Bản đồ kho vận hành theo zone.
 *
 * Thay đổi so với phiên bản cũ (theo quyết định đã chốt):
 * - Kích thước ô cố định: `baseNodeSize * shelfSizeFactor` (không còn computeMinShelfSpacing).
 * - Màu sắc theo chuẩn WarehouseMapCanvas (import từ warehouseMapUtils).
 * - Bỏ khái niệm bufferCodes làm mờ kệ — tất cả node trong zone đều có status.
 * - Không có pan, zoom, virtual grid hay responsive zoom.
 * - Chỉ cho click / double-click vào ô kệ.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useZoneMapLayout, useZoneMapStatus } from "@/hooks/useWarehouseMap";
import type { LocationStockLabel } from "@/types/warehouseLocation";
import { type MapContentBounds } from "@/utils/warehouseMapRender";
import { OPERATOR_MAP_CANVAS_DEFAULTS } from "@/constants/operatorDesktopSizes";
import {
  drawShelfStockLabel,
  drawStationOverlayLabel,
} from "@/utils/warehouseMapShelfDraw";
import { formatDisplayBin } from "@/utils/locationBin";
import {
  SHELF_FULL_COLOR,
  SHELF_EMPTY_COLOR,
  SHELF_SELECTED_COLOR,
  SHELF_STROKE_COLOR,
  SHELF_IN_TRANSIT_COLOR,
} from "@/utils/warehouseMapUtils";

const LABEL_MIN_SCREEN_PX = 16;

// ─── Drawing helpers ──────────────────────────────────────────────────────────
/**
 * Vẽ ô kệ theo trạng thái tồn kho, dùng màu chuẩn WarehouseMapCanvas.
 * - empty   → SHELF_EMPTY_COLOR (xám)
 * - taking  → SHELF_IN_TRANSIT_COLOR (cam — đang lấy hàng)
 * - *       → SHELF_FULL_COLOR (xanh brand — có hàng)
 */
function drawShelfByStatus(
  ctx: CanvasRenderingContext2D,
  status: string,
  x: number,
  y: number,
  half: number,
  invScale: number,
) {
  if (status === "empty") {
    ctx.fillStyle = SHELF_EMPTY_COLOR;
  } else if (status === "taking") {
    ctx.fillStyle = SHELF_IN_TRANSIT_COLOR;
  } else {
    ctx.fillStyle = SHELF_FULL_COLOR;
  }
  ctx.fillRect(x - half, y - half, half * 2, half * 2);
  ctx.strokeStyle = SHELF_STROKE_COLOR;
  ctx.lineWidth = invScale * 0.8;
  ctx.strokeRect(x - half, y - half, half * 2, half * 2);
}

/**
 * Vẽ viền nổi bật khi ô đang được chọn, dùng màu SHELF_SELECTED_COLOR (xanh lá).
 */
function drawSelectedHighlight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  invScale: number,
) {
  const size = half * 2;
  const radius = Math.max(4, half * 0.15);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - half, y - half, size, size, radius);
  ctx.fillStyle = `${SHELF_SELECTED_COLOR}55`; // 33% opacity overlay
  ctx.fill();
  ctx.shadowColor = SHELF_SELECTED_COLOR;
  ctx.shadowBlur = 12 * invScale;
  ctx.strokeStyle = SHELF_SELECTED_COLOR;
  ctx.lineWidth = 2.5 * invScale;
  ctx.stroke();
  ctx.restore();
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type BufferMapCanvasTuning = {
  /** Hệ số zoom sau khi fit (mặc định 0.75). */
  fitScaleFactor?: number;
  /** Padding khi fit, tính theo tỉ lệ cạnh ngắn nhất (mặc định 0.08 = 8%). */
  fitPaddingRatio?: number;
  /** Kích thước world-space cơ sở của ô (mặc định 800). */
  baseNodeSize?: number;
  /**
   * Hệ số kích thước ô: half = baseNodeSize * shelfSizeFactor (mặc định 0.7).
   * Tăng lên để ô to hơn, giảm xuống nếu các kệ quá gần nhau.
   */
  shelfSizeFactor?: number;
  /** Hệ số phóng chữ label trong ô. */
  labelTextScale?: number;
};

export type BufferCellClickPayload = {
  locationCode: string;
  x: number;
  y: number;
  gridRow?: number;
  rowLocationCodes?: string[];
  gridColumn?: number;
  columnLocationCodes?: string[];
};

type MapNode = {
  x: number;
  y: number;
  content: string;
};

type Props = {
  zoneId: number;
  showInboundSeparator?: boolean;
  className?: string;
  selectedCodes?: string[];
  onBufferCellClick?: (payload: BufferCellClickPayload) => void;
  onBufferCellDoubleClick?: (payload: BufferCellClickPayload) => void;
  tuning?: BufferMapCanvasTuning;
  /** Label overlay theo mã ô (vd. biển số xe / tên KH trên sorting station). */
  overlayLabelByCode?: Record<string, string>;
  /**
   * Chỉ các mã location trong danh sách này mới nhận được click.
   * Nếu không truyền → tất cả ô đều có thể click.
   */
  interactiveCodes?: string[] | Set<string>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Tính vùng bao (bounding box) bao quanh toàn bộ nodes.
 * Chiến lược: min/max của map_x, map_y + padding tỉ lệ để tạo khoảng trống xung quanh.
 * Kết quả dùng để tính toán scale và offset trong fitToCanvas().
 */
function computeMapSizeFromNodes(
  nodes: Array<{ x: number; y: number }>,
  baseNodeSize: number,
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

  // Margin cố định = 2 lần kích thước 1 ô kệ 
  const margin = baseNodeSize * 1.1;

  minX -= margin;
  minY -= margin;
  maxX += margin;
  maxY += margin;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

function drawInboundSeparator(
  ctx: CanvasRenderingContext2D,
  nodes: MapNode[],
  labelByCode: Map<string, LocationStockLabel>,
  shelfHalf: number,
  invScale: number
) {
  const sortedNodes = [...nodes].sort((a, b) => a.x - b.x);
  const columns: { x: number; isBP: boolean; isCN: boolean }[] = [];
  for (const node of sortedNodes) {
    if (columns.length === 0 || node.x - columns[columns.length - 1].x > shelfHalf) {
      columns.push({ x: node.x, isBP: false, isCN: false });
    }
    const currentCol = columns[columns.length - 1];
    const bin = labelByCode.get(node.content)?.bin ?? "";
    if (bin.includes("BP")) currentCol.isBP = true;
    if (bin.includes("CN")) currentCol.isCN = true;
  }

  const allY = nodes.map((n) => n.y);
  const minY = Math.min(...allY) - shelfHalf;
  const maxY = Math.max(...allY) + shelfHalf;

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = "rgba(100, 116, 139, 0.8)";
  ctx.lineWidth = 4 * invScale;
  for (let i = 0; i < columns.length - 1; i++) {
    const col1 = columns[i];
    const col2 = columns[i + 1];
    if (
      (col1.isBP && col2.isCN && !col1.isCN && !col2.isBP) ||
      (col1.isCN && col2.isBP && !col1.isBP && !col2.isCN)
    ) {
      const separatorX = (col1.x + col2.x) / 2;
      ctx.moveTo(separatorX, minY);
      ctx.lineTo(separatorX, maxY);
    }
  }
  ctx.stroke();
  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function OperatorMapCanvas({
  zoneId,
  showInboundSeparator = false,
  className,
  selectedCodes,
  onBufferCellClick,
  onBufferCellDoubleClick,
  tuning,
  overlayLabelByCode,
  interactiveCodes,
}: Props) {
  // ── API data ────────────────────────────────────────────────────────────────
  const {
    data: layoutResponse,
    isLoading: isLayoutLoading,
    isError: isLayoutError,
  } = useZoneMapLayout(zoneId);

  const {
    data: statusResponse,
    isLoading: isStatusLoading,
    isError: isStatusError,
  } = useZoneMapStatus(zoneId);

  const isLoading = isLayoutLoading || isStatusLoading;
  const isError = isLayoutError || isStatusError;

  // ── Derived data (useMemo — tránh tính lại khi statusResponse chưa đổi) ────
  const labelByCode = useMemo(() => {
    const map = new Map<string, LocationStockLabel>();
    for (const cell of statusResponse?.locations ?? []) {
      let qty = 0;
      for (const item of cell.item_stock ?? []) {
        qty += Number(item.quantity) || 0;
      }
      map.set(cell.location_code, {
        location_id: cell.id,
        location_code: cell.location_code,
        is_empty: (cell.item_stock ?? []).length === 0,
        display_status: cell.status,
        product_sku: cell.item_stock?.[0]?.sku ?? null,
        product_name: cell.item_stock?.[0]?.sku ?? null,
        bin: cell.bin_code ?? null,
        location_type: null,
        quantity: qty,
        line_count: (cell.item_stock ?? []).length,
      });
    }
    return map;
  }, [statusResponse]);
  const interactiveCodeSet = useMemo(() => {
    if (interactiveCodes == null) return null;
    if (interactiveCodes instanceof Set) return interactiveCodes;
    return new Set(interactiveCodes);
  }, [interactiveCodes]);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<MapNode[]>([]);
  const contentBoundsRef = useRef<MapContentBounds | null>(null);

  const labelByCodeRef = useRef<Map<string, LocationStockLabel>>(new Map());
  const overlayLabelByCodeRef = useRef<Record<string, string>>({});
  const selectedCodesRef = useRef<Set<string>>(new Set());
  const interactiveCodesRef = useRef<Set<string> | null>(null);

  const onClickRef = useRef(onBufferCellClick);
  const onDoubleClickRef = useRef(onBufferCellDoubleClick);

  const scaleRef = useRef(1);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);

  const tuningRef = useRef<Required<BufferMapCanvasTuning>>({ ...OPERATOR_MAP_CANVAS_DEFAULTS });

  // Sync tuningRef với prop tuning mỗi render (không cần useEffect)
  tuningRef.current = {
    fitScaleFactor: tuning?.fitScaleFactor ?? OPERATOR_MAP_CANVAS_DEFAULTS.fitScaleFactor,
    fitPaddingRatio: tuning?.fitPaddingRatio ?? OPERATOR_MAP_CANVAS_DEFAULTS.fitPaddingRatio,
    baseNodeSize: tuning?.baseNodeSize ?? OPERATOR_MAP_CANVAS_DEFAULTS.baseNodeSize,
    shelfSizeFactor: tuning?.shelfSizeFactor ?? OPERATOR_MAP_CANVAS_DEFAULTS.shelfSizeFactor,
    labelTextScale: tuning?.labelTextScale ?? OPERATOR_MAP_CANVAS_DEFAULTS.labelTextScale,
  };

  const [hasData, setHasData] = useState(false);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const isInteractiveCode = useCallback((code: string) => {
    const allowed = interactiveCodesRef.current;
    if (allowed == null) return true;
    return allowed.has(code);
  }, []);

  // ── Draw ────────────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layoutResponse) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const opts = tuningRef.current;
    const labels = labelByCodeRef.current;
    const selectedCodes = selectedCodesRef.current;
    const invScale = 1 / scaleRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.setTransform(
      scaleRef.current, 0,
      0, scaleRef.current,
      offsetXRef.current, offsetYRef.current,
    );

    // Kích thước ô kệ = baseNodeSize * shelfSizeFactor (cố định, tunable)
    const shelfHalf = opts.baseNodeSize * opts.shelfSizeFactor;
    const showLabels = shelfHalf * 2 * scaleRef.current >= LABEL_MIN_SCREEN_PX;

    // Vẽ đường phân cách BP / CN nếu showInboundSeparator
    if (showInboundSeparator && nodesRef.current.length > 0) {
      drawInboundSeparator(ctx, nodesRef.current, labels, shelfHalf, invScale);
    }

    // Vẽ từng node
    for (const node of nodesRef.current) {

      const interactive = isInteractiveCode(node.content);
      const isSelected = interactive && selectedCodes.has(node.content);
      const label = labels.get(node.content);
      const status = label?.display_status ?? "empty";

      // Vẽ ô kệ với màu theo trạng thái
      drawShelfByStatus(ctx, status, node.x, node.y, shelfHalf, invScale);

      // Viền nổi bật khi đang được chọn
      if (isSelected) {
        drawSelectedHighlight(ctx, node.x, node.y, shelfHalf, invScale);
      }

      // Text label (SKU, số lượng, bin code)
      if (showLabels) {
        const overlay = overlayLabelByCodeRef.current[node.content]?.trim();
        const displayBin = label ? formatDisplayBin(label.bin, label.location_type) : "";

        if (overlay) {
          drawStationOverlayLabel(ctx, node.x, node.y, shelfHalf, overlay, isSelected, displayBin);
        } else {
          drawShelfStockLabel(
            ctx,
            node.x,
            node.y,
            shelfHalf,
            label,
            opts.labelTextScale,
            isSelected,
            false
          );
        }
      }
    }

    ctx.restore();
  }, [showInboundSeparator, layoutResponse, isInteractiveCode]);

  // ── Fit ─────────────────────────────────────────────────────────────────────
  /**
   * Tính scale và offset để fit toàn bộ bản đồ vào canvas, căn giữa.
   *
   * Scale: tỉ lệ nhỏ nhất giữa (rộng màn hình / rộng kho) và (cao màn hình / cao kho)
   *        → đảm bảo kho không bị tràn theo chiều nào.
   *
   * Offset: dịch chuyển bản đồ vào trung tâm màn hình
   *         = pad + (khoảng thừa / 2) - minX * scale
   *         (phải trừ minX vì toạ độ backend không bắt đầu từ 0)
   */
  const fitToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const bounds = contentBoundsRef.current;
    if (!canvas || !bounds) return;
    const opts = tuningRef.current;

    const pad = Math.min(canvas.width, canvas.height) * opts.fitPaddingRatio;
    const availW = canvas.width - pad * 2;
    const availH = canvas.height - pad * 2;
    const scale = Math.min(availW / bounds.width, availH / bounds.height);
    const lockedScale = scale * opts.fitScaleFactor;
    scaleRef.current = lockedScale;
    offsetXRef.current = pad + (availW - bounds.width * lockedScale) / 2 - bounds.minX * lockedScale;
    offsetYRef.current = pad + (availH - bounds.height * lockedScale) / 2 - bounds.minY * lockedScale;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    canvas.width = Math.max(container.clientWidth, 1);
    canvas.height = Math.max(container.clientHeight, 1);
    fitToCanvas();
    draw();
  }, [draw, fitToCanvas]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Sync callback refs (không cần trigger redraw)
  useEffect(() => { onClickRef.current = onBufferCellClick; }, [onBufferCellClick]);
  useEffect(() => { onDoubleClickRef.current = onBufferCellDoubleClick; }, [onBufferCellDoubleClick]);

  useEffect(() => {
    labelByCodeRef.current = labelByCode;
    draw();
  }, [labelByCode, draw]);

  useEffect(() => {
    overlayLabelByCodeRef.current = overlayLabelByCode ?? {};
    draw();
  }, [overlayLabelByCode, draw]);

  useEffect(() => {
    interactiveCodesRef.current = interactiveCodeSet;
    draw();
  }, [interactiveCodeSet, draw]);

  useEffect(() => {
    if (selectedCodes && selectedCodes.length > 0) {
      selectedCodesRef.current = new Set(selectedCodes);
    } else {
      selectedCodesRef.current = new Set();
    }
    draw();
  }, [selectedCodes, draw]);

  // Build nodes từ layoutResponse + tính bounds
  useEffect(() => {
    if (!layoutResponse || layoutResponse.nodes.length === 0) {
      nodesRef.current = [];
      contentBoundsRef.current = null;
      setHasData(false);
      return;
    }

    const nodes: MapNode[] = layoutResponse.nodes.map((n) => ({
      x: n.map_x,
      y: -(n.map_y) * 1.2, // Lật ngược trục Y (Flip Y)
      content: n.location_code,
    }));

    // Thu hẹp khoảng trống khổng lồ (gap) giữa các cụm node (ví dụ kho 12 và 13 bị cách nhau bởi kho 10)
    const GAP_THRESHOLD = tuningRef.current.baseNodeSize * 9;
    const COLLAPSED_GAP = tuningRef.current.baseNodeSize * 2.4;

    const collapseAxis = (axis: "x" | "y") => {
      const uniqueVals = Array.from(new Set(nodes.map((n) => n[axis]))).sort((a, b) => a - b);
      if (uniqueVals.length === 0) return;

      const mapping = new Map<number, number>();
      let currentVal = uniqueVals[0];
      mapping.set(uniqueVals[0], currentVal);

      for (let i = 1; i < uniqueVals.length; i++) {
        const diff = uniqueVals[i] - uniqueVals[i - 1];
        // Nếu khoảng cách giữa 2 node lớn hơn ngưỡng cho phép -> Kéo chúng lại gần nhau
        if (diff > GAP_THRESHOLD) {
          currentVal += COLLAPSED_GAP;
        } else {
          currentVal += diff;
        }
        mapping.set(uniqueVals[i], currentVal);
      }
      for (const node of nodes) {
        node[axis] = mapping.get(node[axis])!;
      }
    };

    collapseAxis("x");
    collapseAxis("y");

    nodesRef.current = nodes;
    contentBoundsRef.current = computeMapSizeFromNodes(nodes, tuningRef.current.baseNodeSize);

    setHasData(true);
    resizeCanvas();
  }, [layoutResponse, resizeCanvas]);

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(container);
    resizeCanvas();
    return () => observer.disconnect();
  }, [resizeCanvas]);

  // Click / Double-click
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resolveClickPayload = (e: MouseEvent): BufferCellClickPayload | null => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wx = (sx - offsetXRef.current) / scaleRef.current;
      const wy = (sy - offsetYRef.current) / scaleRef.current;

      const opts = tuningRef.current;
      const shelfHalf = opts.baseNodeSize * opts.shelfSizeFactor;
      const hitRadius = shelfHalf * 0.55;
      let closest: MapNode | null = null;
      let closestDist = Infinity;

      for (const node of nodesRef.current) {
        if (!isInteractiveCode(node.content)) continue;
        const dist = Math.hypot(wx - node.x, wy - node.y);
        if (dist <= hitRadius && dist < closestDist) {
          closestDist = dist;
          closest = node;
        }
      }
      if (!closest) return null;

      const columnLocationCodes = nodesRef.current
        .filter((n) => Math.abs(n.x - closest!.x) < shelfHalf * 0.5)
        .map((n) => n.content);

      return {
        locationCode: closest.content,
        x: closest.x,
        y: closest.y,
        columnLocationCodes
      };
    };

    const onClick = (e: MouseEvent) => {
      const payload = resolveClickPayload(e);
      if (payload) onClickRef.current?.(payload);
    };

    const onDoubleClick = (e: MouseEvent) => {
      if (!onDoubleClickRef.current) return;
      const payload = resolveClickPayload(e);
      if (payload) onDoubleClickRef.current(payload);
    };

    canvas.addEventListener("click", onClick);
    canvas.addEventListener("dblclick", onDoubleClick);
    canvas.style.cursor =
      onClickRef.current || onDoubleClickRef.current ? "pointer" : "default";
    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("dblclick", onDoubleClick);
    };
  }, [onBufferCellClick, onBufferCellDoubleClick, isInteractiveCode]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`relative min-h-0 w-full bg-canvas ${className ?? ""}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-slate-500">
          Đang tải bản đồ...
        </div>
      )}

      {!isLoading && isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 px-4 text-center text-sm text-slate-500">
          Không tải được bản đồ
        </div>
      )}

      {!isLoading && !isError && hasData && labelByCode.size === 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-slate-500 shadow-sm">
          Chưa có điểm nào trong zone
        </div>
      )}
    </div>
  );
}
