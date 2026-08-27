const IMAGE_WAIT_TIMEOUT_MS = 20_000;
const CLEANUP_FALLBACK_MS = 60_000;

function waitForImages(doc: Document, timeoutMs = IMAGE_WAIT_TIMEOUT_MS): Promise<void> {
  const images = Array.from(doc.images);
  if (images.length === 0) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);

    void Promise.all(
      images.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();

        return new Promise<void>((imgDone) => {
          const onDone = () => imgDone();
          img.addEventListener("load", onDone, { once: true });
          img.addEventListener("error", onDone, { once: true });
          if (typeof img.decode === "function") {
            void img.decode().then(onDone).catch(onDone);
          }
        });
      }),
    ).then(finish);
  });
}

/**
 * Opens system print dialog for Bacviet / location QR HTML.
 * Waits for remote QR <img> assets to load before calling print().
 */
export async function printBacvietHtml(html: string): Promise<boolean> {
  const iframe = document.createElement("iframe");
  // Real off-screen size: zero-size iframes often delay/skip image loads.
  iframe.setAttribute(
    "style",
    "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;",
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

  // Let inline scripts (BacvietPrint.init) paint <img> nodes first.
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
  await waitForImages(doc);

  const cleanup = () => {
    iframe.remove();
  };
  printWindow.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, CLEANUP_FALLBACK_MS);

  printWindow.focus();
  printWindow.print();
  return true;
}
