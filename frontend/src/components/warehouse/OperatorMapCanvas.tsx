/**
 * OperatorMapCanvas — Bản đồ kho vận hành theo 1 hoặc nhiều zone.
 *
 * Nhiều zone: gọi layout/status của các zone song song, gộp node theo location_code
 * rồi vẽ chung (các zone cùng hệ toạ độ map_x/map_y của warehouse).
 *
 * Thay đổi so với phiên bản cũ (theo quyết định đã chốt):
 * - Kích thước ô tự tính theo pitch thực của từng layout (mapCellMetrics), không đè nhau.
 * - Canvas theo devicePixelRatio để chữ và viền luôn nét.
 * - Màu sắc theo chuẩn WarehouseMapCanvas (import từ warehouseMapUtils).
 * - Bỏ khái niệm bufferCodes làm mờ kệ — tất cả node trong zone đều có status.
 * - Không có pan, zoom, virtual grid hay responsive zoom.
 * - Chỉ cho tap / click vào ô kệ (pointerup; parent tự phân biệt 1 vs 2 tap).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useZonesMapLayout, useZonesMapStatus } from "@/hooks/useWarehouseMap";
import type { LocationStockLabel } from "@/types/warehouseLocation";
import { OPERATOR_MAP_CANVAS_DEFAULTS } from "@/constants/operatorDesktopSizes";
import {
  computeCellBounds,
  computeCellLayout,
  estimateAxisPitch,
  findCellAt,
  layoutGroupKey,
  type CellBounds,
  type CellSize,
} from "@/utils/mapCellMetrics";
import {
  applyCameraTransform,
  clearCanvas,
  clientToCanvasCss,
  resizeCanvasToContainer,
  type CanvasCssSize,
} from "@/utils/canvasDpr";
import {
  drawAssignedCcShelf,
  drawCcAssignedShelfCaption,
  drawPendingStockConfirmShelf,
  drawShelfStockLabel,
  drawStationOverlayLabel,
  parseVehicleFromStationOverlay,
} from "@/utils/warehouseMapShelfDraw";
import { formatDisplayBin } from "@/utils/locationBin";
import {
  SHELF_FULL_COLOR,
  SHELF_EMPTY_COLOR,
  SHELF_SELECTED_COLOR,
  SHELF_STROKE_COLOR,
  SHELF_RESERVED_COLOR,
  SHELF_IN_TRANSIT_COLOR,
} from "@/utils/warehouseMapUtils";

const LABEL_MIN_SCREEN_PX = 16;

// ─── Drawing helpers ──────────────────────────────────────────────────────────
/**
 * Vẽ ô kệ theo trạng thái, cùng thứ tự màu với WarehouseMapCanvas.
 * - reserved   → SHELF_RESERVED_COLOR
 * - in_transit → SHELF_IN_TRANSIT_COLOR
 * - has_stock / có tồn → SHELF_FULL_COLOR
 * - còn lại    → SHELF_EMPTY_COLOR
 */
function drawShelfByStatus(
  ctx: CanvasRenderingContext2D,
  status: string,
  isFull: boolean,
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  invScale: number,
) {
  if (status === "reserved") {
    ctx.fillStyle = SHELF_RESERVED_COLOR;
  } else if (status === "in_transit") {
    ctx.fillStyle = SHELF_IN_TRANSIT_COLOR;
  } else if (isFull || status === "has_stock") {
    ctx.fillStyle = SHELF_FULL_COLOR;
  } else {
    ctx.fillStyle = SHELF_EMPTY_COLOR;
  }
  const radius = Math.max(4, Math.min(halfW, halfH) * 0.15);
  ctx.beginPath();
  ctx.roundRect(x - halfW, y - halfH, halfW * 2, halfH * 2, radius);
  ctx.fill();
  ctx.strokeStyle = SHELF_STROKE_COLOR;
  ctx.lineWidth = invScale;
  ctx.stroke();
}

/**
 * Vẽ viền nổi bật khi ô đang được chọn, dùng màu SHELF_SELECTED_COLOR (xanh lá).
 */
