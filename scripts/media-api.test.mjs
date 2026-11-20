import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { File } from 'node:buffer';

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'media-lab-contract-'));
const originalCwd = process.cwd();
process.chdir(tempRoot);
const storageRoot = path.join(tempRoot, 'storage');
process.env.LOCAL_MEDIA_STORAGE_DIR = storageRoot;
const { POST } = await import('../app/api/media/route.ts');
const { GET: getVariant } = await import('../app/api/media/[id]/[variant]/route.ts');

after(async () => {
  process.chdir(originalCwd);
  await rm(tempRoot, { recursive: true, force: true });
});

function mediaFile(name, type, bytes) {
  return new File([Buffer.from(bytes)], name, { type });
}

function uploadForm({ original, compressed, metadata = {} } = {}) {
  const form = new FormData();
  if (original) form.append('original', original);
  if (compressed) form.append('compressed', compressed);
  for (const [key, value] of Object.entries(metadata)) form.set(key, String(value));
  return form;
}

function post(form) {
  return POST(new Request('http://local.test/api/media', { method: 'POST', body: form }));
}

async function readRecords() {
  try {
    return JSON.parse(await readFile(path.join(storageRoot, 'metrics', 'media.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function variant(record, name, headers = {}) {
  return getVariant(new Request(`http://local.test/api/media/${record.id}/${name}`, { headers }), {
    params: Promise.resolve({ id: record.id, variant: name }),
  });
}

test('missing original is rejected without creating local media storage', async () => {
  const response = await post(uploadForm({ compressed: mediaFile('out.webp', 'image/webp', [1]) }));
  assert.equal(response.status, 400);
  await assert.rejects(stat(storageRoot), { code: 'ENOENT' });
});

test('missing output is rejected without creating local media storage', async () => {
  const response = await post(uploadForm({ original: mediaFile('in.png', 'image/png', [1]) }));
  assert.equal(response.status, 400);
  await assert.rejects(stat(storageRoot), { code: 'ENOENT' });
});

test('valid upload persists both received byte streams exactly and retains original/output MIME', async () => {
  const originalBytes = Buffer.from([0, 255, 1, 2, 128, 10]);
  const outputBytes = Buffer.from([255, 0, 17, 99]);
  const response = await post(uploadForm({
    original: mediaFile('clip.mov', 'video/quicktime', originalBytes),
    compressed: mediaFile('clip.mp4', 'video/mp4', outputBytes),
    metadata: { width: 640, height: 360, outputWidth: 640, outputHeight: 360, duration: 2.5, conversionEngine: 'ffmpeg.wasm', conversionMs: 1234, clientProcessingStatus: 'completed' },
  }));
  assert.equal(response.status, 201);
  const { record } = await response.json();
  assert.equal(record.kind, 'video');
  assert.equal(record.sourceFormat, 'MOV');
  assert.equal(record.originalMime, 'video/quicktime');
  assert.equal(record.outputFormat, 'MP4');
  assert.equal(record.outputMime, 'video/mp4');
  assert.deepEqual(await readFile(path.join(storageRoot, 'media', `${record.id}-original`)), originalBytes);
  assert.deepEqual(await readFile(path.join(storageRoot, 'media', `${record.id}-compressed`)), outputBytes);
  // The DB stores portable, root-relative paths so a committed data/ folder works on any machine/OS.
  assert.equal(record.originalPath, `media/${record.id}-original`);
  assert.equal(record.compressedPath, `media/${record.id}-compressed`);
  const persisted = (await readRecords()).find(item => item.id === record.id);
  assert.equal(persisted.originalPath, `media/${record.id}-original`);

  const originalResponse = await variant(record, 'original');
  assert.equal(originalResponse.headers.get('content-type'), 'video/quicktime');
  assert.deepEqual(Buffer.from(await originalResponse.arrayBuffer()), originalBytes);
  const outputResponse = await variant(record, 'compressed');
  assert.equal(outputResponse.headers.get('content-type'), 'video/mp4');
  assert.deepEqual(Buffer.from(await outputResponse.arrayBuffer()), outputBytes);
});

test('recognized media extension determines kind and MIME when the supplied MIME is inaccurate', async () => {
  const response = await post(uploadForm({
    original: mediaFile('camera.mov', 'image/jpeg', [1, 2, 3]),
    compressed: mediaFile('camera.mp4', 'video/mp4', [4, 5]),
  }));
  assert.equal(response.status, 201);
  const { record } = await response.json();
  assert.equal(record.kind, 'video');
  assert.equal(record.sourceFormat, 'MOV');
  assert.equal(record.originalMime, 'video/quicktime');
});

test('empty MIME with a recognized AVI extension is classified as video', async () => {
  const response = await post(uploadForm({
    original: mediaFile('legacy.avi', '', [1, 2, 3]),
    compressed: mediaFile('legacy.mp4', 'video/mp4', [4, 5]),
  }));
  assert.equal(response.status, 201);
  const { record } = await response.json();
  assert.equal(record.kind, 'video');
  assert.equal(record.sourceFormat, 'AVI');
  assert.equal(record.originalMime, 'video/x-msvideo');
});

test('invalid output type is rejected without adding records or blobs', async () => {
  const before = await readRecords();
  const response = await post(uploadForm({
    original: mediaFile('photo.png', 'image/png', [1, 2, 3]),
    compressed: mediaFile('photo.jpg', 'image/jpeg', [4, 5]),
  }));
  assert.equal(response.status, 400);
  assert.equal((await readRecords()).length, before.length);
});

test('savings are derived precisely from bytes and larger converted bytes are preserved as passthrough', async () => {
  const exactResponse = await post(uploadForm({
    original: mediaFile('exact.png', 'image/png', Buffer.alloc(1000, 1)),
    compressed: mediaFile('exact.webp', 'image/webp', Buffer.alloc(250, 2)),
  }));
  assert.equal(exactResponse.status, 201);
  const { record: exact } = await exactResponse.json();
  assert.equal(exact.savingsPercent, 75);
  assert.equal(exact.compressionStatus, 'compressed');

  const originalBytes = Buffer.alloc(80, 3);
  const convertedCandidate = Buffer.alloc(120, 4);
  const largerResponse = await post(uploadForm({
    original: mediaFile('larger.png', 'image/png', originalBytes),
    compressed: mediaFile('larger.webp', 'image/webp', convertedCandidate),
  }));
  assert.equal(largerResponse.status, 201);
  const { record: larger } = await largerResponse.json();
  assert.equal(larger.savingsPercent, 0);
  assert.equal(larger.compressionStatus, 'passthrough');
  const storedOutput = await readFile(path.join(storageRoot, 'media', `${larger.id}-compressed`));
  assert.notDeepEqual(storedOutput, originalBytes);
  assert.deepEqual(storedOutput, convertedCandidate);
  const streamedOutput = await variant(larger, 'compressed');
  assert.deepEqual(Buffer.from(await streamedOutput.arrayBuffer()), convertedCandidate);
});

test('single byte ranges return the exact requested bytes with correct response headers', async () => {
  const record = (await readRecords())[0];
  const bytes = await readFile(path.join(storageRoot, 'media', `${record.id}-compressed`));
  const response = await variant(record, 'compressed', { Range: 'bytes=1-2' });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), `bytes 1-2/${bytes.length}`);
  assert.equal(response.headers.get('content-length'), '2');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes.subarray(1, 3));
});

test('unsatisfiable ranges return 416 with the complete representation length', async () => {
  const record = (await readRecords())[0];
  const bytes = await readFile(path.join(storageRoot, 'media', `${record.id}-compressed`));
  const response = await variant(record, 'compressed', { Range: `bytes=${bytes.length}-` });
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('content-range'), `bytes */${bytes.length}`);
});

