import { QrCode, QrSegment } from "@rc-component/qrcode/es/libs/qrcodegen";
import {
  DEFAULT_LEVEL,
  ERROR_LEVEL_MAP,
} from "@rc-component/qrcode/es/utils";

export type QrCodePrintLabel = {
  code: string;
  sku: string;
  name: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function createQrDataUrl(value: string, size = 180): string {
  const qr = QrCode.encodeSegments(
    QrSegment.makeSegments(value),
    ERROR_LEVEL_MAP[DEFAULT_LEVEL],
    1,
    undefined,
    undefined,
    true,
  );
  const modules = qr.getModules();
  const cells = modules.length;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Không thể khởi tạo canvas để tạo mã QR");
  }

  const cellSize = size / cells;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      if (modules[y][x]) {
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }
  return canvas.toDataURL("image/png");
}

function buildPrintHtml(labels: QrCodePrintLabel[]): string {
  const labelHtml = labels
    .map((label) => {
      const qrDataUrl = createQrDataUrl(label.code);
      const code = escapeHtml(label.code);
      const sku = escapeHtml(label.sku);
      const name = escapeHtml(label.name);
      return `
        <div class="label">
          <img src="${qrDataUrl}" alt="${code}" />
          <div class="code">${code}</div>
          <div class="sku">${sku}</div>
          <div class="name">${name}</div>
        </div>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>In mã QR</title>
    <style>
      @page { margin: 12mm; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        color: #111827;
      }
      .sheet {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
      }
      .label {
        width: 58mm;
        min-height: 40mm;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        padding: 8px;
        box-sizing: border-box;
        text-align: center;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .label img {
        width: 36mm;
        height: 36mm;
        object-fit: contain;
      }
      .code {
        margin-top: 6px;
        font-size: 12px;
        font-weight: 700;
        word-break: break-all;
      }
      .sku {
        margin-top: 4px;
        font-size: 11px;
        font-weight: 600;
      }
      .name {
        margin-top: 2px;
        font-size: 10px;
        color: #4b5563;
      }
    </style>
  </head>
  <body>
    <div class="sheet">${labelHtml}</div>
  </body>
</html>`;
}

export function printQrCodeLabels(labels: QrCodePrintLabel[]): boolean {
  if (labels.length === 0) return false;

  const html = buildPrintHtml(labels);
  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "style",
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;",
  );
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;
  const doc = printWindow?.document;
  if (!printWindow || !doc) {
    iframe.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => iframe.remove(), 1000);
  }, 300);

  return true;
}
