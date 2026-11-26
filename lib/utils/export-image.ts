import { toCanvas, toPng } from 'html-to-image';

export interface ExportContainerOptions {
  width?: number;
  backgroundColor?: string;
  fontEmbedUrl?: string;
  beforeCapture?: (clone: HTMLElement) => void;
  filter?: (node: HTMLElement) => boolean;
}

const fontEmbedCache = new Map<string, string>();
// Cache resized base64 data URLs across exports keyed by `${src}::${bucketPx}`
const resizedImageCache = new Map<string, string>();

/**
 * Fetches a Google Fonts CSS stylesheet and inlines non-vietnamese woff2 font files as data URLs.
 * Cached in-memory so subsequent exports don't refetch fonts and never read cross-origin styleSheets.
 */
async function buildFontEmbedCss(fontCssUrl: string): Promise<string> {
  const cached = fontEmbedCache.get(fontCssUrl);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(fontCssUrl, { mode: 'cors' });
    if (!res.ok) return '';
    const cssText = await res.text();
    const faceBlocks = cssText.match(/@font-face\s*\{[^}]+\}/g) || [];
    const subsetBlocks = faceBlocks.filter((block) => !block.toLowerCase().includes('vietnamese'));
    const fontUrlMap = new Map<string, string>();

    await Promise.all(
      subsetBlocks.flatMap((block) =>
        Array.from(block.matchAll(/url\((https?:\/\/[^)]+)\)/g)).map(async (match) => {
          const url = match[1].replace(/["']/g, '');
          if (fontUrlMap.has(url)) return;
          fontUrlMap.set(url, url);
          try {
            const fontRes = await fetch(url, { mode: 'cors' });
            if (fontRes.ok) {
              const dataUrl = await blobToDataUrl(await fontRes.blob());
              if (dataUrl) fontUrlMap.set(url, dataUrl);
            }
          } catch {
            // Keep original URL fallback if single subset fetch fails
          }
        })
      )
    );

    const embedded = subsetBlocks
      .map((block) =>
        block.replace(/url\((https?:\/\/[^)]+)\)/g, (_full, rawUrl) => {
          const clean = rawUrl.replace(/["']/g, '');
          return `url(${fontUrlMap.get(clean) || clean})`;
        })
      )
      .join('\n');

    if (embedded) fontEmbedCache.set(fontCssUrl, embedded);
    return embedded;
  } catch {
    return '';
  }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1] || '');
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Forces mobile browser engines (iOS WebKit, Mobile Chrome) to decode an image into GPU memory.
 */
async function forceDecodeImage(img: HTMLImageElement): Promise<void> {
  try {
    if ('decode' in img && typeof img.decode === 'function') {
      await img.decode();
    } else {
      if (img.complete) return;
      await new Promise<void>((resolve) => {
        const onDone = () => resolve();
        img.addEventListener('load', onDone, { once: true });
        img.addEventListener('error', onDone, { once: true });
        setTimeout(onDone, 1000);
      });
    }
  } catch {
    // Ignore decode error for broken images
  }
}

/**
 * Limits concurrent serverless proxy calls so mobile 4G networks don't saturate connections.
 */
function createConcurrencyLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      const next = queue.shift();
      if (next) next();
    }
  };
}

const limitProxyFetch = createConcurrencyLimiter(4);

/**
 * Downscales an image Blob on an offscreen canvas so SVG foreignObject stays compact
 * (huge raw logos frequently get dropped or fail to decode on mobile browsers).
 */
