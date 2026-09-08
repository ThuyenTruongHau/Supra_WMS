/**
 * Bản đồ crop theo location_type — dùng GET /inbound-buffers/view?location_type=...
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapLocationTypeParam } from "@/api/warehouseMap";
import { useInboundBufferMapView } from "@/hooks/useWarehouseMap";
import { useLocationStockLabels, useLocationByCodeMap } from "@/hooks/useWarehouseLocation";
import type { LocationStockLabel, WarehouseLocation } from "@/types/warehouseLocation";
import type { MapData, NodeInfo } from "@/types/warehouseMap";
import {
  computeMapContentBounds,
  computeMinShelfSpacing,
  computeOperatorVirtualGridLayout,
  computeShelfHalfSize,
  isRenderableMapData,
  parseLinePath,
  parseMapNodes,
  type MapContentBounds,
  type OperatorVirtualGridLayout,
} from "@/utils/warehouseMapRender";
import { OPERATOR_WAVE_MAP_TUNING } from "@/constants/operatorDesktopSizes";
import {
  SHELF_TECH,
  drawShelfStockLabel,
  drawStationOverlayLabel,
  drawTechOccupiedCell,
  drawTechTakingCell,
  drawOutboundStationCellByStatus,
  drawBypassOccupiedCell,
  drawBypassEmptyCell,
} from "@/utils/warehouseMapShelfDraw";
import { formatDisplayBin } from "@/utils/locationBin";
import {
  isWaveStationLocationTypeParam,
  resolveWaveStationKind,
} from "@/utils/waveStationKind";

const LINE_COLOR = "#d0d0d0";
const WAYPOINT_COLOR = "#cbd5e1";
const OTHER_SHELF_COLOR = "#C4D9DA";
/** Ô focus nhưng không interactive — mờ, không chọn được */
const DIMMED_CELL_FILL = "rgba(88, 116, 119, 0.35)";
const DIMMED_CELL_STROKE = "rgba(88, 116, 119, 0.4)";
const BUFFER_EMPTY = SHELF_TECH.emptyFill;
const BUFFER_EMPTY_STROKE = SHELF_TECH.emptyStroke;
const SELECTED_STROKE = "#5EEAD4";
const SELECTED_INNER_STROKE = "#D7ECEB";
const SELECTED_GLOW = "rgba(58, 175, 169, 0.95)";
const DEFAULT_FIT_PADDING = 0.08;
/** World size — đủ lớn để zoom nhẹ là đọc được label trên ô. */
const DEFAULT_BASE_NODE_SIZE = 800;
const DEFAULT_FIT_SCALE_FACTOR = 0.75;
const DEFAULT_SHELF_SIZE_FACTOR = 0.7;
const DEFAULT_SHELF_FILL_RATIO = 0.42;
const LABEL_MIN_SCREEN_PX = 16;

function drawBufferCellByStatus(
  ctx: CanvasRenderingContext2D,
  status: string,
  x: number,
  y: number,
  half: number,
  invScale: number,
  highlightOutbound = false,
) {
  if (highlightOutbound) {
    drawOutboundStationCellByStatus(ctx, status, x, y, half, invScale);
    return;
  }
  if (status === "taking") {
    drawTechTakingCell(ctx, x, y, half, invScale);
    return;
  }
  if (status !== "empty") {
    drawTechOccupiedCell(ctx, x, y, half, invScale);
    return;
  }
  ctx.fillStyle = BUFFER_EMPTY;
  ctx.fillRect(x - half, y - half, half * 2, half * 2);
  ctx.strokeStyle = BUFFER_EMPTY_STROKE;
  ctx.lineWidth = invScale * 1.0;
  ctx.strokeRect(x - half, y - half, half * 2, half * 2);
}

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

  ctx.fillStyle = 'rgba(245, 158, 11, 0.35)'; // Amber 500 with 35% opacity
  ctx.fill();

  ctx.shadowColor = '#2dd4bf'; // Teal 400 glow
  ctx.shadowBlur = 10 * invScale;
  ctx.strokeStyle = '#5eead4'; // Teal 300
  ctx.lineWidth = 3 * invScale;
  ctx.stroke();
  ctx.restore();
}

