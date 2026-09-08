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
        setTimeout(onDone, 300);
      });
    }
  } catch {
    // Ignore decode error for broken images
  }
}

/**
 * Preloads all <img> tags inside a DOM node and converts images to base64 Data URLs.
 * Uses /api/image-proxy server-side fetch to bypass CORS and forces GPU decoding for mobile compatibility.
 */
export async function inlineContainerImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  
  // Wait for any images currently loading to finish or timeout
  await Promise.all(
    images.map(async (img) => {
      if (!img.complete && img.src && !img.src.startsWith('data:')) {
        await new Promise<void>((resolve) => {
          const onDone = () => resolve();
          img.addEventListener('load', onDone, { once: true });
          img.addEventListener('error', onDone, { once: true });
          setTimeout(onDone, 1000);
        });
      }
    })
  );

  await Promise.all(
    images.map(async (img) => {
      const src = img.src;
      if (!src) return;

      let targetDataUrl: string | null = null;

      if (src.startsWith('data:')) {
        targetDataUrl = src;
      } else if (src.startsWith('http://') || src.startsWith('https://')) {
        // 1. Try proxy fetch via /api/image-proxy for http/https URLs
        try {
          const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(src)}`;
          const response = await fetch(proxyUrl);
          if (response.ok) {
            const blob = await response.blob();
            targetDataUrl = await blobToDataUrl(blob);
          }
        } catch (err) {
          console.warn('Proxy fetch failed for image:', src, err);
        }

        // 2. Direct fetch fallback if proxy failed
        if (!targetDataUrl) {
          try {
            const response = await fetch(src, { mode: 'cors' });
            if (response.ok) {
              const blob = await response.blob();
              targetDataUrl = await blobToDataUrl(blob);
            }
          } catch {
            // Direct fetch failed
          }
        }
      } else if (src.startsWith('/')) {
        // Relative origin URL
        try {
          const response = await fetch(src);
          if (response.ok) {
            const blob = await response.blob();
            targetDataUrl = await blobToDataUrl(blob);
          }
        } catch {
          // Relative fetch failed
        }
      }

      // 3. Fallback: Canvas conversion if image is loaded in DOM
      if (!targetDataUrl && img.naturalWidth && img.naturalHeight) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            targetDataUrl = canvas.toDataURL('image/png');
          }
        } catch (err) {
          console.warn('Canvas conversion failed for image:', src, err);
        }
      }

      if (targetDataUrl && targetDataUrl.length > 100) {
        img.src = targetDataUrl;
        await forceDecodeImage(img);
      }
    })
  );

  // Extra 150ms buffer for mobile Safari/Chrome GPU rendering pass
  await new Promise((resolve) => setTimeout(resolve, 150));
}

/**
 * Generates a PNG data URL from a DOM container cleanly with full height/width calculation.
 */
export async function generateContainerPng(container: HTMLElement): Promise<string> {
  await inlineContainerImages(container);
  
  // Calculate explicit full width and height to prevent viewport clipping
  const targetWidth = container.scrollWidth || container.offsetWidth || 1200;
  const targetHeight = container.scrollHeight || container.offsetHeight || 800;

  const options = {
    quality: 0.95,
    pixelRatio: 1.5,
    width: targetWidth,
    height: targetHeight,
    backgroundColor: '#ffffff',
    cacheBust: false,
    fontEmbedCSS: '',
    skipFontFace: true,
    filter: (node: HTMLElement) => {
      if (node.tagName === 'SCRIPT' || node.tagName === 'NOSCRIPT' || node.tagName === 'IFRAME') {
        return false;
      }
      return true;
    }
  };

  try {
    return await toPng(container, options);
  } catch (err) {
    console.warn('Initial toPng failed, trying secondary fallback options...', err);
    return await toPng(container, {
      ...options,
      pixelRatio: 1.0,
      cacheBust: true,
    });
  }
}

/**
 * Downloads a PNG file directly to the user's computer or device safely without page refresh.
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
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      if (isCreatedBlobUrl) {
        URL.revokeObjectURL(objectUrl);
      }
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
      await navigator.share({
        title,
        files: [file],
      });
      return;
    }
  } catch (shareErr) {
    console.warn('Web Share not supported or cancelled, falling back to download:', shareErr);
  }

  // Fallback to direct download
  downloadPng(dataUrl, filename);
}