function drawSelectedHighlight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  halfW: number,
  halfH: number,
  invScale: number,
) {
  const radius = Math.max(4, Math.min(halfW, halfH) * 0.15);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - halfW, y - halfH, halfW * 2, halfH * 2, radius);
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
  /** Hệ số zoom sau khi fit, tối đa 1 (lớn hơn sẽ cắt mất ô ở mép). */
  fitScaleFactor?: number;
  /** Padding khi fit, tính theo tỉ lệ cạnh ngắn nhất. */
  fitPaddingRatio?: number;
  /** Tỉ lệ ô chiếm trong một bước lưới (pitch) của layout. */
  fillRatio?: number;
  /** Khe hở tối thiểu giữa hai ô, theo tỉ lệ pitch. */
  minGapRatio?: number;
  /** Dải chừa phía trên ô cho tên vị trí (và dưới ô cho biển số), theo tỉ lệ pitch dọc. */
  titleBandRatio?: number;
  /** Hệ số phóng chữ label trong ô. */
  labelTextScale?: number;
  /** @deprecated Kích thước ô tự tính theo pitch; chỉ còn dùng khi layout chỉ có 1 ô. */
  baseNodeSize?: number;
  /** @deprecated Không còn tác dụng — dùng fillRatio. */
  shelfSizeFactor?: number;
};

type ResolvedTuning = Required<
  Pick<
    BufferMapCanvasTuning,
    | "fitScaleFactor"
    | "fitPaddingRatio"
    | "fillRatio"
    | "minGapRatio"
    | "titleBandRatio"
    | "labelTextScale"
    | "baseNodeSize"
  >
>;

function resolveTuning(tuning: BufferMapCanvasTuning | undefined): ResolvedTuning {
  const d = OPERATOR_MAP_CANVAS_DEFAULTS;
  return {
    fitScaleFactor: Math.min(1, tuning?.fitScaleFactor ?? d.fitScaleFactor),
    fitPaddingRatio: tuning?.fitPaddingRatio ?? d.fitPaddingRatio,
    fillRatio: tuning?.fillRatio ?? d.fillRatio,
    minGapRatio: tuning?.minGapRatio ?? d.minGapRatio,
    titleBandRatio: tuning?.titleBandRatio ?? d.titleBandRatio,
    labelTextScale: tuning?.labelTextScale ?? d.labelTextScale,
    baseNodeSize: tuning?.baseNodeSize ?? d.baseNodeSize,
  };
}

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
  group: string;
};

/** Khoảng trống giữa các cụm lớn hơn (pitch × hệ số này) sẽ bị thu lại. */
const GAP_COLLAPSE_PITCHES = 3;
const COLLAPSED_GAP_PITCHES = 1.5;
/** Giới hạn rộng/cao để layout thưa (vd. BP cách nhau rất xa) không ra ô dẹt bất thường. */
const OPERATOR_CELL_MIN_ASPECT = 0.6;
const OPERATOR_CELL_MAX_ASPECT = 1.6;

