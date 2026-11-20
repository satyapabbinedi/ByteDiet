import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { classifyMedia, compressionStatus, calculateSavingsPercent, isExpectedOutput } from '@/lib/media-formats';
import { listMedia, removeBlob, saveMedia, writeBlob, type MediaKind } from '@/lib/local-media';

export const runtime = 'nodejs';

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== 'undefined' && value instanceof File;
}

function positiveNumber(value: FormDataEntryValue | null, integerOnly = false): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || (integerOnly && !Number.isInteger(parsed))) return null;
  return parsed;
}

function nonnegativeNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalText(value: FormDataEntryValue | null, maxLength = 160): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

export async function GET() {
  return NextResponse.json({ records: await listMedia() });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'The upload must be a valid multipart form.' }, { status: 400 });
  }

  const original = form.get('original');
  const compressed = form.get('compressed');
  if (!isFile(original) || !isFile(compressed) || original.size === 0 || compressed.size === 0) {
    return NextResponse.json({ error: 'Both non-empty original and browser-converted media files are required.' }, { status: 400 });
  }

  const classification = classifyMedia(original.name, original.type);
  if (!classification) {
    return NextResponse.json({ error: 'The original filename or MIME type is not a supported image or video.' }, { status: 400 });
  }
  if (!isExpectedOutput(classification.kind, compressed.name, compressed.type)) {
    const expected = classification.kind === 'image' ? '.webp / image/webp' : '.mp4 / video/mp4';
    return NextResponse.json({ error: `Converted ${classification.kind} output must be ${expected}.` }, { status: 400 });
  }

  const id = randomUUID();
  let originalPath: string | undefined;
  let compressedPath: string | undefined;
  try {
    const originalBuffer = Buffer.from(await original.arrayBuffer());
    const compressedBuffer = Buffer.from(await compressed.arrayBuffer());
    if (!originalBuffer.length || !compressedBuffer.length) {
      return NextResponse.json({ error: 'Both original and converted files must contain media bytes.' }, { status: 400 });
    }

    originalPath = await writeBlob(id, 'original', originalBuffer);
    compressedPath = await writeBlob(id, 'compressed', compressedBuffer);
    const originalBytes = originalBuffer.byteLength;
    const compressedBytes = compressedBuffer.byteLength;
    const outputFormat = classification.kind === 'image' ? 'WEBP' : 'MP4';
    const record = await saveMedia({
      id,
      name: original.name,
      kind: classification.kind as MediaKind,
      sourceFormat: classification.sourceFormat,
      outputFormat,
      originalMime: classification.sourceMime,
      outputMime: classification.kind === 'image' ? 'image/webp' : 'video/mp4',
      compressionStatus: compressionStatus(originalBytes, compressedBytes),
      originalBytes,
      compressedBytes,
      savingsPercent: calculateSavingsPercent(originalBytes, compressedBytes),
      width: positiveNumber(form.get('width'), true),
      height: positiveNumber(form.get('height'), true),
      outputWidth: positiveNumber(form.get('outputWidth'), true),
      outputHeight: positiveNumber(form.get('outputHeight'), true),
      duration: positiveNumber(form.get('duration')),
      createdAt: new Date().toISOString(),
      originalPath,
      compressedPath,
      conversionEngine: optionalText(form.get('conversionEngine')),
      conversionMs: nonnegativeNumber(form.get('conversionMs')),
      clientProcessingStatus: optionalText(form.get('clientProcessingStatus'), 48),
    });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    await Promise.all([
      originalPath ? removeBlob(id, 'original') : Promise.resolve(),
      compressedPath ? removeBlob(id, 'compressed') : Promise.resolve(),
    ]);
    const message = error instanceof Error ? error.message : 'Local storage failed.';
    return NextResponse.json({ error: `Could not persist media locally: ${message}` }, { status: 500 });
  }
}
