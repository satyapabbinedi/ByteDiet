export type MediaPreviewVariant = 'original' | 'compressed';

export function mediaPreviewKey(recordId: string, variant: MediaPreviewVariant): string {
  return `${recordId}:${variant}`;
}
