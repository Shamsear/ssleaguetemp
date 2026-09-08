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
 * Preloads all <img> tags inside a DOM node and converts images to base64 Data URLs.
 * Uses /api/image-proxy server-side fetch to bypass CORS without modifying DOM crossorigin properties.
 * Ensures team logos and photos render cleanly in PNG export without white box artifacts.
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
      if (!src || src.startsWith('data:')) return;

      // 1. Try proxy fetch via /api/image-proxy for http/https URLs
      if (src.startsWith('http://') || src.startsWith('https://')) {
        try {
          const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(src)}`;
          const response = await fetch(proxyUrl);
          if (response.ok) {
            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            if (dataUrl && dataUrl.length > 100) {
              img.src = dataUrl;
              return;
            }
          }
        } catch (err) {
          console.warn('Proxy fetch failed for image:', src, err);
        }

        // 2. Direct fetch fallback
        try {
          const response = await fetch(src, { mode: 'cors' });
          if (response.ok) {
            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            if (dataUrl && dataUrl.length > 100) {
              img.src = dataUrl;
              return;
            }
          }
        } catch {
          // Direct fetch failed
        }
      } else if (src.startsWith('/')) {
        // Relative origin URL
        try {
          const response = await fetch(src);
          if (response.ok) {
            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            if (dataUrl && dataUrl.length > 100) {
              img.src = dataUrl;
              return;
            }
          }
        } catch {
          // Relative fetch failed
        }
      }

      // 3. Fallback: Canvas conversion if image is already loaded in DOM
      try {
        if (img.naturalWidth && img.naturalHeight) {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            if (dataUrl && dataUrl.length > 100) {
              img.src = dataUrl;
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Canvas conversion failed for image:', src, err);
      }
    })
  );
}

/**
 * Generates a PNG data URL from a DOM container cleanly.
 */
export async function generateContainerPng(container: HTMLElement): Promise<string> {
  await inlineContainerImages(container);
  
  const options = {
    quality: 0.95,
    pixelRatio: 1.5,
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