async function blobToSizedDataUrl(blob: Blob, maxDimPx: number): Promise<string | null> {
  if (!blob || blob.size === 0) return null;
  if (blob.type === 'image/svg+xml') {
    return blobToDataUrl(blob);
  }

  const objUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Image decode failed'));
      img.src = objUrl;
    });
    if ('decode' in img && typeof img.decode === 'function') {
      try {
        await img.decode();
      } catch {
        // Ignore decode warning if image already loaded
      }
    }

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return await blobToDataUrl(blob);

    // Preserve PNG/JPEG if already compact cleanly under budget; convert WebP/AVIF via canvas for SVG compatibility
    const isUniversalMime = blob.type === 'image/png' || blob.type === 'image/jpeg';
    if (isUniversalMime && Math.max(nw, nh) <= maxDimPx && blob.size <= 160 * 1024) {
      return await blobToDataUrl(blob);
    }

    const scale = Math.min(1, maxDimPx / Math.max(nw, nh));
    const tw = Math.max(1, Math.round(nw * scale));
    const th = Math.max(1, Math.round(nh * scale));

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return await blobToDataUrl(blob);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, tw, th);
    return canvas.toDataURL('image/png');
  } catch {
    return await blobToDataUrl(blob);
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

function liveImgToSizedDataUrl(liveImg: HTMLImageElement, maxDimPx: number): string | null {
  if (!liveImg || !liveImg.complete || !liveImg.naturalWidth || !liveImg.naturalHeight) {
    return null;
  }
  try {
    const nw = liveImg.naturalWidth;
    const nh = liveImg.naturalHeight;
    const scale = Math.min(1, maxDimPx / Math.max(nw, nh));
    const tw = Math.max(1, Math.round(nw * scale));
    const th = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(liveImg, 0, 0, tw, th);
    return canvas.toDataURL('image/png');
  } catch {
    return null; // Tainted canvas -> fall back to fetch/proxy
  }
}

async function fetchBlobWithRetry(url: string, init?: RequestInit, retries = 1, timeoutMs = 8000): Promise<Blob | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, controller ? { ...init, signal: controller.signal } : init);
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 0) return blob;
      }
    } catch {
      // Retry on transient mobile network drop or timeout
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return null;
}

/**
 * Fetches an image src and returns a compact Base64 data URL.
 * Order: cache -> same-origin/live canvas -> direct CORS CDN -> bounded proxy with retry.
 */
