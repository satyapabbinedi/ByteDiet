/**
 * Video output policy shared by the WebCodecs (primary) and FFmpeg (fallback) encoders.
 *
 * Modelled on how messaging apps such as WhatsApp send video: cap the resolution at 720p ("HD"), cap the frame
 * rate at 30 fps, target a bitrate derived from the pixel rate instead of a fixed quality, and skip re-encoding
 * entirely when the source is already a small H.264 file. Pure functions only, so they are unit-testable in Node.
 */

export const VIDEO_POLICY = {
  /** Longest output edge in pixels (1280 → 1280×720 landscape, 720×1280 portrait). */
  maxEdge: 1280,
  /** Higher source frame rates (iPhone 60 fps) are reduced to this. */
  maxFrameRate: 30,
  /** Bits per pixel per frame for H.264; 0.07 gives ~1.9 Mbps for 720p30, in line with messaging-app output. */
  bitsPerPixel: 0.07,
  minVideoBitrate: 300_000,
  maxVideoBitrate: 4_000_000,
  audioBitrate: 128_000,
  maxAudioChannels: 2,
  /** A source within this factor of the target bitrate is already "small enough" to copy without re-encoding. */
  remuxBitrateHeadroom: 1.25,
} as const;

export type Size = { width: number; height: number };

// Round down (never up, so nothing is upscaled); the epsilon absorbs float error such as 1279.9999 for 1280.
const even = (value: number) => Math.max(2, Math.floor(value / 2 + 1e-6) * 2);

/** Scales `width × height` down so the longest edge is at most `maxEdge`. Never upscales; dimensions are even. */
export function fitWithin(width: number, height: number, maxEdge: number = VIDEO_POLICY.maxEdge): Size {
  if (!(width > 0) || !(height > 0)) throw new Error('Video dimensions must be positive.');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: even(width * scale), height: even(height * scale) };
}

/** The output frame rate to request, or `undefined` to keep the source rate. Tolerates 30.x VFR sources. */
export function targetFrameRate(sourceFps: number | null | undefined): number | undefined {
  if (!sourceFps || !Number.isFinite(sourceFps)) return undefined;
  return sourceFps > VIDEO_POLICY.maxFrameRate + 1 ? VIDEO_POLICY.maxFrameRate : undefined;
}

/**
 * Target H.264 bitrate in bits/s for the given output size and frame rate. Never exceeds 90% of a known source
 * bitrate, so re-encoding an already-efficient file does not make it bigger.
 */
export function targetVideoBitrate(size: Size, fps: number | null | undefined, sourceBitrate?: number | null): number {
  const frameRate = fps && Number.isFinite(fps) && fps > 0 ? Math.min(fps, VIDEO_POLICY.maxFrameRate) : VIDEO_POLICY.maxFrameRate;
  let bitrate = size.width * size.height * frameRate * VIDEO_POLICY.bitsPerPixel;
  bitrate = Math.min(VIDEO_POLICY.maxVideoBitrate, Math.max(VIDEO_POLICY.minVideoBitrate, bitrate));
  if (sourceBitrate && Number.isFinite(sourceBitrate) && sourceBitrate > 0) bitrate = Math.min(bitrate, sourceBitrate * 0.9);
  return Math.max(150_000, Math.round(bitrate));
}

export type RemuxCandidate = {
  videoCodec: string | null;
  width: number;
  height: number;
  fps: number | null;
  videoBitrate: number | null;
  /** `null` when the file has no audio track. */
  audioCodec: string | null;
};

/**
 * True when the source can be copied into an MP4 without re-encoding: H.264 within the size, frame-rate and bitrate
 * budget, with AAC or no audio. Copying is near-instant and lossless, which is what messaging apps do for files that
 * are already small.
 */
export function canRemux(source: RemuxCandidate): boolean {
  if (source.videoCodec !== 'avc') return false;
  if (source.audioCodec !== null && source.audioCodec !== 'aac') return false;
  if (Math.max(source.width, source.height) > VIDEO_POLICY.maxEdge) return false;
  if (targetFrameRate(source.fps) !== undefined) return false;
  if (!source.videoBitrate) return false;
  const budget = targetVideoBitrate(fitWithin(source.width, source.height), source.fps);
  return source.videoBitrate <= budget * VIDEO_POLICY.remuxBitrateHeadroom;
}

/** FFmpeg `-vf` filter that applies the same size cap as the WebCodecs path (aspect preserved, even dimensions). */
export function ffmpegScaleFilter(maxEdge: number = VIDEO_POLICY.maxEdge): string {
  return `scale=min(${maxEdge}\\,iw):min(${maxEdge}\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2`;
}
