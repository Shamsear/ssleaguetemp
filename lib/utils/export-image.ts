import { toPng } from 'html-to-image';

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
        setTimeout(onDone, 500);
      });
    }
  } catch {
    // Ignore decode error for broken images
  }
}

/**
 * Fetches an image src and returns a Base64 data URL. Tries proxy first, then direct, then canvas.
 */
async function srcToDataUrl(src: string, liveImg?: HTMLImageElement): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:')) return src;

  // Proxy fetch (bypasses CORS — works on both mobile and desktop)
  if (src.startsWith('http://') || src.startsWith('https://')) {
    try {
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(src)}`;
      const res = await fetch(proxyUrl, { cache: 'no-store' });
      if (res.ok) return await blobToDataUrl(await res.blob());
    } catch { /* proxy failed */ }

    // Direct CORS fetch fallback
    try {
      const res = await fetch(src, { mode: 'cors', cache: 'no-store' });
      if (res.ok) return await blobToDataUrl(await res.blob());
    } catch { /* direct failed */ }
  }

  // Relative URL
  if (src.startsWith('/')) {
    try {
      const res = await fetch(src, { cache: 'no-store' });
      if (res.ok) return await blobToDataUrl(await res.blob());
    } catch { /* relative failed */ }
  }

  // Canvas fallback: only works if the live img is already loaded (same-origin or CORS-ok)
  if (liveImg && liveImg.naturalWidth && liveImg.naturalHeight) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = liveImg.naturalWidth;
      canvas.height = liveImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(liveImg, 0, 0);
        return canvas.toDataURL('image/png');
      }
    } catch { /* canvas tainted */ }
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
export async function generateContainerPng(container: HTMLElement): Promise<string> {
  // Step 1 — wait for any currently loading images in the live element
  const liveImages = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
  await Promise.all(
    liveImages.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
            setTimeout(resolve, 1500);
          })
    )
  );

  // Step 2 — measure before cloning (clone has no layout yet)
  const targetWidth = container.scrollWidth || container.offsetWidth || 1200;
  const targetHeight = container.scrollHeight || container.offsetHeight || 800;

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
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // Step 4 — inline images in the clone
    const cloneImages = Array.from(clone.querySelectorAll('img')) as HTMLImageElement[];
    await Promise.all(
      cloneImages.map(async (cloneImg, i) => {
        const originalSrc = cloneImg.getAttribute('src') || '';
        if (!originalSrc || originalSrc.startsWith('data:')) return;

        // Use the corresponding live image for canvas fallback
        const liveImg = liveImages[i];
        const dataUrl = await srcToDataUrl(originalSrc, liveImg);
        if (dataUrl && dataUrl.length > 100) {
          cloneImg.setAttribute('src', dataUrl);
          cloneImg.src = dataUrl;
          await forceDecodeImage(cloneImg);
        }
      })
    );

    // Step 5 — flush paint pass so browser composites the decoded images
    await waitForPaint();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await waitForPaint();

    // Step 6 — measure clone's true rendered dimensions
    const cloneWidth = clone.scrollWidth || clone.offsetWidth || targetWidth;
    const cloneHeight = clone.scrollHeight || clone.offsetHeight || targetHeight;

    const options = {
      quality: 0.95,
      pixelRatio: 2,
      width: cloneWidth,
      height: cloneHeight,
      backgroundColor: '#ffffff',
      cacheBust: false,
      fontEmbedCSS: '',
      skipFontFace: true,
      filter: (node: HTMLElement) => {
        const tag = (node as Element).tagName;
        return tag !== 'SCRIPT' && tag !== 'NOSCRIPT' && tag !== 'IFRAME';
      },
    };

    try {
      return await toPng(clone, options);
    } catch (err) {
      console.warn('toPng pass 1 failed, retrying at pixelRatio 1...', err);
      return await toPng(clone, { ...options, pixelRatio: 1, cacheBust: true });
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
