import assert from 'node:assert/strict';
import { test } from 'node:test';

const { formatProcessingDuration } = await import('../lib/format-duration.ts').catch(() => ({}));

test('formats sub-second processing durations in milliseconds', () => {
  assert.equal(formatProcessingDuration?.(650), '650 ms');
});

test('formats processing durations under one minute in seconds', () => {
  assert.equal(formatProcessingDuration?.(1234), '1.23 sec');
});

test('formats processing durations over one minute as minutes and seconds', () => {
  assert.equal(formatProcessingDuration?.(610916), '10 min 11 sec');
});

test('marks unavailable or invalid processing durations clearly', () => {
  assert.equal(formatProcessingDuration?.(null), 'time unavailable');
  assert.equal(formatProcessingDuration?.(-1), 'time unavailable');
});
