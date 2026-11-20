'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { classifyMedia } from './media-formats';
import { decodeHeic, isHeifFile } from './heic';

const MAX_IMAGE_EDGE = 1600;
const WEBP_QUALITY = 0.78;

let enginePromise: Promise<FFmpeg> | null = null;
let progressCallback: ((value: number) => void) | undefined;

async function getEngine(onProgress?: (value: number) => void): Promise<FFmpeg> {
  progressCallback = onProgress;
  if (!enginePromise) {
    const pending = (async () => {
      const engine = new FFmpeg();
      engine.on('progress', ({ progress }) => {
        // FFmpeg reports nonsense (negative or >1) when the input duration is unknown.
        if (Number.isFinite(progress)) progressCallback?.(Math.max(0, Math.min(1, progress)));
      });
      await engine.load({
        coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
      });
      return engine;
    })();
    enginePromise = pending;
    pending.catch(() => {
      if (enginePromise === pending) enginePromise = null;
    });
  }
  return enginePromise;
}

/** A crashed/aborted WASM instance (e.g. out of memory) is unusable; drop it so the next job starts fresh. */
function discardEngine(engine: FFmpeg) {
  enginePromise = null;
  try { engine.terminate(); } catch { /* already gone */ }
}

async function runFfmpeg(engine: FFmpeg, args: string[]): Promise<void> {
  let exitCode: number;
  try {
    exitCode = await engine.exec(args);
  } catch (error) {
    discardEngine(engine);
    throw error;
  }
  // exec() does not throw for a failed run: it resolves with the process exit code.
  if (exitCode !== 0) throw new Error(`the encoder could not process this file (exit code ${exitCode}); the format or codec is probably unsupported`);
}

function safeName(name: string): string {
  const base = name.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'input';
  return `${base.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'input'}.input`;
}

function outputName(name: string, extension: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || fallback;
  return `${base}.${extension}`;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return Uint8Array.from(data).buffer;
}

export type MediaInfo = { width: number | null; height: number | null; duration: number | null };
export type ImageEngine = 'canvas-webp' | 'libheif-wasm+canvas-webp' | 'ffmpeg.wasm';
export type ImageResult = { file: File; engine: ImageEngine; inputWidth: number | null; inputHeight: number | null };

export async function loadClientEncoder(onProgress?: (value: number) => void): Promise<void> {
  await getEngine(onProgress);
}

export async function readMediaInfo(file: File): Promise<MediaInfo> {
  if (classifyMedia(file.name, file.type)?.kind === 'image') {
    const bitmap = await createImageBitmap(file);
    try {
      return { width: bitmap.width || null, height: bitmap.height || null, duration: null };
    } finally {
      bitmap.close();
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null,
      });
      video.onerror = () => reject(new Error('The browser could not read this video\'s metadata.'));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressVideoClient(file: File, onProgress?: (value: number) => void): Promise<File> {
  const engine = await getEngine(onProgress);
  const input = safeName(file.name);
  const output = 'media-lab-output.mp4';
  try {
    await engine.writeFile(input, await fetchFile(file));
    await runFfmpeg(engine, [
      '-i', input, '-map', '0:v:0', '-map', '0:a?',
      '-vf', 'scale=min(1920\\,iw):min(1920\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2',
      // yuv420p: 10-bit / 4:2:2 sources (iPhone HDR, ProRes) otherwise yield MP4s browsers cannot play.
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output,
    ]);
    const data = await engine.readFile(output);
    if (typeof data === 'string' || data.byteLength === 0) throw new Error('Browser encoder returned no media bytes.');
    return new File([toArrayBuffer(data)], outputName(file.name, 'mp4', 'media'), { type: 'video/mp4' });
  } catch (error) {
    throw new Error(`Video conversion failed: ${error instanceof Error ? error.message : 'unsupported codec or media'}`);
  } finally {
    await Promise.all([engine.deleteFile(input).catch(() => undefined), engine.deleteFile(output).catch(() => undefined)]);
  }
}

type Raster = { source: CanvasImageSource; width: number; height: number; release: () => void; engine: ImageEngine };

async function decodeNatively(file: File): Promise<Raster> {
  const bitmap = await createImageBitmap(file); // honours EXIF orientation
  return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close(), engine: 'canvas-webp' };
}

