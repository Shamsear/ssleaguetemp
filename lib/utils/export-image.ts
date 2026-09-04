import { toPng } from 'html-to-image';

/**
 * Preloads all <img> tags inside a DOM node and converts cross-origin images to base64 Data URLs.
 * This prevents html-to-image / toPng from failing due to CORS / canvas tainting.
 */
export async function inlineContainerImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      if (!img.src || img.src.startsWith('data:')) return;
      try {
        const response = await fetch(img.src, { mode: 'cors' });
        if (!response.ok) return;
        const blob = await response.blob();
        await new Promise<void>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === 'string') {
              img.src = reader.result;
            }
            resolve();
          };
          reader.onerror = () => resolve();
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.warn('Could not inline image for export:', img.src, err);
      }
    })
  );
}

/**
 * Generates a PNG data URL from a DOM container cleanly.
 */
export async function generateContainerPng(container: HTMLElement): Promise<string> {
  await inlineContainerImages(container);
  
  // Render PNG with fallback options
  try {
    return await toPng(container, {
      quality: 0.95,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: false,
      skipFontFace: true,
      imagePlaceholder: 'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="100%" height="100%" fill="%23f1f5f9"/></svg>',
    });
  } catch (err) {
    console.warn('Initial toPng failed, trying fallback without skipFontFace...', err);
    return await toPng(container, {
      quality: 0.9,
      pixelRatio: 1.5,
      backgroundColor: '#ffffff',
      cacheBust: true,
    });
  }
}

/**
 * Downloads a PNG file directly to the user's computer or device.
 */
export function downloadPng(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Shares a PNG image using Web Share API if supported, or falls back to downloading.
 */
export async function shareOrDownloadPng(dataUrl: string, filename: string, title: string = 'SSPS League'): Promise<void> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
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
