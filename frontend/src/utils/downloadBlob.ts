import type { AxiosResponse } from "axios";

function parseFilenameFromContentDisposition(
  disposition: string | undefined,
  fallback: string,
): string {
  if (!disposition) return fallback;

  const utf8Match = /filename\*=UTF-8''([^;\n]+)/i.exec(disposition);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].trim());
  }

  const quotedMatch = /filename="([^"]+)"/i.exec(disposition);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = /filename=([^;\n]+)/i.exec(disposition);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim().replace(/^"|"$/g, "");
  }

  return fallback;
}

function sanitizeDownloadFilename(filename: string, fallback: string): string {
  const raw = (filename || fallback).trim() || fallback;
  const base = raw.replace(/[/\\?%*:|"<>]/g, "_").replace(/\.tmp$/i, "");
  if (!base) return fallback;
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
  return `${base}.pdf`;
}

function blobMimeForDownload(filename: string, blob: Blob): Blob {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return blob.type === "application/pdf"
      ? blob
      : new Blob([blob], { type: "application/pdf" });
  }
  if (lower.endsWith(".xlsx")) {
    return blob.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ? blob
      : new Blob([blob], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
  }
  return blob;
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const safeName = sanitizeDownloadFilename(filename, "download.pdf");
  const typedBlob = blobMimeForDownload(safeName, blob);

  const url = URL.createObjectURL(typedBlob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke quá sớm (Edge/Chrome) → thêm file .tmp / tải lỗi song song file PDF.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadBlobFromResponse(
  blob: Blob,
  disposition: string | undefined,
  fallbackFilename: string,
) {
  const filename = parseFilenameFromContentDisposition(
    disposition,
    fallbackFilename,
  );
  triggerBlobDownload(blob, filename);
}

async function blobLooksLikePdf(blob: Blob): Promise<boolean> {
  if (blob.size < 4) return false;
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return (
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46
  );
}

/** Chỉ trigger tải xuống khi body là PDF thật (tránh blob lỗi / tmp). */
export async function downloadPdfFromAxiosResponse(
  response: Pick<AxiosResponse<Blob>, "data" | "headers">,
  fallbackFilename: string,
): Promise<void> {
  const blob = response.data;
  if (!(await blobLooksLikePdf(blob))) {
    const text = await blob.text();
    try {
      const json = JSON.parse(text) as { detail?: string };
      throw new Error(json.detail ?? text);
    } catch (err) {
      if (err instanceof Error && err.message !== text) throw err;
      throw new Error(text || "Không tải được PDF");
    }
  }
  const disposition = response.headers["content-disposition"] as
    | string
    | undefined;
  downloadBlobFromResponse(blob, disposition, fallbackFilename);
}
