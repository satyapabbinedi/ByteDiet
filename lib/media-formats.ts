export type MediaKind = 'image' | 'video';

const VIDEO_EXTENSIONS: Record<string, string> = {
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

export type MediaClassification = {
  kind: MediaKind;
  sourceMime: string;
  sourceFormat: string;
  extension: string;
};

export function extensionOf(filename: string): string {
  const leaf = filename.split(/[\\/]/).pop() ?? '';
  const dot = leaf.lastIndexOf('.');
  return dot > 0 && dot < leaf.length - 1 ? leaf.slice(dot + 1).toLowerCase() : '';
}

export function classifyMedia(filename: string, reportedMime: string): MediaClassification | null {
  const extension = extensionOf(filename);
  const mappedMime = VIDEO_EXTENSIONS[extension] ?? IMAGE_EXTENSIONS[extension];
  if (mappedMime) {
    return {
      kind: mappedMime.startsWith('video/') ? 'video' : 'image',
      sourceMime: mappedMime,
      sourceFormat: extension.toUpperCase(),
      extension,
    };
  }

  const mime = reportedMime.split(';', 1)[0].trim().toLowerCase();
  const slash = mime.indexOf('/');
  if (slash <= 0 || slash === mime.length - 1) return null;
  const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : null;
  if (!kind) return null;
  return {
    kind,
    sourceMime: mime,
    sourceFormat: mime.slice(slash + 1).toUpperCase(),
    extension,
  };
}

export function isExpectedOutput(kind: MediaKind, filename: string, mime: string): boolean {
  const extension = extensionOf(filename);
  const normalizedMime = mime.split(';', 1)[0].trim().toLowerCase();
  return kind === 'image'
    ? extension === 'webp' && normalizedMime === 'image/webp'
    : extension === 'mp4' && normalizedMime === 'video/mp4';
}

export function calculateSavingsPercent(originalBytes: number, outputBytes: number): number {
  if (!Number.isFinite(originalBytes) || originalBytes <= 0 || !Number.isFinite(outputBytes) || outputBytes < 0) return 0;
  return Math.max(0, (1 - outputBytes / originalBytes) * 100);
}

export function compressionStatus(originalBytes: number, outputBytes: number): 'compressed' | 'passthrough' {
  return outputBytes < originalBytes ? 'compressed' : 'passthrough';
}
