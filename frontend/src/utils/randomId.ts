/** Web Crypto thật — tránh crypto polyfill của Node (thiếu randomUUID). */
function getBrowserCrypto(): Crypto | undefined {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    return window.crypto;
  }
  const globalCrypto = globalThis.crypto;
  if (globalCrypto?.getRandomValues) {
    return globalCrypto;
  }
  return undefined;
}

/** Sinh chuỗi hex ngẫu nhiên, dùng được cả HTTP và khi có crypto polyfill. */
export function randomHex(length: number): string {
  const webCrypto = getBrowserCrypto();
  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID().replace(/-/g, '').slice(0, length);
  }

  const byteCount = Math.ceil(length / 2);
  const bytes = new Uint8Array(byteCount);
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteCount; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}