type Props = {
  /** 1 zone hoặc danh sách zone cần vẽ chung trên cùng canvas. */
  zoneId: number | number[];
  showInboundSeparator?: boolean;
  className?: string;
  selectedCodes?: string[];
  onBufferCellClick?: (payload: BufferCellClickPayload) => void;
  onBufferCellDoubleClick?: (payload: BufferCellClickPayload) => void;
  tuning?: BufferMapCanvasTuning;
  /** Label overlay theo mã ô (vd. biển số xe / tên KH trên sorting station). */
  overlayLabelByCode?: Record<string, string>;
  /** Biển số hiển thị dưới tên vị trí (ngoặc, xanh) — vd. cache CC Masan. */
  locationSubLabelByCode?: Record<string, string>;
  /** Ô có hàng chờ xác nhận (WS) — vẽ nền cam + chữ tối. */
  pendingConfirmOverlayCodes?: string[] | Set<string>;
  /**
   * Chỉ các mã location trong danh sách này mới nhận được click.
   * Nếu không truyền → tất cả ô đều có thể click.
   */
  interactiveCodes?: string[] | Set<string>;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Thu hẹp khoảng trống khổng lồ giữa các cụm node trên một trục
 * (ví dụ kho 12 và 13 bị cách nhau bởi kho 10).
 */
function collapseAxisGaps(nodes: MapNode[], axis: "x" | "y", pitch: number) {
  const threshold = pitch * GAP_COLLAPSE_PITCHES;
  const collapsed = pitch * COLLAPSED_GAP_PITCHES;
  const uniqueVals = Array.from(new Set(nodes.map((n) => n[axis]))).sort((a, b) => a - b);
  if (uniqueVals.length === 0) return;

  const mapping = new Map<number, number>();
  let currentVal = uniqueVals[0];
  mapping.set(uniqueVals[0], currentVal);
  for (let i = 1; i < uniqueVals.length; i++) {
    const diff = uniqueVals[i] - uniqueVals[i - 1];
    currentVal += diff > threshold ? collapsed : diff;
    mapping.set(uniqueVals[i], currentVal);
  }
  for (const node of nodes) {
    node[axis] = mapping.get(node[axis])!;
  }
}

function drawInboundSeparator(
  ctx: CanvasRenderingContext2D,
  nodes: MapNode[],
  labelByCode: Map<string, LocationStockLabel>,
  shelfHalfW: number,
  shelfHalfH: number,
  invScale: number
) {
  const sortedNodes = [...nodes].sort((a, b) => a.y - b.y);
  const rows: { y: number; isBP: boolean; isCN: boolean }[] = [];
  for (const node of sortedNodes) {
    if (rows.length === 0 || node.y - rows[rows.length - 1].y > shelfHalfH) {
      rows.push({ y: node.y, isBP: false, isCN: false });
    }
    const currentRow = rows[rows.length - 1];
    const bin = labelByCode.get(node.content)?.bin ?? "";
    if (bin.includes("BP")) currentRow.isBP = true;
    if (bin.includes("CN")) currentRow.isCN = true;
  }

  const allX = nodes.map((n) => n.x);
  const minX = Math.min(...allX) - shelfHalfW;
  const maxX = Math.max(...allX) + shelfHalfW;

  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = "rgba(100, 116, 139, 0.8)";
  ctx.lineWidth = 4 * invScale;
  for (let i = 0; i < rows.length - 1; i++) {
    const row1 = rows[i];
    const row2 = rows[i + 1];
    if (
      (row1.isBP && row2.isCN && !row1.isCN && !row2.isBP) ||
      (row1.isCN && row2.isBP && !row1.isBP && !row2.isCN)
    ) {
      const separatorY = (row1.y + row2.y) / 2;
      ctx.moveTo(minX, separatorY);
      ctx.lineTo(maxX, separatorY);
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
  locationSubLabelByCode,
  pendingConfirmOverlayCodes,
  interactiveCodes,
}: Props) {
  // ── API data ────────────────────────────────────────────────────────────────
  const zoneIdsKey = (Array.isArray(zoneId) ? zoneId : [zoneId]).join(",");
  const zoneIds = useMemo(
    () =>
      [...new Set(zoneIdsKey.split(",").map(Number))]
        .filter((id) => Number.isFinite(id) && id > 0)
        .sort((a, b) => a - b),
    [zoneIdsKey],
  );

  const layoutQuery = useZonesMapLayout(zoneIds);
  const statusQuery = useZonesMapStatus(zoneIds);
  const refetchMapStatusRef = useRef(statusQuery.refetch);
  refetchMapStatusRef.current = statusQuery.refetch;
  const layoutNodes = layoutQuery.items;

  const isLoading = layoutQuery.isLoading || statusQuery.isLoading;
  const failedZoneIds = useMemo(
    () => [...new Set([...layoutQuery.failedZoneIds, ...statusQuery.failedZoneIds])].sort((a, b) => a - b),
    [layoutQuery.failedZoneIds, statusQuery.failedZoneIds],
  );

  useEffect(() => {
    if (failedZoneIds.length > 0) {
      console.warn(`[OperatorMapCanvas] Không tải được zone: ${failedZoneIds.join(", ")}`);
    }
  }, [failedZoneIds]);

  // ── Derived data (useMemo — tránh tính lại khi status chưa đổi) ────────────
  const labelByCode = useMemo(() => {
    const map = new Map<string, LocationStockLabel>();
    for (const cell of statusQuery.items) {
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
        lot_number: cell.item_stock?.[0]?.lot_number ?? null,
      });
    }
    return map;
  }, [statusQuery.items]);
  const interactiveCodeSet = useMemo(() => {
    if (interactiveCodes == null) return null;
    if (interactiveCodes instanceof Set) return interactiveCodes;
    return new Set(interactiveCodes);
  }, [interactiveCodes]);

  const pendingConfirmCodeSet = useMemo(() => {
    if (pendingConfirmOverlayCodes == null) return new Set<string>();
    if (pendingConfirmOverlayCodes instanceof Set) {
      return pendingConfirmOverlayCodes;
    }
    return new Set(pendingConfirmOverlayCodes);
  }, [pendingConfirmOverlayCodes]);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<MapNode[]>([]);
  const nodeSizesRef = useRef<CellSize[]>([]);
  const medianHalfRef = useRef({ w: 0, h: 0 });
  const contentBoundsRef = useRef<CellBounds | null>(null);
  const cssSizeRef = useRef<CanvasCssSize>({ width: 1, height: 1, dpr: 1 });

  const labelByCodeRef = useRef<Map<string, LocationStockLabel>>(new Map());
  const overlayLabelByCodeRef = useRef<Record<string, string>>({});
  const locationSubLabelByCodeRef = useRef<Record<string, string>>({});
  const pendingConfirmOverlayCodesRef = useRef<Set<string>>(new Set());
  const selectedCodesRef = useRef<Set<string>>(new Set());
  const interactiveCodesRef = useRef<Set<string> | null>(null);

  const onClickRef = useRef(onBufferCellClick);
  const onDoubleClickRef = useRef(onBufferCellDoubleClick);

  const scaleRef = useRef(1);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);

  const tuningRef = useRef<ResolvedTuning>(resolveTuning(tuning));

  // Sync tuningRef với prop tuning mỗi render (không cần useEffect)
  tuningRef.current = resolveTuning(tuning);

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
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const opts = tuningRef.current;
    const labels = labelByCodeRef.current;
    const selectedCodes = selectedCodesRef.current;
    const scale = scaleRef.current;
    const invScale = 1 / scale;

    clearCanvas(ctx, canvas);

    ctx.save();
    applyCameraTransform(ctx, cssSizeRef.current.dpr, scale, offsetXRef.current, offsetYRef.current);

    // Vẽ đường phân cách BP / CN nếu showInboundSeparator
    if (showInboundSeparator && nodesRef.current.length > 0) {
      drawInboundSeparator(
        ctx,
        nodesRef.current,
        labels,
        medianHalfRef.current.w,
        medianHalfRef.current.h,
        invScale,
      );
    }

    // Vẽ từng node
    const sizes = nodeSizesRef.current;
    for (let i = 0; i < nodesRef.current.length; i++) {
      const node = nodesRef.current[i];
      const halfW = sizes[i].w / 2;
      const halfH = sizes[i].h / 2;
      const shelfHalf = { w: halfW, h: halfH };
      const showLabels = Math.min(halfW, halfH) * 2 * scale >= LABEL_MIN_SCREEN_PX;

      const interactive = isInteractiveCode(node.content);
      const isSelected = interactive && selectedCodes.has(node.content);
      const label = labels.get(node.content);
      const status = label?.display_status ?? "empty";
      const isFull = label != null && !label.is_empty;

      const overlayForAssign =
        overlayLabelByCodeRef.current[node.content]?.trim() ?? "";
      const vehiclePlateForAssign =
        locationSubLabelByCodeRef.current[node.content]?.trim() ||
        parseVehicleFromStationOverlay(overlayForAssign);
      const isPendingConfirm =
        pendingConfirmOverlayCodesRef.current.has(node.content) &&
        overlayForAssign.length > 0;
      const showAssignedShelf =
        !isPendingConfirm &&
        Boolean(vehiclePlateForAssign) &&
        !isFull &&
        status !== "reserved" &&
        status !== "in_transit";

      if (isPendingConfirm) {
        drawPendingStockConfirmShelf(ctx, node.x, node.y, shelfHalf, invScale);
      } else if (showAssignedShelf) {
        drawAssignedCcShelf(ctx, node.x, node.y, shelfHalf, invScale);
      } else {
        drawShelfByStatus(ctx, status, isFull, node.x, node.y, halfW, halfH, invScale);
      }

      // Viền nổi bật khi đang được chọn
      if (isSelected) {
        drawSelectedHighlight(ctx, node.x, node.y, halfW, halfH, invScale);
      }

      // Text label (SKU, số lượng, bin code)
      if (showLabels) {
        const overlay = overlayLabelByCodeRef.current[node.content]?.trim();
        const displayBin = label ? formatDisplayBin(label.bin, label.location_type) : "";
        const vehiclePlate = vehiclePlateForAssign || undefined;

        if (overlay) {
          drawStationOverlayLabel(
            ctx,
            node.x,
            node.y,
            shelfHalf,
            overlay,
            isSelected,
            displayBin,
            opts.labelTextScale,
            vehiclePlate,
            isPendingConfirm ? "pendingConfirm" : "default",
          );
        } else if (showAssignedShelf && vehiclePlate) {
          drawCcAssignedShelfCaption(
            ctx,
            node.x,
            node.y,
            shelfHalf,
            displayBin,
            vehiclePlate,
            opts.labelTextScale,
            isSelected,
          );
        } else {
          drawShelfStockLabel(
            ctx,
            node.x,
            node.y,
            shelfHalf,
            label,
            opts.labelTextScale,
            isSelected,
            false,
            vehiclePlate,
          );
        }
      }
    }

    ctx.restore();
  }, [showInboundSeparator, isInteractiveCode]);

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
    const { width: cssW, height: cssH } = cssSizeRef.current;

    const pad = Math.min(cssW, cssH) * opts.fitPaddingRatio;
    const availW = Math.max(cssW - pad * 2, 1);
    const availH = Math.max(cssH - pad * 2, 1);
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
    cssSizeRef.current = resizeCanvasToContainer(canvas, container);
    fitToCanvas();
    draw();
  }, [draw, fitToCanvas]);

  // ── Effects ─────────────────────────────────────────────────────────────────

  // Sync callback refs (không cần trigger redraw)
  useEffect(() => { onClickRef.current = onBufferCellClick; }, [onBufferCellClick]);
  useEffect(() => {
    onDoubleClickRef.current = onBufferCellDoubleClick;
  }, [onBufferCellDoubleClick]);

  useEffect(() => {
    labelByCodeRef.current = labelByCode;
    draw();
  }, [labelByCode, draw]);

  useEffect(() => {
    overlayLabelByCodeRef.current = overlayLabelByCode ?? {};
    draw();
  }, [overlayLabelByCode, draw]);

  useEffect(() => {
    locationSubLabelByCodeRef.current = locationSubLabelByCode ?? {};
    draw();
  }, [locationSubLabelByCode, draw]);

  useEffect(() => {
    pendingConfirmOverlayCodesRef.current = pendingConfirmCodeSet;
    draw();
  }, [pendingConfirmCodeSet, draw]);

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

  // Build nodes từ layout đã gộp + tính bounds (chờ mọi zone tải xong để không vẽ nửa chừng)
  useEffect(() => {
    if (layoutQuery.isLoading) return;
    if (layoutNodes.length === 0) {
      nodesRef.current = [];
      nodeSizesRef.current = [];
      contentBoundsRef.current = null;
      setHasData(false);
      draw();
      return;
    }

    const opts = tuningRef.current;
    const nodes: MapNode[] = layoutNodes.map((n) => ({
      x: n.map_x,
      y: -n.map_y, // Lật ngược trục Y (Flip Y)
      content: n.location_code,
      group: layoutGroupKey(n.bin_code || n.location_name || n.location_code),
    }));

    const rawPitch = estimateAxisPitch(nodes);
    const pitchX = rawPitch.pitchX ?? rawPitch.pitchY;
    const pitchY = rawPitch.pitchY ?? rawPitch.pitchX;
    if (pitchX != null) collapseAxisGaps(nodes, "x", pitchX);
    if (pitchY != null) collapseAxisGaps(nodes, "y", pitchY);

    // Quay layout đã parse 90° sang phải: (x, y) -> (y, -x). Chữ label vẫn nằm ngang.
    for (const node of nodes) {
      const nextX = node.y;
      node.y = -node.x;
      node.x = nextX;
    }

    const layout = computeCellLayout(nodes, {
      fillRatio: opts.fillRatio,
      minGapRatio: opts.minGapRatio,
      titleBandRatio: opts.titleBandRatio,
      minAspect: OPERATOR_CELL_MIN_ASPECT,
      maxAspect: OPERATOR_CELL_MAX_ASPECT,
      fallbackSize: opts.baseNodeSize,
    });
    const halfWs = layout.sizes.map((s) => s.w / 2).sort((a, b) => a - b);
    const halfHs = layout.sizes.map((s) => s.h / 2).sort((a, b) => a - b);
    const mid = Math.floor(layout.sizes.length / 2);

    nodesRef.current = nodes;
    nodeSizesRef.current = layout.sizes;
    medianHalfRef.current = { w: halfWs[mid] ?? 0, h: halfHs[mid] ?? 0 };
    // Dải dưới ô (biển số) ≈ dải tên phía trên.
    contentBoundsRef.current = computeCellBounds(nodes, layout.sizes, 1);

    setHasData(true);
    resizeCanvas();
  }, [layoutQuery.isLoading, layoutNodes, resizeCanvas, draw]);

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(container);
    resizeCanvas();
    return () => observer.disconnect();
  }, [resizeCanvas]);

  // Tap / click + double-tap (pointerup — tablet-friendly)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const DOUBLE_TAP_MS = 380;
    const SINGLE_TAP_DELAY_MS = 320;
    let lastTapCode: string | null = null;
    let lastTapAt = 0;
    let singleTapTimer: number | undefined;

    const resolveClickPayload = (
      clientX: number,
      clientY: number,
    ): BufferCellClickPayload | null => {
      const pos = clientToCanvasCss(canvas, clientX, clientY, cssSizeRef.current);
      const wx = (pos.x - offsetXRef.current) / scaleRef.current;
      const wy = (pos.y - offsetYRef.current) / scaleRef.current;

      const sizes = nodeSizesRef.current;
      const hitIndex = findCellAt(nodesRef.current, sizes, wx, wy, (node) =>
        isInteractiveCode(node.content),
      );
      if (hitIndex < 0) return null;
      const closest = nodesRef.current[hitIndex];
      const columnTolerance = sizes[hitIndex].w * 0.5;

      const columnLocationCodes = nodesRef.current
        .filter((n) => Math.abs(n.x - closest.x) < columnTolerance)
        .map((n) => n.content);

      return {
        locationCode: closest.content,
        x: closest.x,
        y: closest.y,
        columnLocationCodes
      };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const payload = resolveClickPayload(e.clientX, e.clientY);
      if (!payload) return;

      const now = Date.now();
      const isDouble =
        onDoubleClickRef.current != null &&
        lastTapCode === payload.locationCode &&
        now - lastTapAt <= DOUBLE_TAP_MS;

      if (isDouble) {
        if (singleTapTimer !== undefined) {
          window.clearTimeout(singleTapTimer);
          singleTapTimer = undefined;
        }
        lastTapCode = null;
        lastTapAt = 0;
        void refetchMapStatusRef.current();
        onDoubleClickRef.current?.(payload);
        return;
      }

      lastTapCode = payload.locationCode;
      lastTapAt = now;

      if (singleTapTimer !== undefined) {
        window.clearTimeout(singleTapTimer);
      }
      singleTapTimer = window.setTimeout(() => {
        singleTapTimer = undefined;
        lastTapCode = null;
        void refetchMapStatusRef.current();
        onClickRef.current?.(payload);
      }, SINGLE_TAP_DELAY_MS);
    };

    canvas.addEventListener("pointerup", onPointerUp);
    canvas.style.cursor =
      onClickRef.current || onDoubleClickRef.current ? "pointer" : "default";
    canvas.style.touchAction = "none";
    return () => {
      canvas.removeEventListener("pointerup", onPointerUp);
      if (singleTapTimer !== undefined) {
        window.clearTimeout(singleTapTimer);
      }
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

      {!isLoading && !hasData && failedZoneIds.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 px-4 text-center text-sm text-slate-500">
          Không tải được bản đồ
        </div>
      )}

      {!isLoading && hasData && failedZoneIds.length > 0 && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-lg bg-amber-50/95 px-3 py-1.5 text-xs text-amber-700 shadow-sm">
          Không tải được zone {failedZoneIds.join(", ")}
        </div>
      )}

      {!isLoading && failedZoneIds.length === 0 && hasData && labelByCode.size === 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-slate-500 shadow-sm">
          Chưa có điểm nào trên bản đồ
        </div>
      )}
    </div>
  );
}
