'use client';

/**
 * Fast video path: WebCodecs (the browser's own, usually hardware-accelerated, decoder and encoder) driven by
 * Mediabunny for demuxing/muxing. Typically 10-50× faster than FFmpeg WASM and it reads the file lazily, so large
 * videos are never copied into WASM memory.
 *
 * Throws `WebCodecsUnavailable` when this browser/file combination cannot be handled, so the caller can fall back
 * to FFmpeg WASM. It never silently drops an audio track: a file whose audio cannot be carried over is rejected.
 */

import type { InputAudioTrack, InputTrack, InputVideoTrack } from 'mediabunny';
import { VIDEO_POLICY, canRemux, fitWithin, targetFrameRate, targetVideoBitrate } from './video-encoding';

export type WebCodecsEngine = 'webcodecs' | 'webcodecs-remux';
export type WebCodecsResult = { data: ArrayBuffer; engine: WebCodecsEngine };

export class WebCodecsUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebCodecsUnavailable';
  }
}

class NotARemuxCandidate extends Error {}

type Mediabunny = typeof import('mediabunny');

let aacReady: Promise<void> | null = null;

/** Firefox (and some Linux builds) have no native AAC encoder; register a small WASM one (~1 MB) on demand. */
function ensureAacEncoder(mb: Mediabunny): Promise<void> {
  if (!aacReady) {
    const pending = (async () => {
      if (await mb.canEncodeAudio('aac')) return;
      const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
      registerAacEncoder();
    })();
    aacReady = pending;
    pending.catch(() => { if (aacReady === pending) aacReady = null; });
  }
  return aacReady;
}

/**
 * Only the video classes are required. WebCodecs audio arrived much later in some browsers (Safari added
 * AudioDecoder/AudioEncoder long after VideoEncoder), yet phone video almost always has AAC audio, which is copied
 * as-is and never decoded. When audio does need decoding and the browser cannot, `pickAudioTrack` finds no usable
 * track and the caller falls back to FFmpeg, so audio is never lost.
 */
export function webCodecsSupported(): boolean {
  return typeof window !== 'undefined'
    && typeof window.VideoEncoder === 'function'
    && typeof window.VideoDecoder === 'function';
}

/** First audio track we can carry into the output (copy AAC, or decode anything else), like FFmpeg's `-map 0:a:0?`. */
async function pickAudioTrack(tracks: InputAudioTrack[]): Promise<InputAudioTrack | null> {
  for (const track of tracks) {
    if (track.codec === 'aac') return track;
    if (track.codec && await track.canDecode().catch(() => false)) return track;
  }
  return null;
}

async function convert(
  mb: Mediabunny,
  file: File,
  plan: (videoTrack: InputVideoTrack, audioTrack: InputAudioTrack | null) => Promise<{
    video: import('mediabunny').ConversionVideoOptions;
    audio: import('mediabunny').ConversionAudioOptions;
    copy?: import('mediabunny').ConversionCopyOptions | false;
  }>,
  onProgress?: (value: number) => void,
): Promise<ArrayBuffer> {
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new WebCodecsUnavailable('no video track found');
    const audioTracks = await input.getAudioTracks();
    const audioTrack = await pickAudioTrack(audioTracks);
    if (audioTracks.length > 0 && !audioTrack) throw new WebCodecsUnavailable('no audio track this browser can decode');

    const options = await plan(videoTrack, audioTrack);
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() });
    const isVideo = (track: InputTrack) => track.id === videoTrack.id;
    const isAudio = (track: InputTrack) => audioTrack !== null && track.id === audioTrack.id;
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: track => isVideo(track) ? options.video : { discard: true },
      audio: track => isAudio(track) ? options.audio : { discard: true },
      copy: options.copy,
      // Like messaging apps, do not carry over container metadata (e.g. GPS location written by phones).
      tags: {},
      showWarnings: false,
    });

    const lost = conversion.discardedTracks.filter(entry => isVideo(entry.track) || isAudio(entry.track));
    if (!conversion.isValid || lost.length > 0) {
      const reasons = lost.map(entry => `${entry.track.type}: ${entry.reason.replaceAll('_', ' ')}`).join(', ');
      throw new WebCodecsUnavailable(reasons || 'conversion is not possible in this browser');
    }

    if (onProgress) conversion.onProgress = progress => { if (Number.isFinite(progress)) onProgress(Math.max(0, Math.min(1, progress))); };
    await conversion.execute();
    const data = (output.target as InstanceType<Mediabunny['BufferTarget']>).buffer;
    if (!data || data.byteLength === 0) throw new Error('the browser encoder returned no media bytes');
    return data;
  } finally {
    input.dispose();
  }
}

