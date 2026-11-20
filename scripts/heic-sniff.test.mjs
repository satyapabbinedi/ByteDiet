import assert from 'node:assert/strict';
import test from 'node:test';
import { isHeifFile } from '../lib/heic.ts';

function ftyp(major, ...compatible) {
  const brands = [major, '\0\0\0\0', ...compatible];
  const bytes = new Uint8Array(8 + brands.length * 4);
  new DataView(bytes.buffer).setUint32(0, bytes.length);
  bytes.set(new TextEncoder().encode('ftyp'), 4);
  brands.forEach((brand, index) => bytes.set(new TextEncoder().encode(brand), 8 + index * 4));
  return new Blob([bytes, new Uint8Array(64)]);
}

test('HEIC/HEIF brands are detected from bytes regardless of file name', async () => {
  assert.equal(await isHeifFile(ftyp('heic', 'mif1')), true);
  assert.equal(await isHeifFile(ftyp('mif1', 'heic')), true);
  assert.equal(await isHeifFile(ftyp('heix')), true);
});

test('AVIF, MP4 and non-ISO-BMFF data are not treated as HEIF', async () => {
  assert.equal(await isHeifFile(ftyp('avif', 'mif1')), false);
  assert.equal(await isHeifFile(ftyp('isom', 'mp42')), false);
  assert.equal(await isHeifFile(new Blob([new Uint8Array(100).fill(7)])), false);
  assert.equal(await isHeifFile(new Blob([])), false);
});