test('malformed and multi-range headers are ignored and return the full representation', async () => {
  const record = (await readRecords())[0];
  const bytes = await readFile(path.join(storageRoot, 'media', `${record.id}-compressed`));
  for (const header of ['not-a-range', 'bytes=0-1,3-4']) {
    const response = await variant(record, 'compressed', { Range: header });
    assert.equal(response.status, 200, header);
    assert.equal(response.headers.get('content-range'), null, header);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes, header);
  }
});

test('open-ended and suffix byte ranges return the requested tail of a stored stream', async () => {
  const record = (await readRecords())[0];
  const bytes = await readFile(path.join(storageRoot, 'media', `${record.id}-compressed`));
  const openEnded = await variant(record, 'compressed', { Range: 'bytes=2-' });
  assert.equal(openEnded.status, 206);
  assert.equal(openEnded.headers.get('content-range'), `bytes 2-${bytes.length - 1}/${bytes.length}`);
  assert.deepEqual(Buffer.from(await openEnded.arrayBuffer()), bytes.subarray(2));
  const suffix = await variant(record, 'compressed', { Range: 'bytes=-3' });
  assert.equal(suffix.status, 206);
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()), bytes.subarray(-3));
  const full = await variant(record, 'compressed');
  assert.equal(full.headers.get('content-length'), String(bytes.length));
});

test('legacy records with absolute machine-specific paths are exposed with portable paths', async () => {
  const { writeFile } = await import('node:fs/promises');
  const { listMedia } = await import('../lib/local-media.ts');
  const records = await readRecords();
  const legacy = { ...records[0], id: 'legacy-win', originalPath: 'C:\Users\someone\storage\media\legacy-win-original', compressedPath: '/Users/someone/storage/media/legacy-win-compressed' };
  await writeFile(path.join(storageRoot, 'metrics', 'media.json'), JSON.stringify([legacy, ...records]));
  const listed = (await listMedia()).find(item => item.id === 'legacy-win');
  assert.equal(listed.originalPath, 'media/legacy-win-original');
  assert.equal(listed.compressedPath, 'media/legacy-win-compressed');
});
