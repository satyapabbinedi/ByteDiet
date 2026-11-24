'use client';

/**
 * WebP encoding for browsers whose canvas cannot produce WebP (Safari returns PNG from `toBlob('image/webp')`).
 * Uses libwebp compiled to WASM (@jsquash/webp, ~280 KB) instead of downloading the 32 MB FFmpeg core for one image.
 */

export async function encodeCanvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { default: encode } = await import('@jsquash/webp/encode');
  // libwebp quality is 0-100; canvas quality is 0-1.
  const data = await encode(pixels, { quality: Math.round(quality * 100) });
  if (!data.byteLength) throw new Error('The WebP encoder returned no bytes.');
  return new Blob([data], { type: 'image/webp' });
}
