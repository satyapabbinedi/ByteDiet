import assert from 'node:assert/strict';
import { test } from 'node:test';

const { VIDEO_POLICY, fitWithin, targetFrameRate, targetVideoBitrate, canRemux, ffmpegScaleFilter } = await import('../lib/video-encoding.ts');

test('caps the long edge at 720p for landscape and portrait, preserving aspect ratio', () => {
  assert.deepEqual(fitWithin(3840, 2160), { width: 1280, height: 720 });
  assert.deepEqual(fitWithin(1920, 1080), { width: 1280, height: 720 });
  assert.deepEqual(fitWithin(1080, 1920), { width: 720, height: 1280 });
});

test('never upscales and always returns even dimensions', () => {
  assert.deepEqual(fitWithin(640, 360), { width: 640, height: 360 });
  assert.deepEqual(fitWithin(641, 361), { width: 640, height: 360 });
  assert.deepEqual(fitWithin(2560, 1440), { width: 1280, height: 720 });
  const odd = fitWithin(1919, 1079);
  assert.equal(odd.width % 2, 0);
  assert.equal(odd.height % 2, 0);
  assert.throws(() => fitWithin(0, 100));
});

test('reduces high frame rates to 30 fps but keeps 30.x variable-rate phone video', () => {
  assert.equal(targetFrameRate(59.94), 30);
  assert.equal(targetFrameRate(120), 30);
  assert.equal(targetFrameRate(30.4), undefined);
  assert.equal(targetFrameRate(24), undefined);
  assert.equal(targetFrameRate(null), undefined);
  assert.equal(targetFrameRate(Number.NaN), undefined);
});

test('targets ~1.9 Mbps for 720p30 and never exceeds 90% of the source bitrate', () => {
  const hd = targetVideoBitrate({ width: 1280, height: 720 }, 30);
  assert.ok(hd > 1_800_000 && hd < 2_000_000, `got ${hd}`);
  assert.equal(targetVideoBitrate({ width: 1280, height: 720 }, 30, 1_000_000), 900_000);
  assert.ok(targetVideoBitrate({ width: 1280, height: 720 }, 60) === hd, '60 fps input is budgeted as 30 fps output');
  assert.ok(targetVideoBitrate({ width: 160, height: 90 }, 30) >= VIDEO_POLICY.minVideoBitrate);
});

test('remuxes only small H.264 with AAC or no audio', () => {
  const small = { videoCodec: 'avc', width: 1280, height: 720, fps: 30, videoBitrate: 1_500_000, audioCodec: 'aac' };
  assert.equal(canRemux(small), true);
  assert.equal(canRemux({ ...small, audioCodec: null }), true);
  assert.equal(canRemux({ ...small, videoCodec: 'hevc' }), false, 'HEVC must be re-encoded for compatibility');
  assert.equal(canRemux({ ...small, audioCodec: 'opus' }), false);
  assert.equal(canRemux({ ...small, width: 1920, height: 1080 }), false, 'over the size cap');
  assert.equal(canRemux({ ...small, fps: 60 }), false, 'over the frame-rate cap');
  assert.equal(canRemux({ ...small, videoBitrate: 8_000_000 }), false, 'too many bits');
  assert.equal(canRemux({ ...small, videoBitrate: null }), false, 'unknown bitrate is not trusted');
});

test('FFmpeg scale filter applies the same 1280 px box', () => {
  assert.equal(ffmpegScaleFilter(), 'scale=min(1280\\,iw):min(1280\\,ih):force_original_aspect_ratio=decrease:force_divisible_by=2');
});
