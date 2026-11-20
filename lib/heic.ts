'use client';

/**
 * Browser-side HEIC/HEIF decoding via libheif (WASM). Loaded lazily, only when a
 * HEIC/HEIF file cannot be decoded natively (everything except Safari today).
 */

type HeifImage = {
  get_width(): number;
  get_height(): number;
  is_primary(): boolean;
  display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: unknown) => void): void;
  free?: () => void;
};
type Libheif = { HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] } };

const MAX_PIXELS = 120_000_000;

let libheifPromise: Promise<Libheif> | null = null;

function loadLibheif(): Promise<Libheif> {
  if (!libheifPromise) {
    const pending = import('libheif-js/wasm-bundle').then(module => {
      const candidate = ((module as { default?: unknown }).default ?? module) as Libheif;
      if (typeof candidate.HeifDecoder !== 'function') throw new Error('HEIC decoder failed to initialise.');
      return candidate;
    });
    libheifPromise = pending;
    pending.catch(() => { if (libheifPromise === pending) libheifPromise = null; });
  }
  return libheifPromise;
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'mif2']);

/** True when the bytes are an ISO-BMFF HEIF/HEIC image (not AVIF), regardless of file name or MIME. */
export async function isHeifFile(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (head.length < 12) return false;
  const text = (start: number) => String.fromCharCode(...head.subarray(start, start + 4));
  if (text(4) !== 'ftyp') return false;
  const size = Math.min(((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0 || 32, head.length);
  const brands = [text(8)];
  for (let offset = 16; offset + 4 <= size; offset += 4) brands.push(text(offset));
  if (brands.includes('avif') || brands.includes('avis')) return false;
  return brands.some(brand => HEIF_BRANDS.has(brand));
}

export type DecodedHeic = { canvas: HTMLCanvasElement; width: number; height: number };

export async function decodeHeic(file: Blob): Promise<DecodedHeic> {
  const libheif = await loadLibheif();
  let images: HeifImage[];
  try {
    images = new libheif.HeifDecoder().decode(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    const detail = error && typeof error === 'object' && 'message' in error ? String((error as Error).message) : '';
    throw new Error(`The HEIC file could not be parsed${detail ? ` (${detail})` : ''}.`);
  }
  if (!Array.isArray(images) || images.length === 0) throw new Error('No decodable image was found inside this HEIC file.');

  const primary = images.find(image => image.is_primary()) ?? images[0];
  try {
    const width = primary.get_width();
    const height = primary.get_height();
    if (!width || !height) throw new Error('The HEIC image has no usable dimensions.');
    if (width * height > MAX_PIXELS) throw new Error(`The HEIC image is too large to decode in the browser (${width} × ${height}).`);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable in this browser.');
    const imageData = context.createImageData(width, height);
    const result = await new Promise<unknown>(resolve => primary.display(imageData, resolve));
    if (!result) throw new Error('The HEIC image data could not be decoded (unsupported codec or corrupt file).');
    context.putImageData(imageData, 0, 0);
    return { canvas, width, height };
  } finally {
    for (const image of images) { try { image.free?.(); } catch { /* already released */ } }
  }
}
