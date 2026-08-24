import jsQR from "jsqr";

/** Isolated jsQR helpers. Delete this folder to remove QR scanning. */

function read(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || canvas.width < 8 || canvas.height < 8) return null;
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data, width, height, { inversionAttempts: "attemptBoth" })?.data?.trim() || null;
}

function paint(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  targetW: number,
  pad: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scale = targetW / sw;
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, pad, pad, w, h);
  return canvas;
}

function decodeSource(source: CanvasImageSource, sw: number, sh: number): string | null {
  if (!sw || !sh) return null;
  const widths = [...new Set([Math.min(sw, 1600), 1200, 800, 480])].filter((w) => w >= 80);
  for (const w of widths) {
    const text = read(paint(source, sw, sh, w, 24));
    if (text) return text;
  }

  const full = paint(source, sw, sh, Math.min(sw, 1400), 0);
  const { width: fw, height: fh } = full;
  const boxes = [
    [0, 0],
    [fw / 2, 0],
    [0, fh / 2],
    [fw / 2, fh / 2],
  ];
  for (const [x, y] of boxes) {
    const cw = Math.ceil(fw / 2);
    const ch = Math.ceil(fh / 2);
    const crop = document.createElement("canvas");
    crop.width = cw + 24;
    crop.height = ch + 24;
    const ctx = crop.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, crop.width, crop.height);
    ctx.drawImage(full, Math.floor(x), Math.floor(y), cw, ch, 12, 12, cw, ch);
    const text = read(crop);
    if (text) return text;
  }
  return null;
}

export function decodeQrFromVideo(video: HTMLVideoElement): string | null {
  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) return null;
  return read(paint(video, w, h, Math.min(w, 720), 16));
}

export async function decodeQrFromFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Không đọc được ảnh"));
      el.src = url;
    });
    return decodeSource(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}