export async function compressVideoWithWebCodecs(file: File, onProgress?: (value: number) => void): Promise<WebCodecsResult> {
  if (!webCodecsSupported()) throw new WebCodecsUnavailable('WebCodecs is not available in this browser');
  const mb = await import('mediabunny');

  // 1. Already-small H.264 (+ AAC): copy the compressed streams into an MP4 without re-encoding. Near-instant.
  let remuxCandidate = false;
  try {
    const data = await convert(mb, file, async (videoTrack, audioTrack) => {
      const stats = await videoTrack.computePacketStats(120);
      remuxCandidate = canRemux({
        videoCodec: videoTrack.codec,
        width: await videoTrack.getDisplayWidth(),
        height: await videoTrack.getDisplayHeight(),
        fps: stats.averagePacketRate,
        videoBitrate: (await videoTrack.getAverageBitrate()) ?? stats.averageBitrate,
        audioCodec: audioTrack?.codec ?? null,
      });
      if (!remuxCandidate) throw new NotARemuxCandidate();
      return { video: {}, audio: {}, copy: { mode: 'forced' } };
    }, onProgress);
    return { data, engine: 'webcodecs-remux' };
  } catch (error) {
    if (error instanceof NotARemuxCandidate) {
      // Normal case: needs a real re-encode.
    } else if (remuxCandidate) {
      console.warn('[media] stream copy failed, re-encoding instead', error); // odd timestamps etc.
    } else {
      throw error; // e.g. no video track or undecodable audio: let the caller fall back to FFmpeg
    }
  }

  // 2. Re-encode: H.264 ≤ 720p, ≤ 30 fps, bitrate from the pixel rate; AAC audio is copied, anything else → AAC.
  const data = await convert(mb, file, async (videoTrack, audioTrack) => {
    const size = fitWithin(await videoTrack.getDisplayWidth(), await videoTrack.getDisplayHeight());
    const stats = await videoTrack.computePacketStats(120);
    const frameRate = targetFrameRate(stats.averagePacketRate);
    const sourceBitrate = (await videoTrack.getAverageBitrate()) ?? stats.averageBitrate;
    const bitrate = targetVideoBitrate(size, frameRate ?? stats.averagePacketRate, sourceBitrate);

    if (!(await videoTrack.canDecode())) throw new WebCodecsUnavailable(`this browser cannot decode ${videoTrack.codec ?? 'this'} video`);
    const quality = new mb.Quality({ bitrate, bitrateMode: 'variable' });
    if (!(await mb.canEncodeVideo('avc', { width: size.width, height: size.height, quality }))) {
      throw new WebCodecsUnavailable('this browser cannot encode H.264 at the target size');
    }

    // AAC is copied (no decoder or encoder needed). If a copy turns out to be impossible, Mediabunny discards the
    // track at init, which `convert` treats as "fall back to FFmpeg" rather than producing a silent video.
    let audio: import('mediabunny').ConversionAudioOptions = { codec: 'aac' };
    if (audioTrack) {
      if (audioTrack.codec !== 'aac') {
        // Only load the WASM AAC encoder when audio is actually re-encoded (and the browser has no native one).
        await ensureAacEncoder(mb);
        const channels = await audioTrack.getNumberOfChannels();
        const sampleRate = await audioTrack.getSampleRate();
        audio = {
          codec: 'aac',
          quality: new mb.Quality({ bitrate: VIDEO_POLICY.audioBitrate }),
          numberOfChannels: Math.min(VIDEO_POLICY.maxAudioChannels, channels),
          ...(sampleRate === 44_100 || sampleRate === 48_000 ? {} : { sampleRate: 48_000 }),
        };
      }
    }

    return {
      video: { codec: 'avc', width: size.width, height: size.height, fit: 'contain', frameRate, quality },
      audio,
    };
  }, onProgress);
  return { data, engine: 'webcodecs' };
}
