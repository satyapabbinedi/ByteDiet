import assert from 'node:assert/strict';
import { test } from 'node:test';

const { mediaPreviewKey } = await import('../lib/media-preview-key.ts').catch(() => ({}));

test('video preview identity changes when the selected record or variant changes', () => {
  assert.equal(typeof mediaPreviewKey, 'function');
  assert.notEqual(mediaPreviewKey('video-one', 'original'), mediaPreviewKey('video-two', 'original'));
  assert.notEqual(mediaPreviewKey('video-one', 'original'), mediaPreviewKey('video-one', 'compressed'));
});
