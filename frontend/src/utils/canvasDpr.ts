/** Giới hạn DPR để canvas lớn trên màn 4K không tốn quá nhiều bộ nhớ. */
export const MAX_CANVAS_DPR = 2;

export type CanvasCssSize = {
  width: number;
  height: number;
  dpr: number;
};

export function getCanvasDpr(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(Math.max(dpr, 1), MAX_CANVAS_DPR);
}

/**
 * Đặt bộ đệm canvas = kích thước layout (CSS px, chưa tính transform của stage) × DPR.
 * Dùng clientWidth/clientHeight để không bị ảnh hưởng bởi CSS `transform: scale()`.
 */
export function resizeCanvasToContainer(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
): CanvasCssSize {
  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);
  const dpr = getCanvasDpr();
  const bufferW = Math.round(width * dpr);
  const bufferH = Math.round(height * dpr);
  if (canvas.width !== bufferW) canvas.width = bufferW;
  if (canvas.height !== bufferH) canvas.height = bufferH;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return { width, height, dpr };
}

/** Xóa toàn bộ bộ đệm canvas (bỏ qua transform hiện tại). */
export function clearCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

/** Transform world → device px cho camera (scale, offset tính theo CSS px). */
export function applyCameraTransform(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  scale: number,
  offsetX: number,
  offsetY: number,
) {
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
}

/** Transform để vẽ trực tiếp theo CSS px (chữ, overlay màn hình). */
export function applyScreenTransform(ctx: CanvasRenderingContext2D, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/** Tọa độ client (sự kiện chuột) → CSS px của canvas, kể cả khi stage bị scale bằng CSS. */
export function clientToCanvasCss(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  cssSize: Pick<CanvasCssSize, 'width' | 'height'>,
): { x: number; y: number; ratioX: number; ratioY: number } {
  const rect = canvas.getBoundingClientRect();
  const ratioX = rect.width > 0 ? cssSize.width / rect.width : 1;
  const ratioY = rect.height > 0 ? cssSize.height / rect.height : 1;
  return {
    x: (clientX - rect.left) * ratioX,
    y: (clientY - rect.top) * ratioY,
    ratioX,
    ratioY,
  };
}