async function srcToDataUrl(
  src: string,
  liveImg?: HTMLImageElement,
  maxDimPx: number = 640
): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:')) return src;

  const bucketPx = maxDimPx <= 280 ? 280 : maxDimPx <= 640 ? 640 : 1600;
  const cacheKey = `${src}::${bucketPx}`;
  const cached = resizedImageCache.get(cacheKey);
  if (cached) return cached;

  let result: string | null = null;

  // 1. Relative / same-origin asset (fetch directly from browser cache, resize to target)
  if (src.startsWith('/') || (typeof window !== 'undefined' && src.startsWith(window.location.origin))) {
    const blob = await fetchBlobWithRetry(src, { cache: 'force-cache' }, 1);
    if (blob) result = await blobToSizedDataUrl(blob, bucketPx);
  }

  // 2. Live DOM canvas draw if same-origin or already CORS-decoded (zero network overhead)
  if (!result && liveImg) {
    result = liveImgToSizedDataUrl(liveImg, bucketPx);
  }

  // 3. Direct CORS fetch for CDN images (ImageKit etc. allow CORS) — bypasses Vercel proxy bottleneck
  if (!result && (src.startsWith('http://') || src.startsWith('https://'))) {
    // Only direct-fetch known CORS-safe CDNs without noisy failed CORS console errors; otherwise go straight to proxy
    const isCorsFriendlyCdn =
      src.includes('ik.imagekit.io') ||
      src.includes('vercel-storage.com') ||
      src.includes('googleusercontent.com');
    if (isCorsFriendlyCdn) {
      const blob = await fetchBlobWithRetry(src, { mode: 'cors', cache: 'reload' }, 1);
      if (blob) result = await blobToSizedDataUrl(blob, bucketPx);
    }

    // 4. Same-origin image proxy fallback (rate-limited to 4 concurrent + retried once)
    if (!result) {
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(src)}`;
      const blob = await limitProxyFetch(() => fetchBlobWithRetry(proxyUrl, { cache: 'force-cache' }, 1));
      if (blob) result = await blobToSizedDataUrl(blob, bucketPx);
    }
  }

  if (result && result.length > 100) {
    resizedImageCache.set(cacheKey, result);
    return result;
  }
  return null;
}

/**
 * Wait two animation frames to guarantee the browser has composited the latest paint.
 */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/**
 * Generates a PNG data URL from a DOM container.
 *
 * Strategy:
 * 1. Wait for live images to load.
 * 2. Measure live container dimensions.
 * 3. Deep-clone into a hidden off-screen wrapper.
 * 4. Inline ALL images in the clone as data: URLs (via proxy → direct → canvas).
 * 5. Run html-to-image on the clone — it never sees an external URL.
 * 6. Remove the clone and return the PNG.
 */
export async function generateContainerPng(
  container: HTMLElement,
  exportOptions?: ExportContainerOptions
): Promise<string> {
  // Step 1 — wait for any currently loading images in the live element (allow up to 4s on slow mobile 4G)
  const liveImages = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
  await Promise.all(
    liveImages.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
            setTimeout(resolve, 4000);
          })
    )
  );
  const liveImgBySrc = new Map<string, HTMLImageElement>();
  liveImages.forEach((img) => {
    const raw = img.getAttribute('src') || '';
    if (raw && img.naturalWidth > 0 && !liveImgBySrc.has(raw)) {
      liveImgBySrc.set(raw, img);
    }
  });

  // Step 2 — measure before cloning (clone has no layout yet)
  const targetWidth = exportOptions?.width || container.scrollWidth || container.offsetWidth || 1200;
  const targetHeight = container.scrollHeight || container.offsetHeight || 800;

  // Optionally pre-resolve Google Font CSS without touching document.styleSheets
  const fontEmbedCss = exportOptions?.fontEmbedUrl
    ? await buildFontEmbedCss(exportOptions.fontEmbedUrl)
    : '';

  // Step 3 — clone into an off-screen wrapper with a fixed pixel width
  const wrapper = document.createElement('div');
  wrapper.style.cssText = [
    'position:fixed',
    'left:-99999px',
    'top:0',
    `width:${targetWidth}px`,
    'height:auto',
    'overflow:visible',
    'pointer-events:none',
    'z-index:-1',
  ].join(';');
  const clone = container.cloneNode(true) as HTMLElement;
  if (exportOptions?.beforeCapture) {
    exportOptions.beforeCapture(clone);
  }
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // Allow CSS layout to settle so cloned image boxes have real rendered sizes
    await waitForPaint();

    // Step 4 — inline and compactly resize ALL images in the clone (deduplicated per src+size)
    const cloneImages = Array.from(clone.querySelectorAll('img')) as HTMLImageElement[];
    const inflightByKey = new Map<string, Promise<string | null>>();

    await Promise.all(
      cloneImages.map(async (cloneImg) => {
        const originalSrc = cloneImg.getAttribute('src') || '';
        if (!originalSrc || originalSrc.startsWith('data:')) return;

        // Ensure eager loading & remove crossOrigin so data URLs decode cleanly in SVG foreignObject
        cloneImg.removeAttribute('crossorigin');
        cloneImg.loading = 'eager';
        cloneImg.decoding = 'sync';

        const rect = cloneImg.getBoundingClientRect();
        const parentRect = cloneImg.parentElement?.getBoundingClientRect();
        const boxDim = Math.max(
          rect.width,
          rect.height,
          parentRect?.width || 0,
          parentRect?.height || 0
        );
        const maxDimPx = boxDim > 0 && boxDim <= 96 ? 256 : boxDim > 0 && boxDim <= 260 ? 640 : 1600;
        const key = `${originalSrc}::${maxDimPx}`;

        let pending = inflightByKey.get(key);
        if (!pending) {
          const liveImg = liveImgBySrc.get(originalSrc);
          pending = srcToDataUrl(originalSrc, liveImg, maxDimPx);
          inflightByKey.set(key, pending);
        }

        const dataUrl = await pending;
        if (dataUrl && dataUrl.length > 100) {
          cloneImg.setAttribute('src', dataUrl);
          cloneImg.src = dataUrl;
          await forceDecodeImage(cloneImg);
        } else {
          // Remove broken external URL so html-to-image never refetches or sets src=""
          cloneImg.remove();
        }
      })
    );

    // Step 5 — flush paint pass so browser composites the decoded images
    await waitForPaint();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await waitForPaint();

    // Step 6 — measure clone's true rendered dimensions & keep canvas within mobile memory bounds
    const cloneWidth = clone.scrollWidth || clone.offsetWidth || targetWidth;
    const cloneHeight = clone.scrollHeight || clone.offsetHeight || targetHeight;
    const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent);
    let pixelRatio = 2;
    if (isMobile) {
      const area2x = cloneWidth * cloneHeight * 4;
      if (cloneWidth * 2 > 4096 || cloneHeight * 2 > 4096 || area2x > 15_500_000) {
        pixelRatio = Math.min(1.5, Math.floor((4096 / Math.max(cloneWidth, cloneHeight)) * 10) / 10);
      }
    }

    const options = {
      quality: 0.95,
      pixelRatio,
      width: cloneWidth,
      height: cloneHeight,
      backgroundColor: exportOptions?.backgroundColor || '#ffffff',
      cacheBust: false,
      imagePlaceholder:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      fontEmbedCSS: fontEmbedCss,
      skipFontFace: !fontEmbedCss,
      filter: (node: HTMLElement) => {
        const tag = (node as Element).tagName;
        if (tag === 'SCRIPT' || tag === 'NOSCRIPT' || tag === 'IFRAME') return false;
        return exportOptions?.filter ? exportOptions.filter(node) : true;
      },
    };

    // Mobile WebKit / Chrome SVG foreignObject warm-up pass ensures inner data: URLs paint cleanly
    if (isMobile && cloneImages.length > 0) {
      try {
        await toCanvas(clone, { ...options, pixelRatio: 1 });
        await waitForPaint();
      } catch {
        // Ignore warm-up error and proceed to capture
      }
    }

    try {
      return await toPng(clone, options);
    } catch (err) {
      console.warn('toPng pass 1 failed, retrying at pixelRatio 1...', err);
      return await toPng(clone, { ...options, pixelRatio: 1 });
    }
  } finally {
    if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
  }
}

/**
 * Downloads a PNG file directly to the user's device without causing page refresh.
 */
export function downloadPng(dataUrl: string, filename: string): void {
  try {
    let objectUrl = dataUrl;
    let isCreatedBlobUrl = false;

    if (dataUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(dataUrl);
      objectUrl = URL.createObjectURL(blob);
      isCreatedBlobUrl = true;
    }

    const link = document.createElement('a');
    link.style.display = 'none';
    link.download = filename;
    link.href = objectUrl;
    link.target = '_self';
    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
      if (document.body.contains(link)) document.body.removeChild(link);
      if (isCreatedBlobUrl) URL.revokeObjectURL(objectUrl);
    }, 4000);
  } catch (err) {
    console.error('Download PNG failed:', err);
  }
}

/**
 * Shares a PNG image using Web Share API if supported, or falls back to downloading.
 */
export async function shareOrDownloadPng(dataUrl: string, filename: string, title: string = 'SSPS League'): Promise<void> {
  try {
    const blob = dataUrl.startsWith('data:') ? dataUrlToBlob(dataUrl) : await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: 'image/png' });

    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ title, files: [file] });
      return;
    }
  } catch (shareErr) {
    console.warn('Web Share not supported or cancelled, falling back to download:', shareErr);
  }

  downloadPng(dataUrl, filename);
}