async function decodeWithLibheif(file: File): Promise<Raster> {
  const { canvas, width, height } = await decodeHeic(file);
  return {
    source: canvas, width, height, engine: 'libheif-wasm+canvas-webp',
    release: () => { canvas.width = 0; canvas.height = 0; },
  };
}

function scaledCanvas(raster: Raster): HTMLCanvasElement {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(raster.width, raster.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(raster.width * scale));
  canvas.height = Math.max(1, Math.round(raster.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(raster.source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    value => value ? resolve(value) : reject(new Error(`Browser ${type} encoder failed.`)),
    type, quality,
  ));
}

async function ffmpegImageToWebp(data: Blob, onProgress?: (value: number) => void): Promise<Blob> {
  const engine = await getEngine(onProgress);
  const input = 'media-lab-image.input';
  const output = 'media-lab-output.webp';
  try {
    await engine.writeFile(input, await fetchFile(data));
    await runFfmpeg(engine, [
      '-i', input, '-frames:v', '1',
      '-vf', `scale=min(${MAX_IMAGE_EDGE}\\,iw):min(${MAX_IMAGE_EDGE}\\,ih):force_original_aspect_ratio=decrease`,
      '-c:v', 'libwebp', '-q:v', '72', output,
    ]);
    const result = await engine.readFile(output);
    if (typeof result === 'string' || result.byteLength === 0) throw new Error('Browser encoder returned no image bytes.');
    return new Blob([toArrayBuffer(result)], { type: 'image/webp' });
  } finally {
    await Promise.all([engine.deleteFile(input).catch(() => undefined), engine.deleteFile(output).catch(() => undefined)]);
  }
}

export async function compressImageClient(file: File, onProgress?: (value: number) => void): Promise<ImageResult> {
  const heif = await isHeifFile(file).catch(() => false);
  let raster: Raster | null = null;
  let nativeError: unknown;
  let heifError: unknown;

  try {
    raster = await decodeNatively(file);
  } catch (error) {
    nativeError = error;
    if (heif) {
      try { raster = await decodeWithLibheif(file); } catch (decodeError) { heifError = decodeError; }
    }
  }

  if (raster) {
    try {
      const canvas = scaledCanvas(raster);
      const inputWidth = raster.width;
      const inputHeight = raster.height;
      let blob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
      let engine = raster.engine;
      if (blob.type !== 'image/webp') {
        // Safari ignores the requested type and silently returns PNG: encode it to WebP with FFmpeg instead.
        blob = await ffmpegImageToWebp(await canvasToBlob(canvas, 'image/png'), onProgress);
        engine = 'ffmpeg.wasm';
      }
      onProgress?.(1);
      return {
        file: new File([blob], outputName(file.name, 'webp', 'image'), { type: 'image/webp' }),
        engine, inputWidth, inputHeight,
      };
    } catch (error) {
      throw new Error(`Image conversion failed: ${error instanceof Error ? error.message : 'unsupported image format'}`);
    } finally {
      raster.release();
    }
  }

  if (heif) {
    const reason = heifError instanceof Error ? heifError.message : 'unsupported HEIC variant';
    throw new Error(`Image conversion failed: ${reason}`);
  }

  // Formats this browser cannot decode (TIFF, some BMP/AVIF variants, ...): try FFmpeg.
  try {
    const blob = await ffmpegImageToWebp(file, onProgress);
    onProgress?.(1);
    return { file: new File([blob], outputName(file.name, 'webp', 'image'), { type: 'image/webp' }), engine: 'ffmpeg.wasm', inputWidth: null, inputHeight: null };
  } catch (fallbackError) {
    const reason = fallbackError instanceof Error ? fallbackError.message : '';
    const native = nativeError instanceof Error ? nativeError.message : '';
    throw new Error(`Image conversion failed: ${reason || native || 'unsupported image format'}`);
  }
}