/**
 * @deprecated Dùng OPERATOR_WAVE_MAP_TUNING — map xuất/chia chọn giữ layout fetch.
 */
export const WAVE_MAP_CANVAS_TUNING = OPERATOR_WAVE_MAP_TUNING;

export type BufferMapCanvasTuning = {
  /** Hệ số zoom sau khi fit (mặc định 0.75). Cao hơn → ô to hơn trên màn hình. */
  fitScaleFactor?: number;
  /** Padding khi fit (mặc định 0.08). */
  fitPaddingRatio?: number;
  /** Kích thước world-space cơ sở của ô (mặc định 800). */
  baseNodeSize?: number;
  shelfSizeFactor?: number;
  shelfFillRatio?: number;
  /**
   * Fit camera quanh các điểm focus (API points), bỏ shelf/line phụ trong crop.
   */
  fitToFocusPoints?: boolean;
  /** Chỉ lấy khoảng cách giữa các ô focus để tính size. */
  spacingFromFocusOnly?: boolean;
  /** Fit lưới ảo screen-space — ô đồng kích thước, vừa khung (operator). */
  uniformGridFit?: boolean;
  /** Ẩn shelf không thuộc danh sách focus (points API). */
  hideNonFocusShelves?: boolean;
  /** Khe giữa các ô trên lưới ảo (px). */
  cellGapPx?: number;
  /** Khi viewport lớn hơn kích thước ban đầu, zoom cả cụm lưới theo tâm. */
  responsiveZoomOnGrow?: boolean;
  /** Giới hạn zoom responsive để không crop quá nhiều. */
  responsiveZoomMax?: number;
  /** Độ nhạy zoom 0..1; thấp hơn giúp chuyển kích thước êm hơn. */
  responsiveZoomStrength?: number;
  /** Hệ số phóng chữ label trong ô (chỉ map operator). */
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

type Props = {
  zoneId: number;
  /** Loại location để crop map. Có thể nhiều type: sorting_station,outbound_station */
  locationType?: MapLocationTypeParam;
  /** Subset location ids (vd. stations của 1 sorting wave). */
  locationIds?: number[];
  className?: string;
  selectedLocationCode?: string | null;
  /** Multi-select highlight (ưu tiên hơn selectedLocationCode nếu có). */
  selectedLocationCodes?: string[];
  onBufferCellClick?: (payload: BufferCellClickPayload) => void;
  onBufferCellDoubleClick?: (payload: BufferCellClickPayload) => void;
  onCanvasBackgroundClick?: () => void;
  /** Tuỳ chỉnh zoom/ô — không truyền thì giống inbound. */
  tuning?: BufferMapCanvasTuning;
  /**
   * Label overlay theo mã ô (vd. biển số xe / tên KH trên sorting station).
   * Khi có key → vẽ text này thay stock label của ô đó.
   */
  overlayLabelByCode?: Record<string, string>;
  /** Ghi đè status ô (vd. mô phỏng outbound station có hàng). */
  statusOverrideByCode?: Record<string, string>;
  /**
   * Chỉ các mã location này chọn được / nổi bật.
   * Ô focus còn lại vẽ mờ + bỏ qua click (ngăn chọn vùng thừa).
   */
  interactiveCodes?: string[] | Set<string>;
};

function boundsFromNodes(
  nodes: Array<{ x: number; y: number }>,
  padRatio = 0.22,
  minPad = 500,
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
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = Math.max(span * padRatio, minPad);
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

export default function InboundBufferMapCanvas({
  zoneId,
  locationType = "inbound_buffer",
  locationIds,
  className,
  selectedLocationCode = null,
  selectedLocationCodes,
  onBufferCellClick,
  onBufferCellDoubleClick,
  onCanvasBackgroundClick,
  tuning,
  overlayLabelByCode,
  statusOverrideByCode,
  interactiveCodes,
}: Props) {
  const emptyFilter = Array.isArray(locationIds) && locationIds.length === 0;
  const {
    data: view,
    isLoading,
    isError,
  } = useInboundBufferMapView(zoneId, locationType, locationIds);
  const { labelByCode } = useLocationStockLabels(zoneId);
  const { locationByCode } = useLocationByCodeMap(zoneId);
  const mapData = view?.map;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapDataRef = useRef<MapData | null>(null);
  const nodesRef = useRef<NodeInfo[]>([]);
  const focusNodesRef = useRef<NodeInfo[]>([]);
  const contentBoundsRef = useRef<MapContentBounds | null>(null);
  const minShelfSpacingRef = useRef(Number.POSITIVE_INFINITY);
  const shelfHalfRef = useRef(400);
  const virtualLayoutRef = useRef<OperatorVirtualGridLayout | null>(null);
  const uniformGridBaselineRef = useRef<{
    width: number;
    height: number;
  } | null>(null);
  const uniformGridBaselineLayoutRef =
    useRef<OperatorVirtualGridLayout | null>(null);
  const bufferCodesRef = useRef<Set<string>>(new Set());
  const bufferStatusRef = useRef<Record<string, string>>({});
  const labelByCodeRef = useRef<Map<string, LocationStockLabel>>(new Map());
  const locationByCodeRef = useRef<Record<string, WarehouseLocation>>({});
  const overlayLabelByCodeRef = useRef<Record<string, string>>({});
  const outboundHighlightByCodeRef = useRef<Record<string, true>>({});
  const waveStationMapRef = useRef(false);
  const selectedCodesRef = useRef<Set<string>>(new Set());
  const interactiveCodesRef = useRef<Set<string> | null>(null);
  const onClickRef = useRef(onBufferCellClick);
  const onDoubleClickRef = useRef(onBufferCellDoubleClick);
  const onBackgroundClickRef = useRef(onCanvasBackgroundClick);
  const scaleRef = useRef(1);
  const offsetXRef = useRef(0);
  const offsetYRef = useRef(0);
  const tuningRef = useRef({
    fitScaleFactor: DEFAULT_FIT_SCALE_FACTOR,
    fitPaddingRatio: DEFAULT_FIT_PADDING,
    baseNodeSize: DEFAULT_BASE_NODE_SIZE,
    shelfSizeFactor: DEFAULT_SHELF_SIZE_FACTOR,
    shelfFillRatio: DEFAULT_SHELF_FILL_RATIO,
    fitToFocusPoints: false,
    spacingFromFocusOnly: false,
    uniformGridFit: false,
    hideNonFocusShelves: false,
    cellGapPx: 8,
    responsiveZoomOnGrow: false,
    responsiveZoomMax: 1.18,
    responsiveZoomStrength: 0.65,
    labelTextScale: 1,
  });
  const [hasData, setHasData] = useState(false);

  tuningRef.current = {
    fitScaleFactor: tuning?.fitScaleFactor ?? DEFAULT_FIT_SCALE_FACTOR,
    fitPaddingRatio: tuning?.fitPaddingRatio ?? DEFAULT_FIT_PADDING,
    baseNodeSize: tuning?.baseNodeSize ?? DEFAULT_BASE_NODE_SIZE,
    shelfSizeFactor: tuning?.shelfSizeFactor ?? DEFAULT_SHELF_SIZE_FACTOR,
    shelfFillRatio: tuning?.shelfFillRatio ?? DEFAULT_SHELF_FILL_RATIO,
    fitToFocusPoints: tuning?.fitToFocusPoints ?? false,
    spacingFromFocusOnly: tuning?.spacingFromFocusOnly ?? false,
    uniformGridFit: tuning?.uniformGridFit ?? false,
    hideNonFocusShelves: tuning?.hideNonFocusShelves ?? false,
    cellGapPx: tuning?.cellGapPx ?? 8,
    responsiveZoomOnGrow: tuning?.responsiveZoomOnGrow ?? false,
    responsiveZoomMax: tuning?.responsiveZoomMax ?? 1.18,
    responsiveZoomStrength: tuning?.responsiveZoomStrength ?? 0.65,
    labelTextScale: tuning?.labelTextScale ?? 1,
  };

  const bufferCodes = useMemo(
    () => new Set((view?.points ?? []).map((p) => p.location_code)),
    [view],
  );
  const bufferStatus = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of view?.points ?? []) {
      const override = statusOverrideByCode?.[p.location_code];
      map[p.location_code] = override ?? p.status;
    }
    return map;
  }, [view, statusOverrideByCode]);

  const waveStationMap = isWaveStationLocationTypeParam(locationType);
  const outboundHighlightByCode = useMemo(() => {
    if (!waveStationMap) return {};
    const map: Record<string, true> = {};
    for (const point of view?.points ?? []) {
      if (resolveWaveStationKind(point.location_type, point.bin) === "outbound") {
        map[point.location_code] = true;
      }
    }
    return map;
  }, [view, waveStationMap]);

  useEffect(() => {
    onClickRef.current = onBufferCellClick;
  }, [onBufferCellClick]);

  useEffect(() => {
    onDoubleClickRef.current = onBufferCellDoubleClick;
  }, [onBufferCellDoubleClick]);

  useEffect(() => {
    onBackgroundClickRef.current = onCanvasBackgroundClick;
  }, [onCanvasBackgroundClick]);

  const interactiveCodeSet = useMemo(() => {
    if (interactiveCodes == null) return null;
    if (interactiveCodes instanceof Set) return interactiveCodes;
    return new Set(interactiveCodes);
  }, [interactiveCodes]);

  const isInteractiveCode = (code: string) => {
    const allowed = interactiveCodesRef.current;
    if (allowed == null) return true;
    return allowed.has(code);
  };

  const drawDimmedCell = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    half: number,
    invScale: number,
  ) => {
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = DIMMED_CELL_FILL;
    ctx.strokeStyle = DIMMED_CELL_STROKE;
    ctx.lineWidth = invScale * 1.2;
    ctx.fillRect(x - half, y - half, half * 2, half * 2);
    ctx.strokeRect(x - half, y - half, half * 2, half * 2);
    // Chỉ làm mờ — không vẽ dấu X (tránh rối mắt trên board vận hành)
    ctx.restore();
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const data = mapDataRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const opts = tuningRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const codes = bufferCodesRef.current;
    const statuses = bufferStatusRef.current;
    const selectedCodes = selectedCodesRef.current;

    const virtualLayout = virtualLayoutRef.current;
    if (opts.uniformGridFit && virtualLayout) {
      const invScale = 1;

      // Draw Separator Line between BP and CN columns if they exist
      const sortedCells = [...virtualLayout.cells].sort((a, b) => a.screenX - b.screenX);
      const columns: { x: number; isBP: boolean; isCN: boolean }[] = [];
      const threshold = virtualLayout.cells.length > 0 ? virtualLayout.cells[0].screenHalf : 20;

      for (const cell of sortedCells) {
        if (columns.length === 0 || cell.screenX - columns[columns.length - 1].x > threshold) {
          columns.push({ x: cell.screenX, isBP: false, isCN: false });
        }
        const currentCol = columns[columns.length - 1];
        const bin = locationByCodeRef.current[cell.content]?.bin || "";
        if (bin.includes("BP")) currentCol.isBP = true;
        if (bin.includes("CN")) currentCol.isCN = true;
      }

      if (columns.length > 0) {
        const allY = virtualLayout.cells.map(c => c.screenY);
        const minY = Math.min(...allY) - threshold;
        const maxY = Math.max(...allY) + threshold;

        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(100, 116, 139, 0.8)"; // Balanced Slate 500
        ctx.lineWidth = 4;

        for (let i = 0; i < columns.length - 1; i++) {
          const col1 = columns[i];
          const col2 = columns[i + 1];
          if ((col1.isBP && col2.isCN && !col1.isCN && !col2.isBP) ||
            (col1.isCN && col2.isBP && !col1.isBP && !col2.isCN)) {
            const separatorX = (col1.x + col2.x) / 2;
            ctx.moveTo(separatorX, minY);
            ctx.lineTo(separatorX, maxY);
          }
        }
        ctx.stroke();
        ctx.restore();
      }
      for (const cell of virtualLayout.cells) {
        const half = cell.screenHalf;
        const status = statuses[cell.content] ?? "empty";
        const interactive = isInteractiveCode(cell.content);
        const isSelected = interactive && selectedCodes.has(cell.content);
        const highlightOutbound = Boolean(
          waveStationMapRef.current &&
          outboundHighlightByCodeRef.current[cell.content],
        );

        if (!interactive) {
          drawDimmedCell(ctx, cell.screenX, cell.screenY, half, invScale);
          continue;
        }

        drawBufferCellByStatus(
          ctx,
          status,
          cell.screenX,
          cell.screenY,
          half,
          invScale,
          highlightOutbound,
        );

        if (isSelected) {
          drawSelectedHighlight(
            ctx,
            cell.screenX,
            cell.screenY,
            half,
            invScale,
          );
        }

        if (half * 2 >= LABEL_MIN_SCREEN_PX) {
          const overlay = overlayLabelByCodeRef.current[cell.content]?.trim();
          const loc = locationByCodeRef.current[cell.content];
          const displayBin = loc ? formatDisplayBin(loc.bin, loc.location_type) : "";
          const fallbackCode = displayBin || cell.name || cell.content;

          if (overlay) {
            drawStationOverlayLabel(
              ctx,
              cell.screenX,
              cell.screenY,
              half,
              overlay,
              isSelected,
              fallbackCode,
            );
          } else {
            drawShelfStockLabel(
              ctx,
              cell.screenX,
              cell.screenY,
              half,
              labelByCodeRef.current.get(cell.content),
              opts.labelTextScale,
              isSelected,
              highlightOutbound,
              fallbackCode,
            );
          }
        }
      }
      return;
    }

    ctx.save();
    ctx.setTransform(
      scaleRef.current,
      0,
      0,
      scaleRef.current,
      offsetXRef.current,
      offsetYRef.current,
    );

    const invScale = 1 / scaleRef.current;
    ctx.beginPath();
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = invScale * 2;
    for (const lineRow of data.lineArr) {
      const coords = parseLinePath(lineRow, data.lineKeys, data.height);
      if (coords.length < 2) continue;
      ctx.moveTo(coords[0].x, coords[0].y);
      for (let i = 1; i < coords.length; i++) {
        ctx.lineTo(coords[i].x, coords[i].y);
      }
    }
    ctx.stroke();

    const baseSize = opts.baseNodeSize;
    const shelfHalf = opts.uniformGridFit
      ? shelfHalfRef.current
      : computeShelfHalfSize(
        baseSize,
        minShelfSpacingRef.current,
        opts.shelfSizeFactor,
        opts.shelfFillRatio,
      );
    const showLabels = shelfHalf * 2 * scaleRef.current >= LABEL_MIN_SCREEN_PX;

    // Draw Separator Line between BP and CN columns if they exist (standard map view)
    const sortedNodes = [...nodesRef.current].sort((a, b) => a.x - b.x);
    const columns: { x: number; isBP: boolean; isCN: boolean }[] = [];

    for (const node of sortedNodes) {
      if (columns.length === 0 || node.x - columns[columns.length - 1].x > shelfHalf) {
        columns.push({ x: node.x, isBP: false, isCN: false });
      }
      const currentCol = columns[columns.length - 1];
      const bin = locationByCodeRef.current[node.content]?.bin || "";
      if (bin.includes("BP")) currentCol.isBP = true;
      if (bin.includes("CN")) currentCol.isCN = true;
    }

    if (columns.length > 0) {
      const allY = nodesRef.current.map(n => n.y);
      const minY = Math.min(...allY) - shelfHalf;
      const maxY = Math.max(...allY) + shelfHalf;

      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(100, 116, 139, 0.8)"; // Balanced Slate 500
      ctx.lineWidth = 4 * invScale;

      for (let i = 0; i < columns.length - 1; i++) {
        const col1 = columns[i];
        const col2 = columns[i + 1];
        if ((col1.isBP && col2.isCN && !col1.isCN && !col2.isBP) ||
          (col1.isCN && col2.isBP && !col1.isBP && !col2.isCN)) {
          const separatorX = (col1.x + col2.x) / 2;
          ctx.moveTo(separatorX, minY);
          ctx.lineTo(separatorX, maxY);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    for (const node of nodesRef.current) {
      if (node.type === 0) {
        ctx.beginPath();
        ctx.arc(
          node.x,
          node.y,
          Math.min(baseSize * 0.35, shelfHalf * 0.35),
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = WAYPOINT_COLOR;
        ctx.fill();
        continue;
      }
      if (node.type !== 1) continue;

      const isBuffer = codes.has(node.content);
      if (opts.hideNonFocusShelves && !isBuffer) continue;

      const half = isBuffer ? shelfHalf : shelfHalf * 0.65;
      const interactive = isBuffer && isInteractiveCode(node.content);
      const isSelected = interactive && selectedCodes.has(node.content);
      const highlightOutbound = Boolean(
        waveStationMapRef.current &&
        outboundHighlightByCodeRef.current[node.content],
      );

      if (isBuffer && !interactive) {
        drawDimmedCell(ctx, node.x, node.y, half, invScale);
      } else if (isBuffer) {
        const status = statuses[node.content] ?? "empty";
        drawBufferCellByStatus(
          ctx,
          status,
          node.x,
          node.y,
          half,
          invScale,
          highlightOutbound,
        );
      } else {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = OTHER_SHELF_COLOR;
        ctx.fillRect(node.x - half, node.y - half, half * 2, half * 2);
        ctx.restore();
      }

      if (isSelected) {
        drawSelectedHighlight(ctx, node.x, node.y, half, invScale);
      }

      if (showLabels && interactive) {
        let overlay = overlayLabelByCodeRef.current[node.content]?.trim();
        const loc = locationByCodeRef.current[node.content];
        const displayBin = loc ? formatDisplayBin(loc.bin, loc.location_type) : "";
        let fallbackCode = displayBin || node.name || node.content;

        if (overlay) {
          drawStationOverlayLabel(
            ctx,
            node.x,
            node.y,
            half,
            overlay,
            isSelected,
            fallbackCode,
          );
        } else {
          let slbl = labelByCodeRef.current.get(node.content);
          drawShelfStockLabel(
            ctx,
            node.x,
            node.y,
            half,
            slbl,
            opts.labelTextScale,
            isSelected,
            highlightOutbound,
            fallbackCode,
          );
        }
      }
    }
    ctx.restore();
  }, []);

  const fitToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const bounds = contentBoundsRef.current;
    if (!canvas || !bounds) return;
    const opts = tuningRef.current;

    if (opts.uniformGridFit && focusNodesRef.current.length > 0) {
      const baseLayout = computeOperatorVirtualGridLayout(
        focusNodesRef.current.map((node) => ({
          x: node.x,
          y: node.y,
          content: node.content,
        })),
        {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          fitPaddingRatio: opts.fitPaddingRatio,
          cellGapPx: opts.cellGapPx,
          cellFillRatio: opts.shelfFillRatio,
        },
      );
      let responsiveZoom = 1;
      if (opts.responsiveZoomOnGrow) {
        const currentSize = {
          width: canvas.width,
          height: canvas.height,
        };
        const baseline = uniformGridBaselineRef.current;
        const hasUsableSize =
          currentSize.width >= 80 && currentSize.height >= 80;
        if (hasUsableSize && (
          baseline == null ||
          currentSize.width < baseline.width ||
          currentSize.height < baseline.height
        )) {
          uniformGridBaselineRef.current = currentSize;
          uniformGridBaselineLayoutRef.current = baseLayout;
        } else if (baseline && hasUsableSize) {
          const widthRatio = currentSize.width / Math.max(baseline.width, 1);
          const heightRatio =
            currentSize.height / Math.max(baseline.height, 1);
          // Căn theo cả hai chiều: căn bậc hai tỷ lệ diện tích cho ra
          // hệ số zoom tuyến tính, tránh height tăng làm zoom vọt quá lớn.
          const areaLinearRatio = Math.sqrt(widthRatio * heightRatio);
          const strength = Math.min(
            Math.max(opts.responsiveZoomStrength, 0),
            1,
          );
          const easedZoom = 1 + (areaLinearRatio - 1) * strength;
          responsiveZoom = Math.min(
            Math.max(easedZoom, 1),
            Math.max(opts.responsiveZoomMax, 1),
          );
        }
      }

      if (baseLayout && responsiveZoom > 1) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const spacingLayout =
          uniformGridBaselineLayoutRef.current ?? baseLayout;
        const columnGapPx = spacingLayout.columnGapPx;
        const rowGapPx = spacingLayout.rowGapPx;
        const baseCellSize = (baseLayout.cells[0]?.screenHalf ?? 0) * 2;
        const cellSize = baseCellSize * responsiveZoom;
        const screenHalf = cellSize / 2;
        const totalWidth =
          baseLayout.cols * cellSize +
          Math.max(baseLayout.cols - 1, 0) * columnGapPx;
        const totalHeight =
          baseLayout.rows * cellSize +
          Math.max(baseLayout.rows - 1, 0) * rowGapPx;
        const startX = centerX - totalWidth / 2 + screenHalf;
        const startY = centerY - totalHeight / 2 + screenHalf;
        virtualLayoutRef.current = {
          ...baseLayout,
          cells: baseLayout.cells.map((cell) => ({
            ...cell,
            screenX:
              startX +
              cell.col * (cellSize + columnGapPx),
            screenY:
              startY + cell.row * (cellSize + rowGapPx),
            screenHalf,
          })),
        };
      } else {
        virtualLayoutRef.current = baseLayout;
      }
      scaleRef.current = 1;
      offsetXRef.current = 0;
      offsetYRef.current = 0;
      shelfHalfRef.current =
        virtualLayoutRef.current?.cells[0]?.screenHalf ?? 40;
      return;
    }

    virtualLayoutRef.current = null;

    const pad = Math.min(canvas.width, canvas.height) * opts.fitPaddingRatio;
    const availW = canvas.width - pad * 2;
    const availH = canvas.height - pad * 2;
    const scale = Math.min(availW / bounds.width, availH / bounds.height);
    const lockedScale = scale * opts.fitScaleFactor;
    scaleRef.current = lockedScale;
    shelfHalfRef.current = computeShelfHalfSize(
      opts.baseNodeSize,
      minShelfSpacingRef.current,
      opts.shelfSizeFactor,
      opts.shelfFillRatio,
    );
    offsetXRef.current =
      pad +
      (availW - bounds.width * lockedScale) / 2 -
      bounds.minX * lockedScale;
    offsetYRef.current =
      pad +
      (availH - bounds.height * lockedScale) / 2 -
      bounds.minY * lockedScale;
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const { clientWidth, clientHeight } = container;
    canvas.width = Math.max(clientWidth, 1);
    canvas.height = Math.max(clientHeight, 1);
    fitToCanvas();
    draw();
  }, [draw, fitToCanvas]);

  useEffect(() => {
    bufferCodesRef.current = bufferCodes;
    bufferStatusRef.current = bufferStatus;
    outboundHighlightByCodeRef.current = outboundHighlightByCode;
    waveStationMapRef.current = waveStationMap;
    draw();
  }, [bufferCodes, bufferStatus, outboundHighlightByCode, waveStationMap, draw]);

  useEffect(() => {
    labelByCodeRef.current = labelByCode;
  }, [labelByCode]);

  useEffect(() => {
    locationByCodeRef.current = locationByCode;
  }, [locationByCode]);

  useEffect(() => {
    overlayLabelByCodeRef.current = overlayLabelByCode ?? {};
    draw();
  }, [overlayLabelByCode, draw]);

  useEffect(() => {
    interactiveCodesRef.current = interactiveCodeSet;
    draw();
  }, [interactiveCodeSet, draw]);

  useEffect(() => {
    if (selectedLocationCodes && selectedLocationCodes.length > 0) {
      selectedCodesRef.current = new Set(selectedLocationCodes);
    } else if (selectedLocationCode) {
      selectedCodesRef.current = new Set([selectedLocationCode]);
    } else {
      selectedCodesRef.current = new Set();
    }
    draw();
  }, [selectedLocationCode, selectedLocationCodes, draw]);

  useEffect(() => {
    if (!mapData || !isRenderableMapData(mapData)) {
      mapDataRef.current = null;
      nodesRef.current = [];
      setHasData(false);
      return;
    }
    const opts = tuningRef.current;
    mapDataRef.current = mapData;
    let nodes = parseMapNodes(mapData);

    nodesRef.current = nodes;

    const focusNodes = nodes.filter(
      (node) => node.type === 1 && bufferCodes.has(node.content),
    );
    focusNodesRef.current = focusNodes;
    const spacingSource =
      opts.spacingFromFocusOnly && focusNodes.length >= 2
        ? focusNodes
        : nodes.filter((node) => node.type === 1);
    minShelfSpacingRef.current = computeMinShelfSpacing(
      spacingSource.length > 0 ? spacingSource : nodes,
    );

    contentBoundsRef.current =
      opts.fitToFocusPoints && focusNodes.length > 0
        ? boundsFromNodes(focusNodes)
        : computeMapContentBounds(mapData);

    setHasData(true);
    resizeCanvas();
  }, [mapData, bufferCodes, resizeCanvas, tuning]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(container);
    resizeCanvas();
    return () => observer.disconnect();
  }, [resizeCanvas]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resolveClickPayload = (
      e: MouseEvent,
    ): BufferCellClickPayload | null => {
      if (!mapDataRef.current) return null;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const virtualLayout = virtualLayoutRef.current;
      if (tuningRef.current.uniformGridFit && virtualLayout) {
        for (const cell of virtualLayout.cells) {
          if (
            Math.abs(sx - cell.screenX) <= cell.screenHalf &&
            Math.abs(sy - cell.screenY) <= cell.screenHalf
          ) {
            if (!isInteractiveCode(cell.content)) return null;
            return {
              locationCode: cell.content,
              x: cell.screenX,
              y: cell.screenY,
              gridRow: cell.row,
              rowLocationCodes: virtualLayout.cells
                .filter(
                  (candidate) =>
                    candidate.row === cell.row &&
                    isInteractiveCode(candidate.content),
                )
                .sort((a, b) => a.col - b.col)
                .map((candidate) => candidate.content),
              gridColumn: cell.col,
              columnLocationCodes: virtualLayout.cells
                .filter(
                  (candidate) =>
                    candidate.col === cell.col &&
                    isInteractiveCode(candidate.content),
                )
                .sort((a, b) => a.row - b.row)
                .map((candidate) => candidate.content),
            };
          }
        }
        return null;
      }

      const wx = (sx - offsetXRef.current) / scaleRef.current;
      const wy = (sy - offsetYRef.current) / scaleRef.current;
      const shelfHalf = tuningRef.current.uniformGridFit
        ? shelfHalfRef.current
        : computeShelfHalfSize(
          tuningRef.current.baseNodeSize,
          minShelfSpacingRef.current,
          tuningRef.current.shelfSizeFactor,
          tuningRef.current.shelfFillRatio,
        );
      const codes = bufferCodesRef.current;

      // Hit-test chặt hơn (0.55× half) — tránh chọn nhầm ô kề khi ô gần nhau
      const hitRadius = shelfHalf * 0.55;
      let closest: NodeInfo | null = null;
      let closestDist = Infinity;
      for (const node of nodesRef.current) {
        if (node.type !== 1 || !codes.has(node.content)) continue;
        if (!isInteractiveCode(node.content)) continue;
        const dist = Math.hypot(wx - node.x, wy - node.y);
        if (dist <= hitRadius && dist < closestDist) {
          closestDist = dist;
          closest = node;
        }
      }
      if (!closest) return null;
      return {
        locationCode: closest.content,
        x: closest.x,
        y: closest.y,
      };
    };

    const onClick = (e: MouseEvent) => {
      const payload = resolveClickPayload(e);
      if (payload) {
        onClickRef.current?.(payload);
      } else {
        onBackgroundClickRef.current?.();
      }
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
  }, [
    onBufferCellClick,
    onBufferCellDoubleClick,
    onCanvasBackgroundClick,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative min-h-0 w-full bg-canvas ${className ?? ""}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {emptyFilter && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 px-4 text-center text-sm text-slate-500">
          Wave chưa gán điểm {locationType}
        </div>
      )}
      {!emptyFilter && isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-slate-500">
          Đang tải bản đồ {locationType}...
        </div>
      )}
      {!emptyFilter && !isLoading && isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70 px-4 text-center text-sm text-slate-500">
          Không tải được bản đồ {locationType} (thiếu map active hoặc điểm tương
          ứng)
        </div>
      )}
      {!emptyFilter &&
        !isLoading &&
        !isError &&
        hasData &&
        bufferCodes.size === 0 && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-slate-500 shadow-sm">
            Chưa có điểm {locationType} trong zone
          </div>
        )}
    </div>
  );
}
