import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { calculateSavingsPercent, classifyMedia, compressionStatus, type MediaKind } from './media-formats';

export type { MediaKind };
export type MediaRecord = {
  id: string;
  name: string;
  kind: MediaKind;
  sourceFormat: string;
  outputFormat: string;
  originalMime: string;
  outputMime: string;
  compressionStatus: 'compressed' | 'passthrough';
  originalBytes: number;
  compressedBytes: number;
  savingsPercent: number;
  width: number | null;
  height: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  duration: number | null;
  createdAt: string;
  originalPath: string;
  compressedPath: string;
  conversionEngine: string | null;
  conversionMs: number | null;
  clientProcessingStatus: string | null;
  [legacyField: string]: unknown;
};

/**
 * Data directory. Defaults to the tracked `./data` folder so the DB (metrics/media.json) and the blobs
 * (media/<uuid>-original|compressed) can be committed and shared. Override with LOCAL_MEDIA_STORAGE_DIR.
 */
const root = path.resolve(process.env.LOCAL_MEDIA_STORAGE_DIR || path.join(process.cwd(), 'data'));
const mediaDir = path.join(root, 'media');
const metricsDir = path.join(root, 'metrics');
const dbPath = path.join(metricsDir, 'media.json');
let updateQueue: Promise<void> = Promise.resolve();

export function isSafeMediaId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id);
}

/** Portable, root-relative blob path stored in the DB (always forward slashes, never machine specific). */
export function blobRelativePath(id: string, suffix: 'original' | 'compressed'): string {
  if (!isSafeMediaId(id)) throw new Error('Invalid media identifier');
  return `media/${id}-${suffix}`;
}

function checkedMediaPath(id: string, suffix: 'original' | 'compressed'): string {
  if (!isSafeMediaId(id)) throw new Error('Invalid media identifier');
  return path.join(mediaDir, `${id}-${suffix}`);
}

async function ensureStorage() {
  await fs.mkdir(mediaDir, { recursive: true });
  await fs.mkdir(metricsDir, { recursive: true });
  try {
    await fs.writeFile(dbPath, '[]\n', { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

async function readRawRecords(): Promise<Record<string, unknown>[]> {
  await ensureStorage();
  const parsed: unknown = JSON.parse(await fs.readFile(dbPath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('Local media metrics file must contain a JSON array');
  return parsed.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
}

function compatibilityRecord(raw: Record<string, unknown>): MediaRecord {
  const name = typeof raw.name === 'string' ? raw.name : 'unknown';
  const kind = raw.kind === 'video' ? 'video' : raw.kind === 'image' ? 'image' : (classifyMedia(name, '')?.kind ?? 'image');
  const bytes = Number.isFinite(Number(raw.originalBytes)) ? Number(raw.originalBytes) : 0;
  const outputBytes = Number.isFinite(Number(raw.compressedBytes)) ? Number(raw.compressedBytes) : 0;
  const inferred = classifyMedia(name, '');
  const originalMime = typeof raw.originalMime === 'string' && raw.originalMime
    ? raw.originalMime
    : inferred?.sourceMime ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg');
  const fallbackStatus = compressionStatus(bytes, outputBytes);
  const status = raw.compressionStatus === 'compressed' || raw.compressionStatus === 'passthrough'
    ? raw.compressionStatus
    : fallbackStatus;
  const outputMime = typeof raw.outputMime === 'string' && raw.outputMime
    ? raw.outputMime
    : kind === 'video' && status === 'passthrough'
      ? originalMime
      : kind === 'video' ? 'video/mp4' : 'image/webp';

  return {
    ...raw,
    id: typeof raw.id === 'string' ? raw.id : '',
    name,
    kind,
    sourceFormat: typeof raw.sourceFormat === 'string' ? raw.sourceFormat : (inferred?.sourceFormat ?? 'UNKNOWN'),
    outputFormat: typeof raw.outputFormat === 'string' ? raw.outputFormat : (kind === 'video' ? 'MP4' : 'WEBP'),
    originalMime,
    outputMime,
    compressionStatus: status,
    originalBytes: bytes,
    compressedBytes: outputBytes,
    savingsPercent: Number.isFinite(Number(raw.savingsPercent)) ? Number(raw.savingsPercent) : calculateSavingsPercent(bytes, outputBytes),
    width: Number.isFinite(Number(raw.width)) && Number(raw.width) > 0 ? Number(raw.width) : null,
    height: Number.isFinite(Number(raw.height)) && Number(raw.height) > 0 ? Number(raw.height) : null,
    outputWidth: Number.isFinite(Number(raw.outputWidth)) && Number(raw.outputWidth) > 0 ? Number(raw.outputWidth) : null,
    outputHeight: Number.isFinite(Number(raw.outputHeight)) && Number(raw.outputHeight) > 0 ? Number(raw.outputHeight) : null,
    duration: Number.isFinite(Number(raw.duration)) && Number(raw.duration) > 0 ? Number(raw.duration) : null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
    // Blob locations are derived from the id, so legacy absolute paths (e.g. C:\Users\...) become portable.
    originalPath: typeof raw.id === 'string' && isSafeMediaId(raw.id) ? blobRelativePath(raw.id, 'original') : '',
    compressedPath: typeof raw.id === 'string' && isSafeMediaId(raw.id) ? blobRelativePath(raw.id, 'compressed') : '',
    conversionEngine: typeof raw.conversionEngine === 'string' ? raw.conversionEngine : null,
    conversionMs: Number.isFinite(Number(raw.conversionMs)) && Number(raw.conversionMs) >= 0 ? Number(raw.conversionMs) : null,
    clientProcessingStatus: typeof raw.clientProcessingStatus === 'string' ? raw.clientProcessingStatus : null,
  };
}

export async function listMedia(): Promise<MediaRecord[]> {
  return (await readRawRecords()).map(compatibilityRecord);
}

async function writeRecordsAtomically(records: Record<string, unknown>[]) {
  const temporaryPath = path.join(metricsDir, `.media-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, dbPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function saveMedia(record: MediaRecord): Promise<MediaRecord> {
  if (!isSafeMediaId(record.id)) return Promise.reject(new Error('Invalid media identifier'));
  const operation = updateQueue.then(async () => {
    const records = await readRawRecords();
    records.unshift(record as unknown as Record<string, unknown>);
    await writeRecordsAtomically(records);
    return record;
  });
  updateQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function writeBlob(id: string, suffix: 'original' | 'compressed', buffer: Buffer): Promise<string> {
  await ensureStorage();
  const target = checkedMediaPath(id, suffix);
  await fs.writeFile(target, buffer, { flag: 'wx' });
  return blobRelativePath(id, suffix);
}

export async function removeBlob(id: string, suffix: 'original' | 'compressed'): Promise<void> {
  const target = checkedMediaPath(id, suffix);
  await fs.rm(target, { force: true });
}

export function getMediaPath(id: string, suffix: 'original' | 'compressed'): string {
  return checkedMediaPath(id, suffix);
}
