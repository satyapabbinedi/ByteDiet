import { NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import { getMediaPath, listMedia } from '@/lib/local-media';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await params;
  if (variant !== 'original' && variant !== 'compressed') return new NextResponse('Not found', { status: 404 });
  try {
    const record = (await listMedia()).find(item => item.id === id);
    if (!record) return new NextResponse('Not found', { status: 404 });
    const filePath = getMediaPath(id, variant);
    const fileStat = await fs.stat(filePath);
    const length = fileStat.size;
    const contentType = variant === 'original' ? record.originalMime : record.outputMime;
    const headers = new Headers({ 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable' });
    const range = _request.headers.get('range');
    const match = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (match && (match[1] || match[2])) {
      let start: number;
      let end: number;
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : length - 1;
      } else {
        const suffixLength = Number(match[2]);
        start = suffixLength > 0 ? Math.max(0, length - suffixLength) : length;
        end = length - 1;
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= length || start > end) {
        headers.set('Content-Range', `bytes */${length}`);
        return new NextResponse(null, { status: 416, headers });
      }
      end = Math.min(end, length - 1);
      headers.set('Content-Range', `bytes ${start}-${end}/${length}`);
      headers.set('Content-Length', String(end - start + 1));
      const body = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
      return new NextResponse(body, { status: 206, headers });
    }
    headers.set('Content-Length', String(length));
    const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new NextResponse(body, { headers });
  } catch { return new NextResponse('Not found', { status: 404 }); }
}
